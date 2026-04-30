# Relay Recipes

Quick reference for the relay-policy traps Rewind2 keeps hitting around P2A,
TRUC/v3 transactions, NON_TRUC/v2 transactions, package relay, dust, CPFP and
replacement.

This is not a formal Bitcoin Core policy spec. It is a working checklist for
Rewind code review and debugging. When in doubt, re-check the upstream policy
docs linked at the bottom.

## General Rules Of Thumb

In this file, `TRUC` means Bitcoin Core's version-3 mempool policy. It is not
synonymous with "package": a v3 tx can be submitted alone or inside a package.
"Topological" means restrictions on unconfirmed parent/child relationships in
the mempool. `Parent` means the transaction that created the unconfirmed output
being spent; `child` means the transaction spending it.

| Area                                      | Rule of thumb                                                                                                                                                                                                                                                                                                                         |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| v2 spending confirmed v3                  | OK. Once confirmed, the parent's version no longer matters for TRUC inheritance.                                                                                                                                                                                                                                                      |
| v2 spending unconfirmed v3                | Not OK. A non-v3 mempool tx cannot spend an unconfirmed v3 parent.                                                                                                                                                                                                                                                                    |
| v3 spending confirmed v2                  | OK. Confirmed parents do not count as mempool ancestors.                                                                                                                                                                                                                                                                              |
| v3 spending unconfirmed v2                | Not OK. A version-3 tx cannot have an unconfirmed non-version-3 ancestor.                                                                                                                                                                                                                                                             |
| v3 spending unconfirmed v3                | Maybe. If the parent is already in mempool, the child can be submitted alone. If not, submit the parent first if it is valid by itself, or submit parent+child as a package if the parent needs the child for fees/dust. While unconfirmed, that parent can have only one child, and that child can have only one unconfirmed parent. |
| Child/change outputs                      | Must be non-dust. If the CPFP child output is dust, no valid package exists.                                                                                                                                                                                                                                                          |
| TRUC child size                           | A v3 tx with an unconfirmed TRUC ancestor must be at most 1000 vB. Any v3 tx must be at most 10,000 vB.                                                                                                                                                                                                                               |
| Descendants of an unconfirmed TRUC parent | While a TRUC parent is unconfirmed, only one unconfirmed tx may spend one of its outputs, and that child cannot have its own child yet. Do not add another tx spending a different parent output. Replace the existing child or wait for confirmation.                                                                                |
| TRUC has no CPFP carve-out                | CPFP carve-out is an older exception that can allow one extra fee-bump child in some non-TRUC cases. It does not apply to TRUC/v3 transactions.                                                                                                                                                                                       |
| Package limits                            | Generic package limit is 25 txs and 404,000 wu. TRUC child size may be the tighter limit for v3 children.                                                                                                                                                                                                                             |
| CPFP child fee                            | Child must satisfy its own minimum relay fee and the target package feerate.                                                                                                                                                                                                                                                          |
| General replacement                       | For a single-tx replacement: pay at least `originals' total fee + ceil(replacement tx vsize * 0.1 sat/vB)`. For parent+child package replacement, the replacement txs that replace originals must satisfy the same absolute-fee rule. In addition, the new package feerate must be higher.                                            |

## Rewind Rules Of Thumb

| Area                        | Rewind recipe                                                                                                                                                                                                                                                             |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Normal v2 send              | Skip unconfirmed v3 UTXOs. Normal sends are version 2 unless the code explicitly builds a v3 transaction.                                                                                                                                                                 |
| `P2A_TRUC` setup            | Use confirmed wallet UTXOs only. The v3 vault tx is published with a backup child, so extra unconfirmed ancestors break the shape.                                                                                                                                        |
| `P2A_NON_TRUC` setup        | Unconfirmed v2 UTXOs are usable if normal policy passes; unconfirmed v3 UTXOs must wait for confirmation.                                                                                                                                                                 |
| TRUC trigger parent         | v3, 0-sat P2A anchor, zero-fee parent. The package child spends the anchor and pays the fee.                                                                                                                                                                              |
| NON_TRUC trigger parent     | v2, 241-sat non-dust P2A anchor, parent pays direct relay fee.                                                                                                                                                                                                            |
| Rescue parent               | Uses a 241-sat non-dust P2A anchor. Even in TRUC/v3, a parent with a zero-value/dust P2A anchor must be zero-fee; rescue pays a direct high parent fee by design, so its anchor must be non-dust.                                                                         |
| Dust anchor                 | In Rewind, only the TRUC trigger uses a 0-sat/zero-value dust anchor, and only with a zero-fee parent.                                                                                                                                                                    |
| Rescue acceleration funding | Use a temporary in-memory reserve wallet, not ordinary hot-wallet UTXOs. If `P2A_TRUC`, wait for that funding tx to confirm before building the rescue child.                                                                                                             |
| TRUC child other inputs     | The unconfirmed trigger/rescue parent creates the P2A anchor. The fee-paying child spends that anchor plus other outputs (reserved funds we set up in advance). Since TRUC allows the child only one unconfirmed parent, those other outputs must already be confirmed.   |
| Start TRUC trigger          | Wait for the vault tx to confirm. In the trigger package, the presigned trigger parent is the only intended unconfirmed parent, so all other inputs must spend confirmed outputs, including the vault output and trigger-reserve output created by the vault tx.          |
| Start TRUC rescue           | Rescue spends the trigger output. In our TRUC flow, an unconfirmed trigger already has its CPFP child spending the P2A anchor, so rescue would be a second child of the same trigger tx. Wait for trigger confirmation first.                                             |
| Rewind package shape        | Stay with 1-parent/1-child packages for P2A acceleration.                                                                                                                                                                                                                 |
| Rewind CPFP replacement     | Applies to both P2A modes. The parent is unchanged and already in mempool, so the absolute-fee replacement rule is about the child: `new child fee >= old child fee + ceil(new child vsize * 0.1)`. Code also requires the new parent+child package feerate to be higher. |
| Pending UTXOs               | Send and setup hide some UTXOs until confirmation. This includes outputs from unconfirmed acceleration txs that may disappear if the user re-bumps them, and relay-policy-blocked outputs such as unconfirmed v3 funds in a v2 send/vault.                                |

## Version Inheritance Notes

Recipe: when building any v2 transaction, filter out UTXOs whose creating tx is
unconfirmed and `tx.version === 3`.

Recipe: treat v3/TRUC inheritance as a general mempool rule, not just a package
submission rule. A v3 tx can be submitted by itself or inside a package, but if
it spends an unconfirmed parent, that parent must also be v3.

Recipe: when building a TRUC/v3 child, count unconfirmed ancestors before
broadcast. The child should normally see exactly one unconfirmed parent: the P2A
parent it is fee-bumping.

Package submission is not required for every v3 child of an unconfirmed v3
parent. If the parent is already accepted in the mempool, the node already knows
the output being spent, so the child can be submitted alone. If the parent is not
in the mempool, the child alone spends an unknown output; submit the parent first
if it is valid by itself, or submit parent+child as a package if the parent needs
the child to be accepted. Rewind's zero-fee TRUC trigger with a 0-sat P2A anchor
is that package case: the parent and fee-paying child belong together.

## Rewind Transaction Shapes

| Flow                   | Parent version           | Child version | Anchor value | Parent fee                | Main policy reason                                              |
| ---------------------- | ------------------------ | ------------- | ------------ | ------------------------- | --------------------------------------------------------------- |
| `P2A_TRUC` trigger     | v3                       | v3            | 0 sats       | 0 sats                    | Ephemeral-dust parent must be zero-fee; child pays package fee. |
| `P2A_TRUC` rescue      | v3                       | v3 if bumped  | 241 sats     | High direct fee           | Rescue parent pays its own fee, so anchor must be non-dust.     |
| `P2A_NON_TRUC` trigger | v2                       | v2            | 241 sats     | At least relay fee        | Non-zero-fee parent cannot use dust anchor.                     |
| `P2A_NON_TRUC` rescue  | v2                       | v2 if bumped  | 241 sats     | High direct fee           | Same non-dust anchor rule.                                      |
| Normal send            | v2 by default            | none          | none         | User-selected fee         | Must not spend unconfirmed v3 outputs.                          |
| On-chain backup        | Same version as vault tx | none          | none         | Funded from backup output | For TRUC setup it is the vault tx's one unconfirmed child.      |

`P2A_NON_TRUC_ANCHOR_VALUE` is currently 241 sats. The local P2A dust threshold
constant is 240 sats, and the app uses dust+1 for normal spendable outputs.

## TRUC Topology Details

The rule-of-thumb table above has the hard constraints. The diagrams below are
the Rewind shapes that make those constraints easy to reason about.

TRUC mental model for Rewind:

```text
confirmed funding input(s)
  -> v3 parent with P2A anchor
       -> v3 CPFP child
```

The child has one unconfirmed parent. That is the shape we want.

Bad TRUC shape with unconfirmed top-up:

```text
unconfirmed trigger parent ----\
                               -> CPFP child
unconfirmed reserve top-up ----/
```

The child now has two unconfirmed parents. That does not fit the Rewind TRUC
recipe.

Bad TRUC shape with rescue before trigger confirms:

```text
unconfirmed trigger parent
  -> trigger CPFP child
  -> rescue parent
```

The trigger parent now has two unconfirmed descendants. For `P2A_TRUC`, rescue
should wait until the trigger confirms before broadcasting the rescue parent or a
rescue acceleration package. `P2A_NON_TRUC` does not have this TRUC one-child
restriction, though regular mempool limits still apply.

## Current UTXO Code Notes

| Code path                   | Current state                                                                             |
| --------------------------- | ----------------------------------------------------------------------------------------- |
| `src/app/lib/utxoPolicy.ts` | Owns stable, sendable and vaultable UTXO filters.                                         |
| `SetUpVaultScreen.tsx`      | Uses `getVaultableUtxosData(...)` for vault setup coin selection.                         |
| `SendScreen.tsx`            | Uses `getSendableUtxosData(...)` to skip unconfirmed v3 UTXOs for normal version-2 sends. |

## Dust And Anchor Recipes

Dust outputs are normally non-standard. Rewind only uses the deliberate
ephemeral-dust shape for the TRUC trigger: a 0-sat P2A anchor on a zero-fee
parent, spent immediately by the package child. This zero-fee requirement still
applies under TRUC/v3: if a parent creates a zero-value/dust P2A anchor, that
parent cannot also pay a direct fee.

Any parent that pays a direct fee needs a non-dust anchor. Any child/change
output must also be non-dust. Rescue pays a high direct parent fee by design, so
its P2A anchor is funded/non-dust even in `P2A_TRUC`. A funded P2A anchor
contributes value to the child fee budget.

Rewind-specific anchor policy:

| Parent           | Anchor   | Reason                                                                               |
| ---------------- | -------- | ------------------------------------------------------------------------------------ |
| TRUC trigger     | 0 sats   | Parent is zero-fee and child pays package fee.                                       |
| NON_TRUC trigger | 241 sats | Parent pays direct fee, so anchor must be non-dust.                                  |
| TRUC rescue      | 241 sats | Rescue pays high direct fee, so anchor must be non-dust even though tx version is 3. |
| NON_TRUC rescue  | 241 sats | Same direct-fee rule.                                                                |

`assertP2AParentPolicy(...)` checks the final extracted parent tx, not just the
intended settings. That catches signing/vsize/fee drift before broadcast.

## Package Math

Rewind should keep package submission simple: parent first, child second, no
duplicates, no conflicts and no arbitrary chains. The package feerate lets a
low-fee or zero-fee parent clear the dynamic mempool minimum when the child pays
enough, but the child still has to satisfy its own relay/dust constraints.

```text
package fee = parent fee + child fee
package vsize = parent vsize + child vsize
package feerate = package fee / package vsize
```

Child value conservation:

```text
anchor value + reserve inputs = child fee + child change output
```

Reserve sizing uses the same idea, but solves for the next reserve UTXO value:

```text
next reserve value >= child fee
                    + minimum child change value
                    - parent anchor value
                    - existing reserve value
```

## Replacement Recipes

General replacement must pay more absolute fee:

```text
replacement total fee >= originals total fee
                      + ceil(replacement vsize * 0.1 sat/vB)
```

Allowed package replacement applies this rule only to the txs that
replace mempool txs. The package feerate must also improve.

Rewind's CPFP child replacement is simple: the parent is unchanged, the old
child has no descendants, and the new child replaces the old child. Therefore the
parent fee cancels out, and both `P2A_TRUC` and `P2A_NON_TRUC` use:

```text
new child fee >= old child fee + ceil(new child vsize * 0.1 sat/vB)
new parent+child package feerate > old parent+child package feerate
```

Code searches package feerates in `0.01 sat/vB` steps. Rewind protects the
"old child has no descendants" assumption by blocking UTXOs created by
replaceable acceleration packages until they confirm.

## Fee-Rate Recipes

| Concept                            | Recipe                                                                              |
| ---------------------------------- | ----------------------------------------------------------------------------------- |
| Static minimum relay in app        | `MIN_FEE_RATE = 0.1 sat/vB`.                                                        |
| Incremental relay fee              | `INCREMENTAL_RELAY_FEE_RATE = 0.1 sat/vB` by Bitcoin Core default.                  |
| TRUC trigger parent direct fee     | Must be 0 because the anchor is dust.                                               |
| NON_TRUC trigger parent direct fee | Must be at least app relay floor because anchor is non-dust.                        |
| Rescue parent direct fee           | High presigned fee; anchor must be non-dust.                                        |
| CPFP child fee                     | Must satisfy child min relay and package target.                                    |
| Vault setup fee estimate           | Includes vault tx and on-chain backup package fees; excludes trigger reserve value. |

## Size Notes

The 1000 vB TRUC child limit is why reserve fee-bump children must avoid too many
extra inputs. Future top-up discovery should not blindly spend a large pile of
tiny UTXOs in a TRUC child.

## Common Failure Messages

| Symptom                                                               | Likely cause                                                                                         | Fix                                                                              |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `TRUC-violation, non-version=3 tx ... cannot spend from version=3 tx` | v2/NON_TRUC tx spent an unconfirmed v3 output.                                                       | Filter that UTXO until confirmed or build a valid v3 flow.                       |
| Dust or non-standard output rejection                                 | Parent has 0-sat P2A anchor but non-zero fee, or child output is dust.                               | Use zero-fee parent with package child, or fund a non-dust anchor/change output. |
| Package rejected despite good package feerate                         | Child fee itself is below minimum relay or package topology is invalid.                              | Check child min relay, child output dust and unconfirmed parent count.           |
| Replacement rejected despite higher feerate                           | New child did not pay enough extra absolute fee.                                                     | Apply previous child fee plus incremental relay delta.                           |
| TRUC child rejected for too many ancestors                            | Child also spends unconfirmed reserve/top-up input.                                                  | Wait for reserve/top-up confirmation.                                            |
| TRUC parent rejected for too many descendants                         | Another child is already attached to the same unconfirmed parent.                                    | Wait for parent confirmation or replace the existing child where policy allows.  |
| Rescue rejected after trigger is still pending                        | Rescue would spend the trigger output while the unconfirmed TRUC trigger already has its CPFP child. | Wait for trigger confirmation before rescue in TRUC mode.                        |

## Code Map

| File                                           | Relay-policy role                                                                           |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `src/app/lib/vaults.ts`                        | P2A constants, anchor values, dust checks, CPFP package estimates, parent policy assertion. |
| `src/app/lib/vaultActionTx.ts`                 | Acceleration/replacement fee floors, incremental relay rule, CPFP fee reconstruction.       |
| `src/app/lib/utxoPolicy.ts`                    | Stable, sendable and vaultable UTXO filters.                                                |
| `src/app/screens/SetUpVaultScreen.tsx`         | Vault setup coin selection using `getVaultableUtxosData(...)` and pending-funds guards.     |
| `src/app/screens/SendScreen.tsx`               | Normal send UTXO selection using the v2 unconfirmed-v3 filter.                              |
| `src/app/lib/sendTransaction.ts`               | Normal send tx construction; `new Psbt({ network })` defaults to v2.                        |
| `src/app/components/vaults/VaultCard.tsx`      | Trigger/rescue action gating and P2A package submission.                                    |
| `src/app/components/vaults/modals/Trigger.tsx` | Trigger start/acceleration UI and package fee selection.                                    |
| `src/app/components/vaults/modals/Rescue.tsx`  | Rescue parent-only and future rescue acceleration UI.                                       |
| `P2AFUNDINGFLOWS.md`                           | Rewind2 P2A funding design and open wizard work.                                            |
| `REWIND2.md`                                   | Higher-level Rewind2 mental model.                                                          |

## Open Checks And TODOs

| TODO                                                                                                                                                      | Reason                                                                                                     |
| --------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Re-check TRUC rescue start gating.                                                                                                                        | If trigger is still unconfirmed with its CPFP child, rescue parent is a second descendant of the trigger.  |
| Keep reserve top-up UTXOs confirmed before TRUC use.                                                                                                      | Unconfirmed top-ups become extra parents of the CPFP child.                                                |
| Future trigger top-up wizard must size for replacement rules, not only package feerate.                                                                   | Replacement also needs extra absolute child fee.                                                           |
| Future rescue acceleration wizard must stay same-session and in-memory, ask only for the current needed amount and wait for confirmation before TRUC use. | Rescue should not rely on compromised hot-wallet UTXOs or on persisted local rescue reserve state.         |
| Future top-up discovery must avoid too many tiny inputs in TRUC child.                                                                                    | Child must stay at or below 1000 vB.                                                                       |
| Keep parent policy assertions after final extraction.                                                                                                     | Signature sizes can change actual vsize/fee.                                                               |
| Decide how much upstream policy variation to tolerate.                                                                                                    | Nodes can configure mempool policy; Rewind should assume common Bitcoin Core defaults but fail gracefully. |

## Sources

| Source                                                                                                                       | What to re-check there                                                          |
| ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| [BIP 431: Topology Restrictions for Pinning](https://github.com/bitcoin/bips/blob/master/bip-0431.mediawiki)                 | TRUC/v3 inheritance, ancestor/descendant count, v3 size limits, replaceability. |
| [Bitcoin Core package policy](https://github.com/bitcoin/bitcoin/blob/master/doc/policy/packages.md)                         | Package shape, package limits, package feerate and package replacement.         |
| [Bitcoin Core mempool replacement policy](https://github.com/bitcoin/bitcoin/blob/master/doc/policy/mempool-replacements.md) | Replacement absolute fee, incremental relay fee and miner-ordering rules.       |
| `src/app/lib/vaults.ts`                                                                                                      | Rewind's current executable P2A policy assumptions.                             |
| `src/app/lib/vaultActionTx.ts`                                                                                               | Rewind's current replacement fee-floor implementation.                          |
