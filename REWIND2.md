# Rewind2

This file explains the current Rewind2 design in simple language.

It is not meant to be a formal spec. It is a human guide to how the app thinks
about Rewind2 today.

## Short version

Rewind2 changes the vault design in four big ways:

1. It uses a P2A anchor on the trigger and rescue transactions, so they can be fee-bumped with a child transaction.
2. It adds a dedicated per-vault trigger reserve, funded when the vault is created.
3. It adds a dedicated per-vault backup output, so the wallet can publish an encrypted on-chain backup of the trigger and rescue transactions.
4. It treats trigger and rescue fee bumping differently:
   - trigger bumping uses that vault's dedicated reserve only
   - rescue starts as a high-fee parent tx and only uses a separate temporary
     in-memory bump wallet if that later becomes necessary

## Names used here

- `trigger`: start unfreezing the vault
- `rescue`: send funds to the emergency address
- `panic`: same idea as `rescue`; some parts of the code still use the older `panic` name
- `P2A anchor`: a small output whose only job is to let a child transaction attach and pay more fee
- `CPFP child`: the child transaction used to bump the fee of a parent transaction

## Main idea

Each Rewind2 vault is built around one main flow:

1. Create the vault.
2. If needed, broadcast the trigger transaction.
3. While waiting, either:
   - spend from the trigger path after the delay, or
   - broadcast the rescue transaction immediately.
4. If fees are too low:
   - trigger can attach a child transaction using its dedicated reserve
   - rescue is expected to work as a single high-fee parent tx, and only uses a
     child later if a temporary in-memory rescue reserve wallet is funded

The important design choice is that trigger bumping is deterministic and
per-vault, while rescue is designed to succeed as a high-fee parent first and
only use a separate emergency bump input if that later becomes necessary.

## Deterministic paths

Rewind2 uses a few internal derivation paths:

- `m/1073'/coin_type'/0'/<vaultIndex>`
  Used for per-vault identity and backup-related material.

- `m/1073'/coin_type'/1'/0`
  Used for the wallet-level encryption key that protects app storage.

- `m/1073'/coin_type'/2'/<vaultIndex>`
  Used for that vault's dedicated trigger reserve output.

The important point is that the trigger reserve is one path per vault. It is
not shared across vaults.

## Transactions in Rewind2

### 1. Vault transaction

This is the transaction the wallet creates when the vault is set up.

Shape:

```text
wallet UTXOs
  -> [0] vault output
  -> [1] backup output
  -> [2] trigger reserve output
  -> [3] wallet change (optional)
```

What each output does:

- `vault output`
  The actual frozen funds.

- `backup output`
  A dedicated output that can later be spent into an on-chain backup tx.

- `trigger reserve output`
  A dedicated output reserved only for fee-bumping that vault's trigger tx.

- `wallet change`
  Normal wallet change if needed.

Two important consequences:

- the vault amount shown to the user is the vault output only
- the maximum vaultable amount is lower, because the wallet also has to fund the backup output, the trigger reserve, and the vault tx fee

### 2. Trigger transaction

The trigger transaction spends the vault output and starts the unfreeze flow.

Shape:

```text
vault output
  -> [0] trigger output
  -> [1] P2A anchor
```

The trigger output is a script with two spending paths:

- a delayed hot-wallet path after `lockBlocks`
- an immediate rescue path used by the presigned rescue tx

The P2A anchor is there only so the trigger can be fee-bumped later.

### 3. Hot spend after the delay

This is not a presigned transaction.

Once the trigger delay has passed, the user can spend the trigger output through
the hot-wallet path like a normal spend.

### 4. Rescue transaction

The rescue transaction spends the trigger output immediately and sends the funds
to the emergency address.

Shape:

```text
trigger output
  -> [0] emergency address
  -> [1] P2A anchor
```

Again, the anchor is there only so rescue can be fee-bumped later if needed.

### 5. Trigger fee-bump child

If the trigger tx needs more fee, Rewind2 builds a child transaction.

Shape:

```text
inputs:
- trigger P2A anchor
- all discovered trigger reserve UTXOs for this vault

output:
- normal wallet change
```

Important design choices:

- trigger bumping is per-vault
- it uses only that vault's dedicated trigger reserve
- it does not coinselect from generic wallet UTXOs
- it does not coinselect among reserve UTXOs
- it spends every known trigger reserve UTXO for that action
- the reserve itself stays outside normal wallet flow
- only the child leftover comes back as normal wallet change

If the child is later accelerated again, the replacement still uses the same
reserve set. The old child is replaced in the mempool; it is not a new flow with
a different coinselected reserve subset.

### 6. Rescue fee-bump child

If the rescue tx still needs more fee after its large presigned fee, Rewind2 can
build a child transaction.

Shape:

```text
inputs:
- rescue P2A anchor
- all temporary rescue reserve UTXOs prepared for this bump

output:
- temporary rescue wallet internal/change
```

This is intentionally different from trigger bumping.

Today rescue does not use normal wallet UTXOs for fee bumping.

The current model is:

- by default, the rescue parent is already presigned with a high fee rate
- in most cases that should be enough, so rescue can be a single tx
- if that still is not enough, the app can create a fresh temporary software
  `P2WPKH` wallet in memory, or import a previously written temporary rescue
  reserve phrase, and ask the user to fund it for one rescue bump
- when creating a new temporary rescue reserve wallet, the app shows the seed
  first, makes the user confirm it was written down, and warns the user not to
  leave this wallet because the temporary rescue reserve wallet is not persisted
- when importing, the app re-derives the same in-memory reserve signer and
  funding address from the temporary rescue reserve phrase
- the app then shows one funding address and the exact currently needed amount
- if the vault mode is `P2A_TRUC`, the reserve funding tx must confirm before
  the rescue bump child can use it
- the rescue child spends the full temporary reserve set prepared for that bump,
  not a coinselected subset

A reserve source is a `P2WPKH` signer/output set dedicated to fee-bumping one
action type. Reserve funds are not normal spendable wallet balance. When Rewind
uses reserve funds in a P2A child, it spends every known usable reserve UTXO for
that action; it does not coinselect within the reserve set.

For trigger, the reserve source is controlled by the main hot wallet signer on
the per-vault trigger reserve branch, and child change goes to an internal
address of the main hot wallet.

For rescue, the reserve source is the temporary in-memory rescue reserve wallet,
and child change goes to an internal/change address of that same temporary
wallet.

Why Rewind2 starts rescue with a large fee by default:

- if the user is pressing the panic button, we must assume the hot wallet may be
  compromised already
- in that situation, asking the user to first fund another tx from the same
  wallet is a bad default
- a high-fee presigned rescue gives the best chance that the user can simply
  broadcast one transaction and be done
- only in rare extreme-fee situations should the app need to ask for a separate
  emergency bump input later

That later bump flow is separate from the normal wallet on purpose. If rescue is
needed, the hot wallet may already be compromised, so its ordinary UTXOs are not
trusted for fee bumping, and the temporary rescue reserve wallet should not be
stored as normal app state.

### 7. On-chain backup transaction

The backup output from the vault tx can later be spent into a transaction with
an `OP_RETURN` output that stores encrypted backup data.

That backup data contains the trigger and rescue transactions for that vault.

Shape:

```text
backup output
  -> OP_RETURN(encrypted trigger tx + encrypted rescue tx)
```

The goal is simple: if local wallet state is lost, the vault still has a way to
reveal the important presigned transactions on-chain.

## Vault modes

In code there are three vault modes:

- `LADDERED`
- `P2A_TRUC`
- `P2A_NON_TRUC`

Rewind2 itself uses `P2A_TRUC` or `P2A_NON_TRUC`.

`LADDERED` is only for older vaults created before Rewind2.

Human shorthand in this document still says `TRUC` / `NON_TRUC`, because those
are the underlying package styles. The code-level mode names are just more
explicit about the fact that these are the P2A fee-bump variants.

### TRUC

Human rule of thumb:

- trigger/rescue parents use version `3`
- the trigger P2A anchor value is `0 sats`
- the rescue P2A anchor is funded/non-dust when rescue pays a direct parent fee

Why this matters:

- TRUC allows modern package relay behavior
- but it comes with tighter policy constraints for the child transaction

In the current code, the trigger/rescue fee-bump child must stay within the
TRUC size limit. If the child becomes too large, the plan is rejected.

### NON_TRUC

Human rule of thumb:

- trigger/rescue parents use version `2`
- the P2A anchor value is `241 sats`

Why this matters:

- the anchor itself contributes some value to the fee-bump child
- but the parent also has to give up those anchor sats up front

## Parent fee policy

Today the parent transactions are funded like this:

- `P2A_TRUC` trigger parent fee is based on `P2A_TRUC_PRESIGNED_TRIGGER_FEERATE`, which must be `0` because its 0-sat P2A anchor is dust
- `P2A_NON_TRUC` trigger parent fee is based on `P2A_NON_TRUC_PRESIGNED_TRIGGER_FEERATE`
- rescue parent fee is based on `PRESIGNED_RESCUE_FEERATE`

So rescue is still presigned with an explicit high fee-rate setting, while a
`P2A_TRUC` trigger relies on its CPFP child for package fee.

## Trigger reserve

Each vault gets one dedicated trigger reserve output.

Why it exists:

- so the trigger can always be fee-bumped without depending on unrelated wallet UTXOs
- so one vault's trigger bump does not steal funds from another vault
- so the reserve can stay outside normal wallet spending while the bump child
  returns leftover value to the wallet's usual change flow

What it is not:

- it is not part of the normal hot-wallet spendable set
- it is not a rescue reserve
- it is not protection against a full hot-wallet compromise

The reserve amount is not chosen by hand. It is derived from:

- the size of the trigger parent
- the expected size of the fee-bump child
- the presigned trigger parent fee
- the target maximum trigger package feerate (`MAX_TRIGGER_FEERATE`)
- the dust floor of the child change output

In plain language: the reserve is sized so the wallet can attach one trigger
fee-bump child and still leave a valid change output.

## Fee bumping in Rewind2

Rewind2 talks about the fee rate of the whole package, not just the parent.

That means:

```text
effective package feerate = (parent fee + child fee) / (parent vsize + child vsize)
```

This matters for trigger fee bumping, and also for rescue if the optional
emergency bump path is used.

## Replacement rules

Replacing an existing fee-bump child is stricter than just "pay more fee rate".

For a replacement to be accepted, two things must be true:

1. the new package feerate must be higher than the old one
2. the new child must also pay enough extra absolute fee

That second rule is the easy one to miss.

Bitcoin Core's default incremental relay rule is `0.1 sat/vB`, so the new child
must pay at least:

```text
previous child fee + ceil(new child vsize * 0.1 sat/vB)
```

Example:

- old child fee: `584 sats`
- new child size: `160 vB`
- minimum new child fee: `584 + ceil(160 * 0.1) = 600 sats`

So a replacement can still be rejected even if it looks "faster" by feerate,
simply because the child did not add enough absolute sats.

## What happens to the child change output

Trigger fee-bump children send leftover value to normal wallet change. Rescue
fee-bump children send leftover value to the temporary rescue wallet's
internal/change branch.

But there is one safety rule:

- if a fee-bump child is still unconfirmed and replaceable, outputs created by
  that child must not be reused for unrelated spending

Why:

- because that child can still be replaced
- if the child is replaced, its outputs disappear
- so the app must not reuse those outputs for unrelated sends, new vaults, or
  other fee-bump children

For normal wallet-owned child change, this is why `spendableUtxosData` can be
smaller than the raw wallet UTXO set.

## Backups in Rewind2

Rewind2 has two backup ideas:

### 1. Normal wallet storage

The app's stored wallet data is encrypted with a deterministic wallet-level key
derived from:

```text
m/1073'/coin_type'/1'/0
```

This is about app storage, not about one specific vault.

### 2. Per-vault on-chain backup

Every vault also funds a dedicated backup output.

That output can later be spent into an `OP_RETURN` transaction that stores an
encrypted copy of that vault's trigger and rescue transactions.

This is the backup output added directly to the vault tx.

### Why the setup screen minimum fee rate is around 0.3 / 0.4

Users may notice that the setup screen does not let the fee slider go down to
`0.1 sat/vB`, even though `0.1 sat/vB` is still the relay floor used by the
code.

The reason is simple:

- the backup tx is designed without change output
- this avoids creating tiny dusty outputs just for the backup path
- because of that, the amount funded into the backup output later becomes the
  backup tx fee itself

That backup output must already be above dust when the vault tx is created.
So even if the vault tx pays the minimum parent fee possible (`0` for TRUC, a
small fee for NON_TRUC), the backup side already forces a noticeably higher real
package fee rate than `0.1 sat/vB`.

In plain language:

- `0.1 sat/vB` is only the low target floor
- the smallest package the wallet can really build is usually closer to
  `0.3-0.4 sat/vB`
- the setup screen therefore shows the real minimum buildable package fee rate,
  not the abstract relay floor

## Why trigger and rescue are treated differently

This is a deliberate design choice.

Trigger gets a dedicated reserve because:

- it is the first emergency action the wallet itself should always be able to fund
- the reserve can be decided and funded up front, at vault creation time

Rescue does not use ordinary wallet UTXOs for fee bumping because:

- if the hot wallet is compromised, ordinary wallet UTXOs cannot be trusted
- an attacker can interfere with those funds or race them
- if rescue still needs a bump, the safer model is a separate emergency bump
  signer with a separately funded emergency UTXO

## Mental model

If you want one simple picture in your head, use this:

```text
vault tx
  -> vault output
  -> backup output
  -> trigger reserve

trigger tx
  -> trigger output
  -> anchor

rescue tx
  -> emergency address
  -> anchor

trigger bump child
  spends: trigger anchor + all known trigger reserve UTXOs
  pays to: wallet change

rescue bump child
  spends: rescue anchor + all temporary rescue reserve UTXOs
  pays to: temporary rescue wallet internal/change

backup tx
  spends: backup output
  pays to: OP_RETURN(encrypted trigger + rescue)
```

That is Rewind2 in one page.

## Rescue Acceleration Draft

The current intended flow is:

1. Broadcast the presigned rescue parent first.
2. Only if that rescue still needs more fee, open an acceleration modal.
3. In that modal, create a random mnemonic `P2WPKH` wallet in memory only.
4. Show the seed first, make the user confirm it was written down and warn the
   user not to leave this wallet.
5. Show one funding address plus the exact currently needed amount.
6. Once those funds are usable, build the rescue CPFP child from the rescue
   anchor plus every usable UTXO in that temporary reserve wallet.

The amount requested from the user should be computed from the current package
target, using the same reserve-sizing primitive used for trigger reserve top-up
flows.

The rescue acceleration flow should not coinselect among temporary reserve UTXOs.
It should prepare the reserve set for that action, spend all of it in the child
and return any leftover value to the temporary wallet's internal/change branch.

If the currently live rescue parent or rescue package is already at or above the
current high-priority target, the modal should warn that acceleration is
probably unnecessary, but still allow the user to continue.

The app does not plan to persist that temporary rescue reserve wallet or offer an
in-app import flow for it.

--

when the vault is being created i still see old texts showinf this is creating a chain
or txs...

--

rename getP2AOutputData to getP2AOutputIndexAndValue or similar?
