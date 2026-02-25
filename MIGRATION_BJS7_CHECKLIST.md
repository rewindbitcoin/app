# bitcoinjs-lib v7 port - master migration plan and progress log

Last updated: 2026-02-25

This document is the source of truth for the `bitcoinjs-lib v7` + `@bitcoinerlab/*` migration.
It tracks:

- the full staged plan,
- what has already been done,
- what still blocks completion,
- and exact next jobs so we do not miss anything.

---

## 1) Migration target and non-negotiable constraints

### Target

Upgrade app and tests to:

- `bitcoinjs-lib@7.x`
- `@bitcoinerlab/descriptors@3.x`
- `@bitcoinerlab/discovery@2.x`
- `@bitcoinerlab/coinselect@2.x`
- `@bitcoinerlab/explorer@1.x`
- `@bitcoinerlab/miniscript@2.x`

while preserving functionality and keeping the app buildable throughout.

### Hard constraints

- `sats` in domain code must be `bigint` (not `number`).
- App code should use typed arrays (`Uint8Array`) at bitcoin boundaries.
- Remove app-level `Buffer` usage.
- Keep changes staged and verifiable at each phase.

### Confirmed defaults

- Persist bigint values as decimal strings at storage boundaries.
- Keep tests TS-first (compiled to JS by current test build pipeline).

---

## 2) Status legend

- `[x]` complete
- `[~]` in progress / partially complete
- `[ ]` not started

---

## 3) High-level stage dashboard

- `[x]` Stage 0 - Baseline snapshot and guardrails
- `[x]` Stage 1 - Dependency major upgrades + temporary compatibility
- `[~]` Stage 2 - Sats/bytes boundaries and migration scaffolding
- `[~]` Stage 3 - Core vault/send logic migration (partial, still adapter-backed)
- `[~]` Stage 4 - Buffer removal (partial)
- `[~]` Stage 6 - Tests and integration hardening (functional E2E restored)
- `[ ]` Stage 5 - UI/state/storage full bigint normalization
- `[ ]` Stage 7 - Cleanup and enforcement gates

Note: Stage numbers reflect original plan order; Stage 6 has partial work because tests had to be updated and stabilized while migrating core APIs.

---

## 4) What has been accomplished so far (detailed)

### 4.1 Dependencies and package graph `[x]`

Installed and verified:

- `bitcoinjs-lib@7.0.1`
- `@bitcoinerlab/descriptors@3.0.5`
- `@bitcoinerlab/discovery@2.0.0`
- `@bitcoinerlab/coinselect@2.0.0`
- `@bitcoinerlab/explorer@1.0.0`
- `@bitcoinerlab/miniscript@2.0.0`
- `@bitcoinerlab/miniscript-policies@1.1.0` (added for policy compiler compatibility)

Command evidence:

- `npm ls bitcoinjs-lib @bitcoinerlab/descriptors @bitcoinerlab/discovery @bitcoinerlab/coinselect @bitcoinerlab/explorer @bitcoinerlab/miniscript @bitcoinerlab/miniscript-policies`

### 4.2 Build stability checkpoints `[x]`

Current status:

- `npm run build:src` passes.
- `npm run build:test` passes.

### 4.3 Runtime/API compatibility shims `[~]`

Added temporary conversion module:

- `src/app/lib/sats.ts`
  - `numberToSats(...)`
  - `satsToNumber(...)`
  - `satsToNumberOrUndefined(...)`

Purpose:

- keep app compiling while incrementally moving from number-based sats to bigint-based sats.

Important:

- these adapters are temporary and must be removed or isolated to strict I/O boundaries by later stages.

### 4.4 Core bitcoin flow compatibility updates `[~]`

Updated core modules to handle v7 + coinselect/discovery major changes while preserving behavior:

- `src/app/lib/vaults.ts`
- `src/app/lib/vaultRange.ts`
- `src/app/lib/sendTransaction.ts`
- `src/app/lib/walletDerivedData.ts`

Key changes included:

- coinselect call sites adapted for bigint value types;
- typed-array hex conversions via `uint8array-tools` where needed;
- temporary number/bigint bridges to keep existing interfaces working.

### 4.5 Compile policy readiness fix `[x]`

`@bitcoinerlab/miniscript-policies` now requires waiting for `ready` before compile functions.

Actions taken:

- App runtime path no longer depends on policy compilation boot timing:
  - `src/app/lib/vaultDescriptors.ts` now builds the known equivalent miniscript descriptor directly in `createTriggerDescriptor(...)`.
- Tests that still call `compilePolicy(...)` now wait for readiness:
  - `test/basic-vault.test.ts` -> `await ready`.
  - `test/batch-vault.js` -> `await ready`.

### 4.6 Discovery typing cleanup `[x]`

Removed fragile internal type import path:

- replaced `@bitcoinerlab/discovery/dist/types` usage in `src/app/lib/walletDerivedData.ts`.

### 4.7 Partial typed-array migration `[~]`

Some `Buffer`-style hex operations were replaced with `uint8array-tools` helpers in:

- `src/app/lib/vaults.ts`
- `src/app/lib/backup.ts`
- `src/app/screens/NewWalletScreen.tsx`
- tests updated similarly.

### 4.8 Test compatibility updates `[~]`

Updated test files for upgraded APIs/types:

- `test/basic-vault.test.ts`
- `test/edge2edge.test.ts`
- `test/vaultDescriptors.unit.test.ts`
- `test/batch-vault.js`

Current test outcome:

- Unit suites pass.
- E2E suites pass after discovery-v2 sequencing updates in `test/edge2edge.test.ts`.

### 4.9 Discovery v2 sequencing fix in E2E `[x]`

Implemented explicit fetch prerequisites before deriving indices/utxos:

- Fetch change descriptor before `getNextIndex({ descriptor: changeDescriptor })`.
- Fetch receive descriptor before `getNextIndex({ descriptor: receiveDescriptor })`.
- Re-fetch descriptor set before `getUtxos({ descriptors })`.
- Added network test timeouts to reduce false failures in slower environments.

Result:

- `test/edge2edge.test.js` now passes.
- Full `npm test` currently passes (with existing lint warnings only).

---

## 5) Current verification snapshot

### Command outcomes

- `npm run lint` -> passes with existing warnings only (no errors).
- `npm run build:src` -> pass.
- `npm run build:test` -> pass.
- `npm test` -> pass (all suites green).

### Historical E2E themes (now addressed)

1) Discovery v2 fetch/index sequencing:

- `Cannot derive data from ... since it has not been previously fetched`
- `Pass descriptor or descriptors`

Resolution:

- Added explicit `discovery.fetch(...)` calls before index/utxo derivation in E2E flow.

Keep monitoring for infra flakiness (`ECONNRESET`/`Bad Request`) in CI/regtest environments.

---

## 6) Full staged plan (with detailed checklists)

## Stage 0 - Baseline and guardrails `[x]`

### Goals

- Capture pre-upgrade behavior and failure baseline.
- Establish migration constraints and verification loop.

### Done

- Baseline commands run and documented.
- Known pre-existing warnings/failures recorded.

### Exit criteria

- Baseline understood and reproducible.

---

## Stage 1 - Dependency upgrade + buildable compatibility layer `[x]`

### Goals

- Upgrade dependency majors together.
- Keep app/build/test compile paths functional.

### Done

- All target dependency majors upgraded.
- Lockfile updated.
- Builds fixed (`build:src`, `build:test`).
- Temporary adapters introduced to bridge bigint/number mismatch.
- compilePolicy readiness issue addressed (runtime + tests).

### Outstanding from Stage 1

- none (dependency upgrade and compile compatibility goals met).

### Exit criteria

- achieved for build-level acceptance;
- functional E2E parity restored during Stage 6 hardening.

---

## Stage 2 - Introduce strict sats/bytes boundaries `[~]`

### Goals

- Define where number<->bigint conversions are allowed.
- Ensure UI/storage/network boundaries are explicit.

### Done

- Added shared sats conversion helpers (`src/app/lib/sats.ts`).
- Began using helpers in vault/send/ui components.

### Remaining checklist

- [ ] Introduce explicit `type Sats = bigint` in shared domain types.
- [ ] Restrict number<->bigint conversion to boundary modules only.
- [ ] Add boundary helper coverage for parse/format/serialize paths.
- [ ] Audit domain models so sat fields are bigint-native.

### Exit criteria

- Domain layer uses bigint for sats end-to-end.
- Number sats remain only at strictly defined UX/display boundaries.

---

## Stage 3 - Core vault/send/discovery flow migration `[~]`

### Goals

- Move core business logic from compatibility mode to true bigint/typed-array mode.

### Done

- Core files adapted enough to compile against new libs:
  - `src/app/lib/vaults.ts`
  - `src/app/lib/vaultRange.ts`
  - `src/app/lib/sendTransaction.ts`

### Remaining checklist

- [ ] Remove temporary number bridging from core computations.
- [ ] Ensure `txMap`, output values, fees, and dust comparisons are bigint-safe.
- [ ] Align discovery usage to v2 expectations (fetch before deriving indexes/utxos).
- [ ] Re-verify vault creation/unfreeze/panic flow under regtest.

### Exit criteria

- Core vault/send pipeline runs with bigint-native values and passes integration tests.

---

## Stage 4 - Remove Buffer usage from app code `[~]`

### Goals

- Eliminate app-level `Buffer` dependence in favor of typed arrays and explicit encoding utils.

### Current remaining `Buffer` references

- `src/app/lib/backup.ts:194`
- `src/app/lib/backup.ts:406`
- `src/app/lib/backup.ts:482`
- `src/common/lib/cipher.ts:12`
- `init.ts:99` (global polyfill)

### Remaining checklist

- [ ] Replace remaining `Buffer.from(...)` usage in `backup.ts`.
- [ ] Replace `Buffer` usage in `cipher.ts` with typed-array hashing input.
- [ ] Re-evaluate and remove `global.Buffer` polyfill from `init.ts` if no longer required.

### Exit criteria

- App source no longer uses `Buffer` directly (except explicitly justified third-party glue).

---

## Stage 5 - UI/state/storage normalization to bigint `[ ]`

### Goals

- Ensure state and UI deal with sats in a consistent boundary-safe manner.

### Remaining checklist

- [ ] Audit `WalletContext`/derived data for number sats assumptions.
- [ ] Ensure storage serialization/deserialization of bigint via decimal strings.
- [ ] Normalize amount/fee inputs to parse string -> bigint, render via formatter.
- [ ] Remove accidental mixed arithmetic (`number` + `bigint`) in UI paths.

### Exit criteria

- UI and persisted state obey boundary conventions without lossy conversions.

---

## Stage 6 - Tests, fixtures, and integration hardening `[~]`

### Goals

- Restore confidence with deterministic test coverage on new stack.

### Done

- Test compile works with updated dependencies.
- Multiple tests updated for v7 typed-array/bigint shifts.
- compilePolicy readiness integrated for tests that use it.
- Discovery v2 sequencing fixed in E2E setup/use paths.
- Full pipeline green: `npm test` passes.

### Remaining checklist

- [x] Fix regtest E2E flow with discovery v2 ordering requirements.
- [~] Investigate and stabilize explorer requests (`Bad Request`, `ECONNRESET`) in CI if flakiness appears.
- [ ] Add targeted regression tests for bigint fee math and conversion boundaries.
- [ ] Ensure E2E setup/teardown avoids leaking handles/timers.

### Exit criteria

- `npm test` green (currently achieved) and resilient in CI/regtest environments.

---

## Stage 7 - Cleanup and enforcement `[ ]`

### Goals

- Remove temporary migration debt and lock in guarantees.

### Remaining checklist

- [ ] Remove or reduce temporary compatibility adapters in `sats.ts`.
- [ ] Add CI guardrails for `Buffer` and sat number usage in domain code.
- [ ] Document final migration notes in repo docs.
- [ ] Final smoke test across main wallet/vault user journeys.

### Exit criteria

- Migration complete, enforced, and documented.

---

## 7) Immediate next jobs (ordered)

1. Remove remaining `Buffer` usages in `backup.ts`, `cipher.ts`, and `init.ts`.
2. Introduce explicit domain `Sats = bigint` typing and reduce adapter usage to I/O only.
3. Normalize UI/state/storage boundaries to bigint + decimal-string persistence.
4. Expand regression coverage for fee math and dust threshold behavior under bigint.
5. Add lightweight CI guardrails for `Buffer` and sat-number usage in domain modules.

---

## 8) Working change set snapshot

Current modified/new files in this migration branch include:

- `package.json`
- `package-lock.json`
- `src/app/lib/sats.ts` (new)
- `src/app/lib/vaults.ts`
- `src/app/lib/vaultRange.ts`
- `src/app/lib/sendTransaction.ts`
- `src/app/lib/vaultDescriptors.ts`
- `src/app/lib/backup.ts`
- `src/app/lib/walletDerivedData.ts`
- `src/app/screens/NewWalletScreen.tsx`
- `src/app/components/InitUnfreeze.tsx`
- `src/app/components/Rescue.tsx`
- `src/app/components/Transactions.tsx`
- `test/basic-vault.test.ts`
- `test/edge2edge.test.ts`
- `test/vaultDescriptors.unit.test.ts`
- `test/batch-vault.js`

Use `git status --short` for the live list.
