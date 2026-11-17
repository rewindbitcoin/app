# Tests

Edit the TypeScript test sources. `npm run build:src` writes the runtime code to
`dist/`, which tests import; `npm run build:test` generates `.js`/`.d.ts` beside
the test sources. Jest runs `*.test.js`, so rebuild both before testing to avoid
stale results. Do not hand-edit the generated files.

## Fast unit checks (no Docker or transaction broadcast)

From the repository root:

```sh
npm run lint && npm run build:src && npm run build:test && \
  npx --no-install jest --testPathPatterns='unit\.test\.js$' --runInBand
```

Focused funding/fee/coin-picker checks:

```sh
npm run build:src && npm run build:test && \
  npx --no-install jest test/vaultActionFunding.unit.test.js \
    test/vaultActionUi.unit.test.js test/coinControlUi.unit.test.js \
    test/vaults.unit.test.js --runInBand
```

| Source | Coverage |
| --- | --- |
| `vaultActionFunding.unit.test.ts` | Selected-fee funding decisions, low-fee advisories, wallet permission, manual-vs-total shortages, pending funds and separate rescue funding. |
| `vaultActionUi.unit.test.ts` | Real modal handlers with isolated hooks/native stubs: sticky permission/picks, stale outpoints, Advanced/custom-change recovery, exact Rescue target/step, preferred-unit funding amounts and exact BIP21 QR. |
| `coinControlUi.unit.test.ts` | A long list with a fixed footer, explicit apply, Cancel/re-entry, dirty-draft dismissal, unavailable coins, Android-back routing and dragged-sheet close veto. |
| `vaults.unit.test.ts` | Reserve-first action building, replacement fee floors and rounding/input transitions, additional-funding sizing, first-package feasibility and TRUC rescue-child ancestor guards with the separate parent-only branch retained. |

Other unit suites cover descriptors, on-chain backups, compatibility/security,
coin selection, labels, crypto/platform setup and settings. The UI tests do not
render a real device, prove node relay acceptance, or replace physical slider
interaction checks. See [P2AFUNDINGFLOWS.md](../P2AFUNDINGFLOWS.md) and
[RELAY_RECIPES.md](../RELAY_RECIPES.md) for the corresponding behavior/policy.

`npm run lint` currently covers `.ts`, not `.tsx`. For changed UI files run a
targeted lint as well, for example:

```sh
ESLINT_USE_FLAT_CONFIG=false npx --no-install eslint \
  src/app/components/AdvancedTransactionOptions.tsx \
  src/app/components/CoinControl.tsx src/common/components/Modal.tsx
```

## Full/regtest suites

`npm test` also runs `npm run ensureTester` before Jest. This pulls/starts the
Docker `bitcoinerlab/tape` environment and includes transaction integration
suites such as `basic-vault.test.ts` and `edge2edge.test.ts`, which submit
transactions to regtest. Do not use it as the fast, no-broadcast UI/unit loop.

The default tester ports are `8080/60401/3002/5123`; integration tests read
`ESPLORA_PORT` (default `3002`). Check for port conflicts before starting it,
especially when a native development flow already uses local services.
