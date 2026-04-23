# P2A Funding Flows

Temporary brainstorming document.

This file exists to settle the P2A / Rewind2 funding-flow design before we
update `REWIND2.md`.

It intentionally mixes:
- verified current behavior from the codebase
- current design direction
- still-open design questions

If this file disagrees with `REWIND2.md`, treat this file as the temporary
brainstorming note and `REWIND2.md` as the still-published design summary.

## Purpose

Clarify how setup funding, trigger acceleration funding, and rescue acceleration
funding should work, while keeping the code simple and the user-facing meaning
clear.

Main goals:
- keep setup UX honest: fee is not reserve
- keep trigger acceleration deterministic
- prepare a future shared reserve-based acceleration model for both trigger and rescue
- avoid introducing generic abstractions before the design is settled

## Current Verified Behavior

These points are verified from the current code.

### Setup funding today

- A new P2A vault setup funds four things in the vault transaction:
  - the vault output
  - the backup output
  - the trigger reserve output
  - optional wallet change
- The setup screen shows:
  - `Amount to Freeze` for the vault output only
  - `Unfreeze Reserve` separately
  - `Mining Fee` as the package fee for the vault tx plus the on-chain backup tx
- The confirmation screen shows:
  - vault amount
  - unfreeze reserve
  - vault transaction fee
  - on-chain backup cost
  - total taken from wallet now

### TRUC setup today

- `P2A_TRUC` setup only uses confirmed wallet funds.
- Unconfirmed spendable wallet UTXOs are filtered out during setup.
- The setup screen warns the user before continuing when some funds are still
  unconfirmed.

### Trigger acceleration today

- Trigger acceleration is reserve-only.
- The current trigger CPFP plan uses:
  - the trigger P2A anchor
  - that vault's dedicated trigger reserve UTXO
- It does not coinselect generic wallet UTXOs for trigger acceleration.
- Any leftover value from the child returns through normal wallet change.

### Rescue acceleration today

- Rescue starts as a high-fee parent transaction by default.
- Rescue does not currently rely on ordinary wallet UTXOs for fee bumping.
- Rescue already has an optional later CPFP path based on an externally prepared
  funding plan (`PreparedCpfpPlan`).

### Shared CPFP mechanics already in the code

- The low-level package math is already mostly shared:
  - `estimateCpfpPackage(...)`
  - `createCpfpChildTx(...)`
- The current shared shape is:
  - parent anchor output
  - one or more non-anchor funding inputs
  - one child change output

## Current Code Assumptions That Matter

These assumptions are important because future top-up flows will break them if
we do not change them deliberately.

- `getTriggerReserveOutput(...)` assumes one deterministic per-vault trigger reserve output.
- `getTriggerReserveUtxoData(...)` assumes the reserve UTXO is the one funded in the vault tx itself.
- `getP2AVaultFundingBreakdown(...)` reconstructs the backup output and trigger reserve output from the vault tx.
- `coinSelectVaultTx(...)` always funds one backup output and one trigger reserve output during setup.
- `getRequiredTriggerReserveAmount(...)` answers a setup-time question, not a runtime top-up question.

In other words: current code thinks in terms of one built-in trigger reserve UTXO,
not a reserve UTXO set.

## Current Design Direction

Working idea: move toward a shared "anchor reserve" concept for both trigger and
rescue, while keeping their signers and funding origins different.

This is not final yet.

The intended simplification is:
- both trigger and rescue fee bumping should look like "parent anchor + reserve inputs + change"
- both should use the same CPFP mechanism once the reserve inputs are defined
- the difference should mainly be where those reserve inputs come from and who signs them

## Trigger Reserve Today And Proposed Extension

### Current trigger reserve

- Each vault gets a deterministic per-vault reserve output at setup time.
- It lives on its own reserve path, not on the ordinary hot-wallet spending path.
- It is funded up front so trigger can be accelerated later without relying on unrelated wallet funds.

### Proposed trigger top-up direction

- Keep the built-in deterministic trigger reserve funded at setup.
- Treat that built-in reserve as the first UTXO on the vault's trigger reserve
  branch, at `/0`.
- If that reserve later proves insufficient, the app may offer the user a way to
  add more funds to the same trigger reserve system.
- The top-up should feed the same general trigger acceleration mechanism rather
  than introducing a separate trigger-only emergency flow.
- Current leaning after this change:
  - trigger top-up should mean the same reserve branch / reserve UTXO set, not
    one forever-fixed single reserve outpoint

## Rescue Funding Today And Proposed Extension

### Current rescue funding

- Rescue is designed to work as a single high-fee parent transaction first.
- Only if that is not enough does the app consider an extra bump input later.

### Proposed rescue reserve direction

- Rescue would use a separate reserve signer, not the wallet signer.
- The current brainstorming direction is an ephemeral software signer created
  specifically for rescue acceleration funding.
- That reserve starts empty.
- If rescue acceleration is needed, the app would show the user a funding
  address derived from that rescue reserve signer.
- Later, rescue CPFP would spend:
  - the rescue anchor
  - reserve UTXO(s) controlled by that rescue reserve signer

## Ephemeral Rescue Reserve UX

Current brainstorming decision:

- if we use an ephemeral rescue reserve wallet, the UX must show the seed first
- the user must confirm that seed before the app shows the funding address
- this should behave similarly to the emergency-address creation wizard

Why:
- an in-memory-only rescue wallet is too risky if the user never records the seed
- the user must have a recovery path before real funds are sent there

Still open:
- whether the rescue reserve remains truly ephemeral after that
- whether the seed must also be exported again later from the rescue flow
- whether the reserve wallet should ever be persisted locally

## Shared CPFP Mechanism We Seem To Want

The likely shared model is:

1. Identify the P2A parent transaction.
2. Select reserve funding UTXO(s) for that action.
3. Build a child that spends:
   - the parent anchor
   - reserve funding input(s)
4. Send leftover value to the configured change output.

This model fits:
- trigger with deterministic reserve funding
- rescue with externally funded reserve UTXOs

This does not mean trigger and rescue become identical overall. They still differ in:
- signer trust model
- funding timing
- persistence and recovery story
- UX urgency

## Sizing: Two Different Questions

These should probably stay separate even if the overall idea becomes "anchor reserve".

### Setup-time sizing question

Current helper:
- `getRequiredTriggerReserveAmount(...)`

What it answers:
- how much reserve must be funded during vault creation so the first trigger CPFP
  child can reach the target trigger package fee ceiling

### Runtime top-up sizing question

Current shared primitive:
- `getRequiredNextReserveUtxoValue(...)`

What it should answer:
- given the current parent tx and current reserve availability, how much more
  reserve funding is needed now to reach the desired fee target

This is still not the same question as setup-time reserve sizing. The current
trigger setup code now uses the shared primitive through a trigger-specific
wrapper.

## Confirmed vs Unconfirmed Funding Rules

Already decided:
- `P2A_TRUC` vault setup must use confirmed wallet UTXOs only

Still open for reserve top-ups:
- must trigger reserve top-up UTXOs be confirmed before they are usable?
- must rescue reserve top-up UTXOs be confirmed before they are usable?
- or do we want to support a larger multi-parent package where a fresh funding tx
  and the CPFP child are all part of one chained relay story?

Important current limitation:
- the present CPFP helpers model `parent + child`
- they do not model a new upstream funding parent transaction created just before
  the child

So "send funds to the reserve address and use them immediately" is not free. It
would require a broader package model than the one currently implemented.

## Recovery And Persistence Risks

These are the biggest unresolved risks.

### Trigger top-up risk

- once trigger reserve top-ups exist, the app can no longer assume there is only
  one reserve UTXO inside the vault tx
- discovery and state tracking must support reserve UTXOs in plural

### Rescue reserve risk

- if rescue reserve funds are sent to an ephemeral wallet and the app closes,
  crashes, or the user loses context, those funds may become hard to recover
- showing and confirming the seed helps, but does not fully define the recovery
  story

### Backup scope risk

- on-chain backup today stores the trigger and rescue transactions
- it does not store rescue reserve signer state or reserve top-up state
- if reserve top-ups become part of the normal rescue path, recoverability needs
  a clear story

## Naming Notes

Working term:
- "anchor reserve"

But naming is not settled yet.

Important caution:
- simply renaming everything from "trigger reserve" to "anchor reserve" would be
  misleading today because the code is still structurally trigger-specific in
  several places

Likely better approach:
- keep trigger-specific names where the logic is truly trigger-specific
- introduce shared names only for the truly shared CPFP funding layer

## Open Design Questions

1. Is the shared concept really "same reserve address" or "same reserve funding mechanism"?
2. For trigger top-ups, how should additional UTXOs be derived and discovered on the same reserve branch?
3. For rescue, is the reserve per vault, per rescue attempt, or per temporary emergency wallet?
4. Must reserve top-up funds be confirmed before use?
5. Do we want to support immediate use of newly funded reserve UTXOs as part of a larger package?
6. What exact recovery promise do we make for rescue reserve funds?
7. Does any rescue reserve state need to be persisted locally, backed up, or both?
8. Should setup-time reserve sizing and runtime reserve top-up sizing use separate helpers?
9. Which names should stay trigger-specific, and which should move to shared CPFP-funding terminology?

## Current Leaning

The simplest direction that still matches the current codebase is:

- keep the current built-in deterministic trigger reserve model
- treat rescue reserve funding as a later external reserve flow
- reuse the same low-level CPFP funding mechanism where possible
- delay large renames until we know whether reserve UTXOs will stay singular or become plural
- keep `REWIND2.md` unchanged until these decisions are final

## Before Coding

The most important decisions to settle first are:

1. Whether reserve top-up UTXOs must be confirmed before use.
2. How rescue reserve seed persistence and recovery should work.
3. Whether future reserve handling is based on one reserve UTXO or a reserve UTXO set.

## Out Of Scope For This Temporary Doc

- updating `REWIND2.md`
- code changes
- translation updates
- final naming cleanup
- final UX copy
