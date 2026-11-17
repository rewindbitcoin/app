# P2A Funding Flows

This is the detailed current reference for the Rewind2 P2A funding model and UX.
Reviewed against implementation changes through `1448e7f` (including `2c3c903`).

The goal is to quickly recover the shape of the system: what is funded at setup,
what is reserved for later acceleration, what trigger and rescue are allowed to
spend and which assumptions are still open.

See [REWIND2.md](./REWIND2.md) for the higher-level design,
[RELAY_RECIPES.md](./RELAY_RECIPES.md) for relay-policy constraints, and
[test/README.md](./test/README.md) for focused regression checks. The older
[refactor plan](./REWIND2_P2A_REFACTOR_PLAN_V2_FROM_MAIN.md) is historical, not a
description of current funding or fee-selection behavior.

## Core Model

Rewind2 separates concepts that older flows could blur together:

- `vault amount`: the funds being frozen
- `backup output`: value set aside so the on-chain backup tx can later be mined
- `trigger reserve`: deterministic per-vault funds reserved for trigger acceleration
- `P2A anchor`: the parent output that lets a CPFP child attach
- `CPFP child`: the later child transaction that pays extra package fee

The important UX rule is: a fee is not a reserve. Setup should show the frozen
amount, the unfreeze reserve and the mining fee as different things.

Reserve-spend invariant: if Rewind discovers or prepares reserve UTXOs for a
P2A action, that action must spend all of those reserve UTXOs. The app must not
submit a parent-only action while leaving known reserve UTXOs behind. If those
reserve UTXOs cannot be used yet, the app should wait or ask the user to wait
instead of bypassing them. Trigger is the only exception that can add normal
hot-wallet UTXOs, and only after the full reserve set is already included.

This matters because reserve funds are not ordinary wallet change. Trigger
reserves live on special per-vault BIP32 paths, and rescue reserves may live in a
temporary same-session wallet. Leaving those UTXOs behind can strand funds,
especially when the signer/path is unusual or intentionally ephemeral.

Parent-only P2A action submission is only a fallback for the case where no
reserve UTXOs exist for that action and the presigned parent fee is policy-valid.
It is not an exemption from mempool ancestor/descendant policy; see the TRUC
rescue restrictions below.

Current funding UX differs by role:

- trigger top-ups are not a separate reserve-path wizard; if the setup-funded
  trigger reserve is missing or insufficient, the current Trigger modal prefers
  explicit normal-wallet supplement funding
- rescue acceleration funding is a same-session reserve wallet flow: the Rescue
  modal can close, create or import a temporary reserve wallet, show the next
  funding address and amount, and later use those funds for action submission
  once they are usable

## Selected Fee And Funding Decisions

Funding guidance follows the fee currently being reviewed, not an unrelated
network target. `getVaultActionFunding(...)` in `src/app/lib/vaultActionFunding.ts`
returns the notice, recovery action and target together; funding amount hints and
follow-up modals must use that same target.

- Editable actions initially show the preferred confirmation estimate
  (`INITIAL_CONFIRMATION_TIME`, normally about two hours), raised to the action's
  minimum or replacement floor where necessary. A fixed parent-only action still
  uses its presigned fee.
- Lack of funds must not silently replace that preferred target with
  `0.10 sat/vB`. Keep the selected target visible and explain what is missing.
- A valid, buildable low fee remains confirmable. An unfundable higher
  recommendation is advisory, not a reason to disable that buildable choice.
- Invalid input is not a default fee or a funding recommendation. Invalid or
  unfunded selections cannot enable final confirmation.
- Readiness/replacement calculations are independent of slider position; a
  concrete selected-fee build still determines the preview and submit state.

Current recovery decisions:

| Situation | Guidance |
| --- | --- |
| Trigger reserve funds the selected fee | No new wallet permission or deposit is required. |
| Trigger needs more funds and eligible wallet coins exist, without permission yet | Offer "Use wallet balance if needed"; never enable it automatically. |
| Manual picks fail but automatic selection can fund the selected action | Point to Advanced to choose more coins or use Auto. |
| Neither manual nor automatic eligible coins can fund the selected action | Offer lowering the fee or adding funds; do not present Auto as a fix. |
| Pending normal-wallet outputs would resolve the selected-fee shortage after confirmation | Explain waiting instead of asking for another deposit. |
| Selected trigger fee builds, but the recommendation does not | Keep confirmation enabled; only suggest expanding manual picks if Auto can fund the recommendation. |
| Rescue needs additional funding | Use the separate temporary rescue wallet, never ordinary wallet coins. |

Pending outputs are used only for hypothetical post-confirmation affordability
checks, not as currently spendable inputs. Frozen-vault rows added solely to
explain disabled coins in the picker must never enter those checks.

Contextual funding buttons use "Add" / "Añadir" and open Receive for normal
wallet funding. This does not rename the normal "Receive" / "Recibir"
navigation. Rescue funding opens its separate reserve flow instead.

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

The runtime trigger code still handles a missing trigger reserve defensively. This
keeps older, imported, recovered or partially discovered vault states from being
hard-crashes, but it is not the expected result of normal vault creation.

`P2A_TRUC` setup uses confirmed wallet UTXOs only. This keeps the new vault setup
compatible with the stricter relay assumptions of the TRUC path.

Vault tx fee management is separate from trigger/rescue action acceleration. If
the vault tx itself is still unconfirmed, bumping that vault tx would be a normal
wallet RBF/CPFP problem tied to the setup coinselection path. It is not handled by
the P2A action reserve flow. The action reserve flow only starts from a
trigger/rescue parent and spends the action's known reserve UTXOs in a CPFP child.

Policy invariant: a transaction with a dust output must be zero-fee. In this
design that mainly means a 0-sat P2A anchor is only valid on a zero-fee parent;
if a parent pays its own fee, its P2A anchor must be non-dust.

## Trigger Funding

The trigger transaction spends the vault output and starts unfreezing. In P2A it
has a parent transaction with an anchor, and acceleration is done by attaching a
child.

Current: in `P2A_TRUC`, trigger uses the ephemeral-dust shape: the trigger parent
is version 3, its P2A anchor is 0 sats and its direct parent fee is 0. The CPFP
child pays the package fee from the trigger reserve.

Current: trigger parent fee policy is mode-specific and fixed internally.
`P2A_TRUC` uses `P2A_TRUC_PRESIGNED_TRIGGER_FEERATE = 0 sat/vB`
(`vaultFees.ts`) because its P2A anchor is dust. `P2A_NON_TRUC` uses
`P2A_NON_TRUC_PRESIGNED_TRIGGER_FEERATE = MIN_FEE_RATE = 0.1 sat/vB`
(`vaultFees.ts`) because its funded anchor is non-dust.

Trigger acceleration is deterministic first, with an optional wallet supplement:

- it spends the trigger P2A anchor
- it spends that vault's trigger reserve UTXO set
- it does not coinselect among reserve UTXOs
- it spends all discovered trigger reserve UTXOs
- if the reserve cannot fund the selected package, the user can opt in to add
  policy-eligible normal hot-wallet UTXOs to the same child (confirmed under TRUC)
- it sends excess value back to normal wallet change by default, or to the
  custom trigger child change destination explicitly selected in Advanced

Current: the built-in trigger reserve is one exact address in a standard BIP84
P2WPKH reserve account:

```text
m/84'/coin_type'/1073'/0/<vaultIndex>
```

Current: the app discovers the exact setup-funded reserve address for the vault.
Normal vault creation creates one trigger reserve output; current trigger UX
prefers normal-wallet supplement funding over manual reserve-path top-ups.

Trigger reserve discovery returns all usable reserve UTXOs for that vault. The
child spends the full discovered set; it does not choose a subset.

The refresh itself is descriptor-only once the descriptor is known. In the
current software-wallet implementation Rewind derives the trigger reserve
descriptor from the signer at runtime; a future HWW implementation should avoid
touching the device during refresh by storing or otherwise caching watch-only
reserve descriptors. Action construction later attaches the signer and change
output only when a package is actually being prepared/signed.

Current: under `P2A_TRUC`, trigger wallet supplement funds must be confirmed
before the app uses them in a trigger CPFP child. If the extra funding tx is
still unconfirmed, it becomes an additional unconfirmed parent of the CPFP child
and breaks the one-unconfirmed-parent TRUC package shape. Under `P2A_NON_TRUC`,
stable normal-wallet UTXOs can be used even if they are not confirmed.

The setup-funded reserve should normally cover trigger acceleration up to the
configured ceiling. If it is missing, insufficient or unusually exhausted, the
preferred fallback is to ask the user to allow normal hot-wallet funds in the
same trigger child. If the wallet still cannot fund the requested package, Rewind
asks the user to add funds to the normal wallet and shows the required amount.

Wallet permission is permission to supplement only when necessary, not an
instruction to spend wallet coins on every build. Reserve-only is always tried
first. Once enabled, permission remains visible and manual wallet picks survive
lowering and raising the fee, even while the reserve alone becomes sufficient.
Explicit opt-out clears the manual picks; defaults clear permission, manual picks
and custom change; a definitive action close resets the local action state.

Manual trigger picks are re-resolved by outpoint against current policy-filtered
wallet coins after refresh. Stale/unavailable picks must not be submitted as old
coin objects; a required supplement with unavailable picks needs review first.

Current: if no P2A trigger reserve UTXOs are found, a trigger may still start
parent-only only when its presigned parent fee is already policy-valid. If any
trigger reserve UTXOs are found, they must be spent by the trigger CPFP child; if
they are not confirmed yet under `P2A_TRUC`, the app waits instead of bypassing
them. If reserve funds are insufficient, or an already-pushed trigger cannot be
accelerated with reserve alone, the Trigger modal can offer an opt-in checkbox to
use normal wallet funds. If reserve plus usable wallet funds are still
insufficient, the Trigger modal tells the user how much the normal wallet should
receive before trying again.

Current: if a trigger acceleration package was already submitted but is still not
being mined, the next acceleration replaces the previous CPFP child with a
higher-fee child. Replacement must be checked against the child that is currently
live, not against a generic fee target in isolation.

Current: cross-device trigger fee-payer discovery must not scan the shared P2A
anchor script. The trigger CPFP child should instead be rediscovered by finding
the spender of that vault's deterministic trigger reserve UTXO and then
validating that the same transaction also spends the trigger parent's P2A
anchor.

## Rescue Funding

Rescue is intentionally different from trigger.

The rescue transaction is the emergency path from the trigger output to the
emergency address. The default design is that rescue starts as a high-fee parent
transaction. In most cases the user should be able to broadcast the rescue parent
and be done.

Current: because rescue intentionally pays a high direct parent fee, its P2A
anchor must be non-dust. This applies even when the rescue transaction is version
3 under the `P2A_TRUC` vault mode. A 0-sat rescue anchor would only be valid if
the rescue parent fee were also 0 and a rescue CPFP child paid the package fee.

Rescue does not use ordinary hot-wallet UTXOs for fee bumping. If the user is in
the rescue path, the hot wallet may already be compromised, so ordinary wallet
funds are not a good emergency funding source.

Current: if the high-fee rescue parent is still not enough, rescue acceleration
can create or import a temporary software `P2WPKH` wallet in memory only, from
inside the rescue acceleration prompt:

- it is not the normal wallet signer, so a compromised main wallet seed does not
  also control the rescue reserve
- the wallet exists only in memory in the current wallet session; leaving that
  wallet can discard it even if the app stays open, and the app does not persist
  it locally
- when creating a new temporary reserve wallet, the user is shown the seed first
  and must confirm they recorded it
- when importing, the user enters a previously written temporary rescue reserve
  phrase so Rewind can re-derive the same in-memory signer and funding address
- the UI must warn the user not to leave this wallet until the rescue
  acceleration flow is complete, because that temporary wallet only lives in the
  current wallet session unless the user imports its phrase again
- after seed confirmation, the app shows one funding address and the exact amount
  currently needed for the rescue bump
- that amount is computed by the shared action-funding helper used by trigger
  wallet hints, at the exact target passed from Rescue, including any existing
  child's absolute replacement-fee floor
- a rescue CPFP child spends the rescue anchor plus those reserve UTXOs
- it does not coinselect among rescue reserve UTXOs; it spends the reserve set
  prepared for that rescue action
- if funding overshoots, leftover value should go back to that temporary
  wallet's internal/change branch

For `P2A_TRUC`, if the rescue reserve funding tx is still unconfirmed, the app
must wait until it confirms before building the rescue child. The rescue parent
must remain the only unconfirmed ancestor of that child, so the trigger must
also be confirmed before a rescue child can be built/submitted. This child guard
does not remove the no-reserve parent-only emergency fallback, nor does it make
that fallback valid against an incompatible live TRUC topology.

The funding flow can be entered before the first rescue submission or while
accelerating an already-pushed rescue. Broadcasting the parent first is the
normal high-fee fallback, not a prerequisite for preparing rescue funding.

Rescue -> wallet wizard -> funding -> Rescue transitions wait for each modal's
hide animation before opening the next. The exact fee target and confirmation
step survive these transitions, including cancellation before a temporary wallet
is created. A definitive Rescue close resets the action state; simply canceling
the funding wizard returns to the same choice.

The funding modal shows the preserved target plus distinct loading, scan-error,
TRUC funding-confirmation, funded and additional-funding states. A zero additional
amount means "funded", not "make another zero-value deposit". It offers a funds
refresh and an explicit return to Rescue; it does not submit automatically.

Leaving the main wallet while it owns temporary rescue state requires a warning.
Canceling that navigation keeps both the wallet and its temporary state alive.
Recovery after leaving or session loss depends on importing the recorded phrase.

Current: while the same-session rescue reserve signer exists, Rewind refreshes
that reserve wallet's descriptor and uses its UTXOs for rescue acceleration. If
future recovery tooling needs to rediscover rescue fee-payer children after the
session is gone, it should use rescue reserve UTXOs rather than scanning the
shared P2A anchor script.

## Shared P2A Bump Shape

Current: trigger and same-session rescue reserve acceleration use this low-level
package shape:

```text
parent anchor + reserve inputs + optional trigger wallet inputs
  -> action-specific child change output
```

The differences are not in the package math. They are in the funding source,
signer, timing, change destination and recovery story. The optional normal wallet
inputs apply only to trigger acceleration, not rescue.

For trigger, child leftover value returns to normal wallet change by default,
unless the user explicitly chooses a custom destination in Advanced. For rescue
acceleration, it returns to the temporary rescue wallet's internal/change branch,
not to the emergency address.

A P2A reserve source is a `P2WPKH` signer/output set dedicated to paying the
CPFP child for one action type. It is not normal spendable wallet balance. When a
P2A child uses reserve funds, it spends every known usable UTXO from that reserve
set; the reserve set is not coinselected.

Trigger reserve funds are controlled by the main hot wallet signer on the BIP84
reserve account at `m/84'/coin_type'/1073'`. Each vault uses the exact address
`/0/<vaultIndex>`. Optional trigger supplement inputs are normal wallet UTXOs
controlled by the same signer. Trigger child change defaults to an internal
address of the main hot wallet; custom child change is independent of wallet
supplement selection.

Rescue reserve funds are controlled by the temporary rescue reserve wallet, which
is a same-session in-memory software wallet. Rescue child change goes back to an
internal/change address of that same temporary rescue reserve wallet.

Current: `P2ABumpPlan` describes the reserve-backed inputs needed to build a CPFP
child:

- non-anchor reserve UTXOs
- whether any reserve funds are unconfirmed
- signer for the child inputs

Child change is supplied separately through the change plan. The built
`VaultActionData.finalChildChange` records the exact destination for submission,
including a custom trigger change destination if one was selected.

The plan intentionally contains all known reserve UTXOs for that action. It is
not a coinselection hint for the reserve set. For both trigger acceleration and
same-session rescue acceleration, callers pass the full reserve set so the child
spends everything and sends leftover value back to the appropriate change
destination. Trigger wallet supplement UTXOs are selected only after the reserve
set is insufficient and the user opts in.

There are two sizing layers:

- `getAdditionalP2AOutputValue(...)` in `src/app/lib/p2aReserve.ts` is the
  lower-level primitive. It sizes one additional child input from input/output
  types, existing values, parent size/fee/anchor, target package rate and an
  optional absolute `minimumChildFee`. It covers child relay fee and dust-safe
  input/change values. Setup uses it with no existing reserve inputs to fund the
  first trigger reserve at `MAX_TRIGGER_FEERATE`.
- `getAdditionalOutputValue(...)` in `src/app/lib/vaultActionTx.ts` wraps a
  loaded action plan. It includes existing reserve funds and, for trigger hints
  only, eligible normal-wallet funds. With a live child it reconstructs the old
  child fee and includes the replacement absolute-fee floor. It returns `0` if
  the supplied existing funds already satisfy the target and replacement floor;
  otherwise it calls the primitive to size the next funding UTXO. Loading/error
  plans must be handled by the caller before calling it.

Neither helper coinselects the reserve set. Rescue callers omit ordinary wallet
funds entirely. Funding hints size the next output, including its input-size and
dust cost, rather than just subtracting balances from a nominal fee.

## Advanced Options And Coin Selection

Send, vault setup and trigger use the shared Advanced modal. In editable forms,
an invalid amount/fee or a selected-fee funding shortage must not remove the
Advanced entry; users still need to review coins and custom change. Trigger keeps
it available when its relevant coin/change options exist, even when funding is
insufficient. Send/setup retain their pre-form hard stop if all eligible funds
cannot build even the minimum operation; there they offer Add or explain waiting
rather than a picker that cannot solve the shortage.

Automatic coin selection and the change destination are independent. "Use
automatic coins" clears only manual coins, not custom change. "Use defaults"
resets both (and trigger wallet permission). The change-address picker retains
its own explicit confirmation flow.

Coin selection is deliberately an unapplied draft:

- `AdvancedTransactionOptionsModal` owns the draft; `CoinControlPanel` renders
  controlled rows. Checking a row does not change the transaction's applied
  selection.
- A fixed footer outside the scrolling list shows selectable count, total,
  "Cancel" and "Use selected (N)". Only the latter applies the selection and
  closes Advanced, and it is disabled when no selectable coins are picked.
- "Cancel" discards the draft and returns to the Advanced overview. Re-entering
  the picker starts from the last applied selection. There is no ambiguous top
  "Back" action in the coin picker.
- Backdrop, drag and Android-back dismissal with dirty picks are vetoed and show
  "Discard changes" / "Continue editing" in that same footer, not another
  stacked modal. Continuing retains the draft. Android back while that prompt is
  visible returns to editing; unchanged picks can close directly.
- Currently unavailable coins are disabled and excluded from the footer's
  applicable count/total and the submitted selection, even if they became
  unavailable after being picked.

The shared `Modal` can veto dismissal when `onClose` returns `false`, restoring a
dragged sheet. Android-back close handling is opt-in (`closeOnBackButton`), not a
behavior change for every modal.

## Amount And Fee Display

Unfreeze shortfalls, rescue funding amounts and the coin-picker footer use the
shared `formatBtc(...)` formatter: the preferred Bitcoin unit plus an approximate
fiat equivalent when a quote is available. mBTC supports up to five decimals so
small amounts retain satoshi precision. Fee rates remain in sat/vB; a rescue
funding QR uses an exact BIP21 BTC amount with eight decimals regardless of the
display unit.

On Android, the slider dependency patch ignores non-user native progress events
so programmatic updates cannot replace an exact typed fee with slider-grid
rounding. User interaction remains enabled. See
[patches/README.rewindbitcoin.md](./patches/README.rewindbitcoin.md); this is not a
change to the shared `EditableSlider` component.

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

If a future funding input is not confirmed yet, the shape changes:

```text
unconfirmed trigger parent (P2A anchor) ----\
                                            -> CPFP child
unconfirmed fee-funding tx -----------------/

The child now has two unconfirmed parents.
That does not fit the current P2A_TRUC one-parent child shape.
```

For `P2A_TRUC`, a version-3 child may have only one unconfirmed parent. In our
acceleration package, that parent is the trigger or rescue P2A transaction being
bumped. Therefore the reserve inputs spent by the CPFP child must already be
confirmed. If a reserve funding tx is still unconfirmed, it would become a second
unconfirmed parent of the child and violate the TRUC shape this flow relies on.

For `P2A_NON_TRUC`, setup can use unconfirmed wallet UTXOs only when they do not
come from version-3 parents. Bitcoin Core rejects a non-version-3 transaction
that spends an unconfirmed version-3 parent. If a wallet UTXO comes from an
unconfirmed v3 tx, NON_TRUC setup must skip it until it confirms.

Current trigger setup is safe under that assumption. For `P2A_TRUC`, Init
Unfreeze is disabled until the vault tx confirms. Once the vault tx is confirmed,
the built-in trigger reserve output funded by that vault tx is confirmed too.

Rescue acceleration has one more predecessor to watch: the rescue parent spends
the trigger output. For `P2A_TRUC`, a rescue CPFP child can only be used once the
trigger tx that created that output is confirmed. Otherwise the child would have
too many unconfirmed ancestors: trigger tx -> rescue parent -> rescue CPFP child.
The only unconfirmed ancestor of a TRUC rescue CPFP child should be the rescue
parent itself.

`hasUnconfirmedAncestor` is checked by action readiness and selected-fee building,
and `VaultCard` rechecks trigger confirmation before submitting a rescue package.
The no-reserve parent-only branch is retained separately. It does not bypass
Bitcoin Core policy: if the unconfirmed trigger already has a CPFP child,
adding rescue as another descendant is not the permitted TRUC shape. Do not
describe parent-only fallback availability as guaranteed relay acceptance.

Current: extra fee-funding inputs do not get that guarantee automatically. If the
user adds normal wallet funds for trigger acceleration, or funds a rescue
acceleration reserve, the new funding tx may still be unconfirmed. Rewind uses
confirmed normal-wallet trigger supplement UTXOs and waits for rescue reserve
UTXOs to confirm under `P2A_TRUC`, unless relay policy changes. A larger
multi-parent package may matter for non-TRUC flows, but it does not fit the
current TRUC one-parent child shape.

P2A acceleration must also respect policy details:

- a dust-anchor parent must be zero-fee; the child pays the package fee
- the child itself must satisfy minimum relay fee
- TRUC children must stay within the TRUC child-size limit
- replacing an existing child must improve package feerate
- replacing an existing child must also pay enough extra absolute child fee

The last point is easy to miss: a replacement can look better by package feerate
and still fail policy if the child does not add enough absolute fee.

First-package readiness checks feasibility at `MIN_FEE_RATE` once; increasing the
fee cannot make an unaffordable first package affordable. Replacement-floor
search keeps the `0.01 sat/vB` grid but jumps to meaningful absolute-fee or
input-selection thresholds instead of scanning every tick. Integer fee rounding
and dust-driven input-set transitions matter: a jump must not skip an earlier
valid grid rate or miss a valid rate exactly at the allowed maximum.

## Backup And Recovery Scope

Current: the on-chain backup stores an encrypted entry for the vault, not full
trigger/rescue transaction hex. The entry contains the CSV lock, ephemeral
compressed public key, emergency output type, type-specific emergency output data
and trigger/rescue signatures. The entry is `185` bytes for `P2WPKH`, `P2PKH`
and `P2SH`, or `197` bytes for `P2TR` and `P2WSH`, plus
`ONCHAIN_BACKUP_MAGIC = "REW"`, for `188` or `200` bytes on-chain
(`onchainFormat.ts`). Restore rebuilds the trigger and rescue transactions from
the vault transaction plus fixed Rewind2 policy constants, then verifies the
signatures. The entry does not store vault mode; restore infers `P2A_TRUC` from
vault tx version `3` and `P2A_NON_TRUC` from vault tx version `2`. It does not
store trigger wallet-supplement state or rescue reserve signer state.

The rescue reserve wallet is intentionally ephemeral:

- the signer stays in memory only for the current session
- the app shows the seed but does not store it locally
- the app can import that seed during the current flow to restore the same
  in-memory reserve wallet
- if the user later needs that wallet outside the running session, recovery still
  depends on the shown seed

## Open Work

- Improve recovery/reuse of normal-wallet inputs already spent by a live trigger
  supplement child, if a later replacement needs them.
- Cross-session rescue reserve recovery beyond explicit phrase import, without
  silently persisting the temporary signer/seed.
- Decide whether to support multi-parent packages for immediate reserve use.
- Rediscover rescue CPFP children from rescue reserve UTXOs rather than from the
  shared P2A anchor script if rescue reserve recovery becomes persistent.
