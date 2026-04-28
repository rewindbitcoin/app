# P2A Funding Flows

This is a working design note for the Rewind2 P2A funding model.

The goal is to quickly recover the shape of the system: what is funded at setup,
what is reserved for later acceleration, what trigger and rescue are allowed to
spend and which assumptions are still open.

## Core Model

Rewind2 separates concepts that older flows could blur together:

- `vault amount`: the funds being frozen
- `backup output`: value set aside so the on-chain backup tx can later be mined
- `trigger reserve`: deterministic per-vault funds reserved for trigger acceleration
- `P2A anchor`: the parent output that lets a CPFP child attach
- `CPFP child`: the later child transaction that pays extra package fee

The important UX rule is: a fee is not a reserve. Setup should show the frozen
amount, the unfreeze reserve and the mining fee as different things.

TBD: when existing acceleration funds are missing or not enough, the user-facing
solution should be an acceleration funding wizard. "Wizard" means a guided flow
that explains why more funds are needed, shows where to send them and waits until
those funds are usable.

That wizard should cover both cases:

- trigger top-ups, even though the setup-funded trigger reserve should normally
  be enough
- rescue acceleration funding, even though the rescue parent starts with a high
  fee rate

## Vault Setup

A normal successful P2A vault creation funds these outputs in the vault tx:

- the vault output
- the backup output
- the built-in trigger reserve output
- optional wallet change

The backup output is not normal savings and not normal change. It funds the later
on-chain backup transaction. Since that backup tx stores data in `OP_RETURN` and
does not create a normal change output, the backup output value effectively
becomes the backup tx cost.

The trigger reserve is also funded during setup. There is no separate "create the
reserve later" step in normal vault creation. If the wallet cannot fund the
built-in trigger reserve, vault creation should fail instead of creating a normal
new P2A vault without trigger acceleration funds.

`P2A_TRUC` setup uses confirmed wallet UTXOs only. This keeps the new vault setup
compatible with the stricter relay assumptions of the TRUC path.

## Trigger Funding

The trigger transaction spends the vault output and starts unfreezing. In P2A it
has a parent transaction with an anchor, and acceleration is done by attaching a
child.

Trigger acceleration is deterministic and reserve-only:

- it spends the trigger P2A anchor
- it spends that vault's trigger reserve UTXO set
- it does not use generic hot-wallet UTXOs
- it does not coinselect among reserve UTXOs
- it spends all discovered trigger reserve UTXOs
- it sends excess value back to normal wallet change

Current: the built-in trigger reserve is the first child on the per-vault
trigger-reserve branch:

```text
m/1073'/coin_type'/2'/<vaultIndex>/0
```

Current: the app discovers the setup-funded `/0` reserve. That is the only
trigger reserve UTXO normal vault creation creates today.

TBD: if the user later adds more trigger reserve funds, those funds should use
later child indexes on the same per-vault branch. Discovery then needs to return
all usable reserve UTXOs for that vault.

The setup-funded reserve should normally cover trigger acceleration up to the
configured ceiling. A trigger top-up wizard is only the fallback for missing,
insufficient or unusually exhausted reserve funds.

Current: if P2A trigger reserve funds are missing or insufficient, the Trigger
modal opens in explanation-only mode. That applies both to initial trigger start
and to acceleration of an already-pushed trigger. It does not yet fund a top-up.

Current: if a trigger acceleration package was already submitted but is still not
being mined, the next acceleration replaces the previous CPFP child with a
higher-fee child. Replacement must be checked against the child that is currently
live, not against a generic fee target in isolation.

## Rescue Funding

Rescue is intentionally different from trigger.

The rescue transaction is the emergency path from the trigger output to the
emergency address. The default design is that rescue starts as a high-fee parent
transaction. In most cases the user should be able to broadcast the rescue parent
and be done.

Rescue does not use ordinary hot-wallet UTXOs for fee bumping. If the user is in
the rescue path, the hot wallet may already be compromised, so ordinary wallet
funds are not a good emergency funding source.

Current: rescue does not have an acceleration funding wizard yet. If a P2A rescue
is already pending but no rescue acceleration reserve exists, the Rescue modal
opens in explanation-only mode instead of funding acceleration.

TBD: if the high-fee rescue parent is still not enough, the intended model is a
separate emergency acceleration reserve:

- a separate signer controls the rescue acceleration funds
- the signer is not the normal wallet signer
- the user funds an address from that reserve system
- a rescue CPFP child spends the rescue anchor plus those reserve UTXOs
- leftover value should go to a recovery-safe destination, probably the emergency
  address

TBD: the current direction is an ephemeral software signer for rescue
acceleration, but that only works if the UX first shows the seed and the user
confirms it before any real funds are sent there. Otherwise the user could fund
an in-memory wallet with no recovery path.

## Shared P2A Bump Shape

Current: trigger uses this low-level package shape today:

```text
parent anchor + reserve inputs -> child change output
```

TBD: rescue should use the same shape once rescue reserve inputs exist.

The differences are not in the package math. They are in the funding source,
signer, timing and recovery story.

Current: `P2ABumpPlan` describes the inputs needed to build a CPFP child:

- non-anchor reserve UTXOs
- destination for leftover value
- signer for the reserve UTXOs
- optional previous child tx when replacing an unmined package

`getRequiredNextP2ABumpReserveUtxoValue(...)` is the generic sizing primitive for
the next reserve UTXO. It is not trigger-specific.

Current: for trigger setup, it is used for the first reserve UTXO with no
existing reserve UTXOs yet.

TBD: for future trigger top-ups or rescue acceleration funding, it can take
existing reserve UTXOs into account and size only the next reserve UTXO that must
be added.

For current and future uses, the helper assumes the child spends all known
reserve UTXOs plus the next reserve UTXO being sized. It does not do
coinselection among reserve UTXOs.

## Package And Replacement Assumptions

The current CPFP model is a two-transaction package:

```text
parent + child
```

Here `parent` means the transaction being accelerated: trigger or rescue. It does
not mean the vault tx. For Init Unfreeze on `P2A_TRUC`, the vault tx is already
confirmed before the trigger package is submitted.

For the current trigger path, the reserve input is already confirmed:

```text
Already confirmed before this package:
  vault tx
    |-- vault output
    |-- trigger reserve output

Package submitted now:
  trigger tx / P2A parent (unconfirmed)
    input:  confirmed vault output
    output: P2A anchor

  CPFP child
    input:  P2A anchor from trigger tx   (unconfirmed parent = trigger tx)
    input:  trigger reserve output       (confirmed)
    output: wallet change

Package being submitted:
  unconfirmed trigger parent + CPFP child

The CPFP child has one unconfirmed parent: the trigger tx. The vault tx and the
trigger reserve input are already confirmed.
```

If a future top-up is not confirmed yet, the shape changes:

```text
unconfirmed trigger parent (P2A anchor) ----\
                                            -> CPFP child
unconfirmed reserve top-up tx --------------/

The child now has two unconfirmed parents.
That does not fit the current P2A_TRUC one-parent child shape.
```

For `P2A_TRUC`, a version-3 child may have only one unconfirmed parent. In our
acceleration package, that parent is the trigger or rescue P2A transaction being
bumped. Therefore the reserve inputs spent by the CPFP child must already be
confirmed. If a reserve funding tx is still unconfirmed, it would become a second
unconfirmed parent of the child and violate the TRUC shape this flow relies on.

Current trigger setup is safe under that assumption. For `P2A_TRUC`, Init
Unfreeze is disabled until the vault tx confirms. Once the vault tx is confirmed,
the built-in trigger reserve output funded by that vault tx is confirmed too.

TBD: future reserve top-ups do not get that guarantee automatically. If the user
adds more funds to the trigger reserve, or funds a future rescue acceleration
reserve, the new funding tx may still be unconfirmed. For `P2A_TRUC`, the future
wizard must wait for that reserve UTXO to confirm before using it, unless relay
policy changes. A larger multi-parent package may matter for non-TRUC flows, but
it does not fit the current TRUC one-parent child shape.

P2A acceleration must also respect policy details:

- the child itself must satisfy minimum relay fee
- TRUC children must stay within the TRUC child-size limit
- replacing an existing child must improve package feerate
- replacing an existing child must also pay enough extra absolute child fee

The last point is easy to miss: a replacement can look better by package feerate
and still fail policy if the child does not add enough absolute fee.

## Backup And Recovery Scope

Current: the on-chain backup stores the trigger and rescue transactions for the
vault. It does not define a recovery story for reserve top-ups or rescue reserve
signer state.

TBD: if reserve top-ups or rescue reserve funding become normal parts of the
flow, we need to decide what belongs in local storage, what belongs in the
on-chain backup and what is intentionally ephemeral.

## Open Work

- Implement a shared acceleration funding wizard for trigger top-ups and rescue
  reserve funding.
- Discover trigger reserve UTXOs beyond the built-in `/0` child.
- Decide whether top-up UTXOs must confirm before use.
- Decide whether to support multi-parent packages for immediate reserve use.
- Decide whether rescue reserve signing is per vault, per attempt or ephemeral.
- Show and confirm the rescue reserve seed before showing a funding address.
- Decide where rescue CPFP leftover value should go.
- Define backup and recovery scope for reserve top-ups and rescue reserve state.
- Sync `REWIND2.md` once this model settles.
