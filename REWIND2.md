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
   - rescue starts as a high-fee parent tx and only uses a separate emergency
     bump input if that later becomes necessary

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
     child later if an external emergency bump input is available

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
- this vault's trigger reserve UTXO

output:
- normal wallet change
```

Important design choices:

- trigger bumping is per-vault
- it uses only that vault's dedicated trigger reserve
- it does not coinselect from generic wallet UTXOs
- the reserve itself stays outside normal wallet flow
- only the child leftover comes back as normal wallet change

If the child is later accelerated again, the replacement still uses the same
reserve input. The old child is replaced in the mempool; it is not a new flow
with a different reserve.

### 6. Rescue fee-bump child

If the rescue tx still needs more fee after its large presigned fee, Rewind2 can
build a child transaction.

Shape:

```text
inputs:
- rescue P2A anchor
- optional emergency bump UTXO

output:
- normal wallet change
```

This is intentionally different from trigger bumping.

Today rescue does not use normal wallet UTXOs for fee bumping.

The current model is:

- by default, the rescue parent is already presigned with a high fee rate
- in most cases that should be enough, so rescue can be a single tx
- if that still is not enough, rescue can later use one optional emergency bump
  input from a separate emergency signer / emergency UTXO flow

Why Rewind2 starts rescue with a large fee by default:

- if the user is pressing the panic button, we must assume the hot wallet may be
  compromised already
- in that situation, asking the user to first fund another tx from the same
  wallet is a bad default
- a high-fee presigned rescue gives the best chance that the user can simply
  broadcast one transaction and be done
- only in rare extreme-fee situations should the app need to ask for a separate
  emergency bump input later

That later emergency bump flow is separate from the normal wallet on purpose.
If rescue is needed, the hot wallet may already be compromised, so its ordinary
UTXOs are not trusted for fee bumping.

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

- `LEGACY`
- `TRUC`
- `NON_TRUC`

Rewind2 itself uses `TRUC` or `NON_TRUC`.

`LEGACY` is only for older vaults created before Rewind2.

### TRUC

Human rule of thumb:

- trigger/rescue parents use version `3`
- the P2A anchor value is `0 sats`

Why this matters:

- TRUC allows modern package relay behavior
- but it comes with tighter policy constraints for the child transaction

In the current code, the trigger/rescue fee-bump child must stay within the
TRUC size limit. If the child becomes too large, the plan is rejected.

### NON_TRUC

Human rule of thumb:

- trigger/rescue parents use version `2`
- the P2A anchor value is `330 sats`

Why this matters:

- the anchor itself contributes some value to the fee-bump child
- but the parent also has to give up those anchor sats up front

## Parent fee policy

Today the parent transactions are funded like this:

- trigger parent fee is based on `PRESIGNED_TRIGGER_FEERATE`
- rescue parent fee is based on `PRESIGNED_RESCUE_FEERATE`

So both parents are now presigned with explicit fee-rate settings, but rescue is
expected to start much higher.

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

Trigger and rescue fee-bump children send leftover value to normal wallet
change.

But there is one safety rule:

- if a fee-bump child is still unconfirmed and replaceable, outputs created by
  that child are hidden from normal spending

Why:

- because that child can still be replaced
- if the child is replaced, its outputs disappear
- so the wallet must not reuse those outputs for unrelated sends, new vaults,
  or other fee-bump children

This is why `spendableUtxosData` can be smaller than the raw wallet UTXO set.

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
  spends: trigger anchor + trigger reserve
  pays to: wallet change

rescue bump child
  spends: rescue anchor + optional emergency bump UTXO
  pays to: wallet change

backup tx
  spends: backup output
  pays to: OP_RETURN(encrypted trigger + rescue)
```

That is Rewind2 in one page.

#TODO
---

for the RESCUE, the idea is the user launches the presigned tx first.
  then, show the accelerate option.


  this will open one of our popup modal that will creates a random mnemonic wallet (to be kept in memory) - see f.ex. how this is done for the emergency address wizard creation. The user must know this is in memory only wallet in texts to be used within the next minutes to bump the panic tx. Then dereive the first address (similar to the emergency wizard) and show it to the user asking to send some funds there and tell the user any remaining balance will be sent back to tne emergency address. The way to show the adderss is text + QR. Just one tx be clear in the message. the user. For all this create a new component file I guess, not to bloat exisiting components.
  how much funds to ask for ? since the user may already be above the epress confirmation time fee rate we perhaps can ask for the bump amount to tha anchor that would allow the typical package size to be above the express confirmation time assuming that the parent fee rate was zerio. I need here some quick to compute value which is decent, perhaos yuo come up with a better idea. some that provides a good measure but doesnot bloat the code while is meanungul and does not ask for crazy amounts of money or very little.

  When the inital popup is open first thing the app must cgeck the current express fee rate anf if the fee rate f the presgunted rescue tx or a previous replacement package is above the current blockchain express fee rate then prompt the user you should probably not need this since your current fee rate is already above the epress confirmation time so you just need to wait. however let them proceed if needed.

--

when the vault is being created i still see old texts showinf this is creating a chain
or txs...

--


rename getP2AOutputData  to getP2AOutputIndexAndValue or similar?
