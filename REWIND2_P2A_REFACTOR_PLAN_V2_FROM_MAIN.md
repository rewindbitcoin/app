# Rewind2 + P2A Refactor Plan v2 (From `main`, Risk-First)

Last updated: 2026-03-03
Starting point: `main`
Execution model: stage-by-stage with mandatory stop/review gates

---

## 0) Purpose

This plan replaces the previous implementation sequence with a risk-first sequence.

Primary objective:

- Deliver a clean Rewind2/P2A port from `main` that is policy-compatible on target backends, keeps legacy vaults operable, and removes service-fee creation logic.

Why this version exists:

- The previous pass proved many parts are correct, but we discovered key policy-semantics failures too late (template accepted in one context, rejected in another).
- This plan moves policy validation to the front so transaction template assumptions are frozen before broad UI integration.

---

## 1) Locked requirements (must hold)

### 1.1 Product and behavior

- New vaults are Rewind2-style only.
- Community Backups remain enabled for new vaults in this phase.
- Watchtower wire contract remains unchanged in this phase.
- No dedicated anchor-reserve output/descriptor is used in this phase.
- Trigger/Rescue CPFP children are funded from regular wallet UTXOs at submit time.
- UX must clearly recommend keeping a wallet-side fee buffer for emergency trigger/rescue package fees.
- Trigger/Rescue fee UX remains slider-based and simple.
- If selected fee is infeasible at submit time, clamp to highest feasible and warn.
- Delegate guidance must mention that an additional fee-bump child transaction may be required.
- Transaction policy defaults are network-specific:
  - `BITCOIN`: TRUC default ON.
  - `TESTNET`, `REGTEST`, `TAPE`: TRUC default OFF (demo/wow-factor friendly defaults).
- A user setting can toggle TRUC mode per network.
- Package submit endpoint `/txs/package` is treated as always available in-app:
  - direct to selected backend when supported,
  - otherwise routed through Rewind compatibility package backend.

### 1.2 New requirements from latest discussion

- Vaults are free going forward: no service fee for new vaults.
- Service address is not needed for new vault creation path.
- No legacy vault creation path is required anymore.
- Legacy vault handling is still required (read/status/trigger/rescue compatibility).
- Exported creation API name can remain `createVault`, but implementation must be Rewind2-only.
- `vaultMode` is inferred from trigger tx shape (`LEGACY`/`TRUC`/`NON_TRUC`) at runtime; no vault record migration field is required.
- Rewind2 playground implementation is the reference behavior baseline for tx construction and execution semantics.
- On-chain backups are in-scope for the refactor direction; backup indexing/discovery should align with Rewind2 behavior.

### 1.3 Policy-mode transaction rules (locked)

- `TRUC` mode:
  - Use v3 parent + v3 child, submitted as a package.
  - Zero-fee parent is allowed by design.
  - Zero-value P2A anchor is allowed by policy in package context.
- `NON_TRUC` mode:
  - Package can still be used for submission convenience.
  - Parent cannot be zero-fee; parent must satisfy relay minimum feerate.
  - Zero-value P2A anchor is not used; use non-dust anchor value.
- Execution uses inferred mode from tx shape, not runtime toggle.

### 1.4 Non-negotiables

- No destructive migration of stored legacy vault records.
- No regression in legacy vault operation.
- Stage-by-stage verification before advancing.
- Every newly added function must include a short TypeDoc header in plain human language (purpose + key precedence/rules when relevant).

---

## 2) Core lesson from previous run (what changes now)

The previous run had “assumption bugs”:

- We assumed policy behavior would accept the chosen transaction template across target backends.
- We integrated broad flow/UI before freezing policy-compatible tx template behavior.

This plan fixes sequencing:

1. Prove backend policy semantics first.
2. Freeze tx template contract second.
3. Build integration/UI on top of frozen contract.

---

## 3) Scope

### 3.1 In scope

- Rewind2-only vault creation from `main`.
- No-service-fee creation model.
- P2A package fee-bump execution path funded from regular wallet UTXOs (no dedicated anchor reserve).
- Legacy vault compatibility paths.
- Watchtower and backups compatibility.
- Deterministic tests and rollout gates.

### 3.2 Out of scope

- Backup architecture redesign.
- Watchtower API redesign.
- Legacy vault record rewrite.
- Safeguarded reserve policy/UX (`SAFEGUARDED`/`HOT_RELEASED`) in this pass.

---

## 4) Risk-first architecture contract

### 4.1 Vault families

- `legacy`: existing records remain supported.
- `rewind2`: only family created from now on.

### 4.2 Creation API

- Public creation entrypoint remains `createVault(...)`.
- Internally this is Rewind2 implementation only.
- `createLegacyVault(...)` is removed or retained only as dead/internal compatibility helper (not callable from create flow).

### 4.3 No-service-fee model

- New vault creation enforces `serviceFee = 0`.
- No service output in new vault tx construction.
- No service address fetch in new create flow.
- Existing legacy vaults with service fee remain readable/executable.

### 4.4 Broadcast model

- Package relay is the primary submission path.
- `/txs/package` is always available to app logic (direct backend or compatibility backend route).
- Sequential parent->child fallback exists only as resilience guard, not as primary mode.
- Idempotent duplicate handling by txid.
- Explicit error surfaces for endpoint/policy/parent-missing/infeasible/no-funds.

### 4.5 Tx policy mode contract

- Introduce explicit runtime `vaultMode` concept for Rewind2 flows:
  - `TRUC`
  - `NON_TRUC`
- Mode selection at creation time:
  - default from current network policy defaults,
  - overridable by settings toggle.
- Do not persist mode on vault records; infer mode from tx shape (`LEGACY`/`TRUC`/`NON_TRUC`) at runtime.
- Enforce mode-specific builders/validators:
  - `TRUC`: v3 + zero-fee parent + zero-value P2A anchor + package path.
  - `NON_TRUC`: non-zero parent fee + non-dust anchor + package path.

No further stage proceeds until this mode contract is implemented and tested.

---

## 5) Stage plan (with mandatory stop/review)

Each stage ends with:

- code diff,
- test evidence,
- short findings,
- explicit reviewer sign-off before next stage.

### Stage 0 - Baseline and planning lock

Goals:

- Start cleanly from `main`.
- Lock all requirements in this plan.

Tasks:

- Branch from `main` (new p2a-v2 branch).
- Add this plan file and a stage journal section (append-only).
- Define mandatory review packet template for each stage.

Exit criteria:

- Branch baseline established.
- Plan approved as execution contract.

---

### Stage 1 - Policy contract lock and matrix documentation (critical gate)

Goals:

- Eliminate policy assumption risk by locking explicit TRUC/NON_TRUC rules.

Tasks:

- Document fixed policy matrix from design + source docs (`rewind2 README`, `p2a guide`) in `docs/P2A_POLICY_MATRIX.md`.
- Record default mode per network (`BITCOIN=TRUC`, `TESTNET/REGTEST/TAPE=NON_TRUC`).
- Record package endpoint routing contract (direct or compatibility backend).
- Record mode-specific tx template invariants (zero-fee/zero-anchor vs non-zero/non-dust).
- Add at least one deterministic validation test per mode (TRUC path and NON_TRUC path).
- Persist findings in `docs/P2A_POLICY_MATRIX.md`.

Expected outputs:

- Capability matrix with yes/no and evidence logs for:
  - network defaults and toggle behavior,
  - tx template constraints by mode,
  - package routing guarantees,
  - duplicate tx semantics,
  - parent-missing windows.

Exit criteria:

- Policy matrix approved.
- Policy-mode contract approved (`TRUC`/`NON_TRUC`).

Do-not-proceed if:

- Mode-specific tx constraints are not fully specified.

#### Stage 1 practical checklist (simple and concrete)

This is the exact implementation checklist for Stage 1, in plain terms.

1. Add policy mode types and defaults

- Use explicit union `'TRUC' | 'NON_TRUC'` (no extra policy type alias required).
- Defaults are stored directly in settings fields:
  - `TESTING_VAULT_MODE = 'NON_TRUC'`
  - Mainnet creation path always uses `TRUC`.

2. Add user policy mode setting key

- Add settings key:
  - `TESTING_VAULT_MODE`
- Value shape:
  - `'TRUC' | 'NON_TRUC'`
- Rule:
  - Applies to `TESTNET`/`TAPE`/`REGTEST`.
  - New vault creation on `BITCOIN` always uses `TRUC`.

3. Keep vault schema stable (no new persistence field)

- Rule:
  - Infer mode from tx shape at runtime (P2A presence/value + tx version).
  - Legacy records remain unchanged.

4. Add small helper used by execution

- Add helper:
- `getVaultMode(vault)`
- Behavior:
- During trigger/rescue: infer mode from tx shape for Rewind2 vaults.
- For legacy vaults: infer `LEGACY` when no P2A output is present.

5. Add Stage 1 policy matrix doc content

- Add `docs/P2A_POLICY_MATRIX.md` with these locked statements:
  - TRUC mode: v3 parent+child package, zero-fee parent allowed, zero-value P2A anchor allowed.
  - NON_TRUC mode: parent must pay relay fee, non-dust anchor required, package still usable.
  - `/txs/package` is always available to app logic (direct backend or compatibility backend).
  - Duplicate and parent-missing errors must have explicit classification.

6. Add minimal deterministic tests (just enough for Stage 1)

- `S1-UNIT-001`: network defaults map correctly.
- `S1-UNIT-002`: per-network `*_VAULT_MODE` settings are consumed in creation flow.
- `S1-UNIT-003`: mode inference (`TRUC`/`NON_TRUC`/`LEGACY`) works from tx shape.
- `S1-UNIT-004`: no vault schema field changes were introduced for mode.
- `S1-UNIT-005`: matrix invariants snapshot (doc-contract test or constant-contract test).

7. Stage 1 review packet (required before Stage 2)

- Files changed and why.
- Exact defaults table used by code.
- Settings key + value example from a real object.
- Test command outputs (`npm test` or targeted tests) and results.
- Final confirmation sentence: “Stage 1 contract locked; Stage 2 can start.”

---

### Stage 2 - Transaction template contract freeze by inferred `vaultMode`

Goals:

- Freeze deterministic tx-building contract for both `TRUC` and `NON_TRUC` modes.

Tasks:

- Centralize tx template constants and invariants in `vaults.ts` (or dedicated helper module).
- Encode template-level assertions and explicit error reasons.
- Add focused unit tests for template-level invariants.
- Add docs section: “Template contract and why”.

Required invariants:

- Parent template produced by builder is policy-compatible for the vault's inferred mode.
- Child builder links correctly to parent anchor/output expectations.
- Template errors are typed, not stringly-typed ad hoc.

Exit criteria:

- Deterministic tx template contract merged and tested.

---

### Stage 3 - Domain model and storage codec scaffolding

Goals:

- Formalize family model and no-destructive migration behavior.

Tasks:

- Add/confirm family/version discriminators.
- Ensure legacy parser remains permissive.
- Define Rewind2 record schema fields needed for deterministic reconstruction.
- Keep vault record format stable; do not add mode fields.
- Remove new-write path dependence on legacy fee-grid semantics.

Exit criteria:

- Legacy read paths pass.
- Rewind2 schema can round-trip.
- Inference coverage from tx shape passes.

---

### Stage 4 - Creation cutover (Rewind2-only + no service fee)

Goals:

- Make `createVault(...)` produce only Rewind2 records with zero service fee.

Tasks:

- Implement/route `createVault(...)` to Rewind2 builder.
- Select creation policy from network `*_VAULT_MODE` setting.
- Remove service-fee/service-address usage from new create flow:
  - no service output target,
  - no service address fetch requirement,
  - service fee forced to zero.
- Keep legacy creation path non-callable from UI.
- Align create flow with Rewind2 on-chain backup indexing semantics.

Files likely touched:

- `src/app/lib/vaults.ts`
- `src/app/screens/CreateVaultScreen.tsx`
- `src/app/screens/SetUpVaultScreen.tsx`
- `src/app/contexts/WalletContext.tsx`

Exit criteria:

- New create flow works without service address dependencies.
- Newly created vaults are Rewind2-only records.

---

### Stage 5 - Setup range math invariants (no-service-fee aware)

Goals:

- Guarantee setup sliders and max/min amounts are always executable.

Tasks:

- Rework `vaultRange` computations for no-service-fee baseline.
- Ensure setup estimates remain valid without any dedicated reserve output.
- Add invariant tests:
  - `maxVaultAmountWhenMaxFee <= maxVaultAmount`,
  - any selected amount in range yields successful `selectVaultUtxosData`,
  - setup copy warns users to keep an additional wallet-side fee buffer.

Exit criteria:

- No setup-screen crashes due to non-selectable computed maxima.

---

### Stage 6 - Fee-buffer UX contract (no anchor reserve)

Goals:

- Keep the funding model simple and explicit for users.

Tasks:

- Add concise user guidance in setup/create/trigger/rescue flows:
  - fee-bump child spends regular wallet UTXOs,
  - keep a spendable fee buffer outside vaulted funds.
- Add deterministic error/copy when selected fee is infeasible with available wallet UTXOs.

Exit criteria:

- Users receive actionable buffer guidance and actionable infeasible-funding feedback.

---

### Stage 7 - Trigger/Rescue execution engine (core, UI-agnostic)

Goals:

- Move complex execution logic into reusable core functions before UI wiring.

Tasks:

- Build engine helpers for:
  - canonical parent resolution by inferred `vaultMode`,
  - wallet-UTXO child plan,
  - submit-time revalidation,
  - clamp-to-feasible logic,
  - insufficient-buffer classification.
- Return typed results and typed failures.

Exit criteria:

- Engine can run trigger/rescue flows without UI-specific branching.

---

### Stage 8 - Broadcast coordinator and policy-aware error surfaces

Goals:

- Make submission reliable and transparent under real backend behavior.

Tasks:

- Add coordinator that handles:
  - package submit path (direct backend or compatibility backend),
  - mode-specific preflight assertions,
  - sequential fallback with retry/backoff,
  - duplicate txid idempotency.
- Introduce explicit error classes/surfaces:
  - endpoint unavailable,
  - policy rejected,
  - parent missing,
  - selected fee infeasible (clamped),
  - no feasible child with current wallet UTXOs,
  - template/policy incompatibility (dedicated).
- Map each surface to user copy that is actionable and non-misleading.

Exit criteria:

- Known error scenarios route to deterministic outcomes and correct copy.

---

### Stage 9 - UI integration (thin UI over engine)

Goals:

- Wire create/trigger/rescue/header UX with minimal logic duplication.

Tasks:

- `SetUpVaultScreen`: no service-fee/service-address UI dependencies.
- `InitUnfreeze` and `Rescue`:
  - slider remains simple,
  - engine handles feasibility/funding decisions,
  - clamp warnings shown when needed.
- Keep buffer guidance copy non-technical and consistent across screens.
- Keep copy non-technical.

Exit criteria:

- End-to-end user flows work from UI with stable behavior.

---

### Stage 10 - Compatibility pass (legacy + watchtower + backups)

Goals:

- Ensure old vaults keep working while new creation is Rewind2-only.

Tasks:

- Legacy trigger/rescue/status paths regression pass.
- Watchtower registration remains wire-compatible:
  - legacy -> all trigger txids,
  - rewind2 -> canonical single txid in same array field.
- Backup read/write compatibility for Rewind2 and legacy records.

Exit criteria:

- No legacy behavior regression.
- Watchtower/backups compatibility verified.

---

### Stage 11 - Test expansion and deterministic hardening

Goals:

- Close reliability gaps before rollout.

Tasks:

- Unit coverage:
  - template contract,
  - no-service create path,
  - range invariants,
  - error classifier mapping,
  - duplicate idempotency.
- Integration/edge2edge coverage:
  - trigger/rescue happy paths,
  - wallet-UTXO child funding,
  - clamp path,
  - endpoint unavailable,
  - parent-missing timing,
  - template-policy rejection path.
- Replace brittle sleeps with deterministic waits.

Exit criteria:

- CI suite stable and reproducible.

---

### Stage 12 - Rollout readiness and launch checklist

Goals:

- Confirm operational readiness and rollback posture.

Tasks:

- Add lightweight diagnostics for:
  - funding mode usage,
  - clamp frequency,
  - broadcast failure class rates.
- Confirm feature-flag safety switches if available.
- Produce release checklist and known-limitations note.

Exit criteria:

- Ready for controlled release.

---

## 6) Review protocol (mandatory at every stage)

Each stop point must provide:

1. What changed (files + why).
2. Invariants touched (before/after).
3. Test commands + result summary.
4. Open risks and explicit recommendation.
5. Confirmation that new functions added in that stage include plain-language TypeDoc headers.

Reviewer options:

- `approve`: proceed to next stage.
- `revise`: fix issues in current stage.
- `hold`: pause and adjust plan.

---

## 7) Detailed test matrix

### 7.1 Unit tests

- Rewind2 creation without service fee.
- `createVault(...)` emits Rewind2-only records.
- Legacy record parse remains intact.
- Range/selectability invariants without reserve output assumptions.
- Child builder outcomes:
  - not needed,
  - wallet-UTXO success,
  - insufficient wallet buffer.
- Broadcast error classification:
  - duplicate,
  - endpoint unavailable,
  - policy reject,
  - parent missing,
  - template incompatibility.

### 7.2 Integration/regtest/dev-backend

- Create -> trigger -> rescue full path.
- Package path via direct backend and via compatibility route.
- Sequential fallback with retry.
- TRUC-mode flow (`BITCOIN` defaults): v3 + zero-fee parent behavior.
- NON_TRUC-mode flow (`TESTNET/REGTEST/TAPE` defaults): non-zero parent fee + non-dust anchor behavior.
- Clamp behavior when selected fee infeasible at submit-time.
- Legacy vault regression path.

### 7.3 UX and copy checks

- No service-fee references in create flow copy.
- Buffer guidance appears in trigger/rescue related copy where relevant.
- Error copy is actionable and not misleading.

---

## 8) Risk register (v2)

- **Policy mismatch on target backend**
  - Mitigation: Stage 1 locked policy matrix + compatibility package routing.
- **Mode drift after vault creation (toggle changed later)**
  - Mitigation: infer mode from tx shape; execution does not depend on later setting changes.
- **Range/math regressions in setup**
  - Mitigation: explicit selectability invariants and tests.
- **Insufficient wallet balance for CPFP child at trigger/rescue time**
  - Mitigation: pre-submit feasibility checks + clear user guidance to keep a spendable fee buffer.
- **Over-complex UI logic regressions**
  - Mitigation: engine-first, thin-UI integration.
- **Legacy behavior breakage**
  - Mitigation: explicit Stage 10 compatibility gate.
- **Misleading user error messages**
  - Mitigation: typed error surfaces + dedicated mapping.

---

## 9) Definition of done

Done means all are true:

- New vault creation from `main` is Rewind2-only and free (no service fee/service address).
- Network defaults are implemented (`BITCOIN=TRUC`, `TESTNET/REGTEST/TAPE=NON_TRUC`) with toggle support.
- `vaultMode` inference is deterministic from tx shape and execution is stable.
- Legacy vaults remain operable.
- Trigger/rescue execution is policy-compatible on target backend(s).
- Wallet-UTXO CPFP funding and clamp semantics work as specified.
- Users are clearly informed to keep a spendable fee buffer for emergency actions.
- Watchtower and backups remain compatible.
- Full test matrix passes.

---

## 10) Initial execution checklist (day 1 from `main`)

1. Create branch from `main`.
2. Commit this plan file.
3. Implement Stage 1 policy matrix + mode contract first.
4. Stop for review with matrix and invariants.
5. Do not start broad refactor until Stage 1 contract gate is approved.

---

## 11) Implementation journal template (for this v2 run)

Use this block for each completed stage:

```text
### Stage X - <title>

Status: completed

- Changes:
  - ...
- Tests:
  - ...
- Findings:
  - ...
- Risks left:
  - ...
```

---

## 12) Execution journal (current run)

### Stage 1 - Vault mode model simplification and inference wiring

Status: completed

- Changes:
  - Simplified policy model to inferred `vaultMode` (`'TRUC' | 'NON_TRUC' | 'LEGACY'`).
  - Removed extra policy abstraction layer and related indirection.
  - Added vault mode settings for creation defaults.
  - Wired runtime mode inference helpers from trigger tx shape and removed mode-passing plumbing.
- Tests:
  - `npm test`
- Findings:
  - Single-field mode model is easier to reason about and matches wallet KISS philosophy.
- Risks left:
  - Creation path was still legacy by default before Stage 2 cutover.

### Stage 2 - Rewind2-only creation cutover + no service-address dependency

Status: completed

- Changes:
  - Added Rewind2 creation builder (`createRewind2Vault(...)`) and made public `createVault(...)` route new vault creation to Rewind2-only mode.
  - Kept `createLegacyVault(...)` exported only for legacy compatibility tests/tools, not app create flow.
  - Removed service-address fetch dependency from create screen:
    - no `fetchServiceAddress` call in create flow,
    - uses dummy service output only for compatibility with existing shared selectors.
  - Enforced free-vault behavior in setup/create path:
    - service fee rate forced to zero in setup path,
    - settings default `SERVICE_FEE_RATE` set to `0`.
  - Kept vault schema stable (no new mode fields persisted).
  - Updated legacy edge2edge suite to call `createLegacyVault(...)` explicitly so legacy behavior remains covered without affecting new create policy.
- Tests:
  - `npm test`
- Findings:
  - New create flow no longer depends on service-address backend.
  - Legacy coverage remains intact while app creation path moves to Rewind2.
- Risks left:
  - On-chain-backup creation/index wiring still needs final alignment with the app create flow.
  - Mode-specific template differences (`TRUC` vs `NON_TRUC`) are partially shared and still need dedicated template-hardening stage.

### Stage 3 - Beginner-friendly vault mode toggle for demo networks

Status: completed

- Changes:
  - Added a simple `Vault Mode` setting UI for `TESTNET`/`TAPE`/`REGTEST` only, with one shared `TESTING_VAULT_MODE` setting.
  - Added two clear options for non-expert users:
    - `Fast Demo` (`NON_TRUC`)
    - `Realistic (TRUC)`
  - Added in-app explanation text about realism, slower demo flow due to confirmations, and fee-pinning safety benefits of TRUC.
  - Hid this setting on real Bitcoin network.
  - Enforced `BITCOIN` create flow to always use `TRUC` regardless of stored settings.
- Tests:
  - `npm test`
- Findings:
  - Users can now simulate real-network behavior on test environments without exposing risky mode switches on mainnet.
- Risks left:
  - UI setting behavior is covered by manual flows; no dedicated Settings UI test suite yet.

### Stage 4 - Direction lock update (anchor-reserve removed)

Status: completed

- Changes:
  - Locked refactor direction to no dedicated anchor-reserve model.
  - Locked trigger/rescue CPFP funding model to regular wallet UTXOs + parent P2A anchor.
  - Locked UX requirement to explain fee-buffer expectations to users.
- Tests:
  - Plan/documentation update only (no code changes in this stage).
- Findings:
  - This reduces architecture complexity and keeps execution aligned with current app behavior.
- Risks left:
  - Users may run out of spendable wallet UTXOs at emergency time if they vault nearly all funds; UX and errors must remain explicit.
