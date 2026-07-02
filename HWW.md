# Hardware Wallet Compatibility

This note explains what common Bitcoin hardware wallets can usually do, where
Rewind currently fits and what should change before HWW support is treated as
safe.

Short answer: current committed code only moved the trigger reserve output to a
BIP84-shaped path. The on-chain backup output still uses
`m/1073'/coin_type'/0'/<vaultIndex>`. That is acceptable while HWW support is
not shipping, but it remains a HWW risk because the backup transaction must
spend that output into `OP_RETURN`.

Moving the backup output to a BIP84-shaped path is still worth considering when
real HWW support is designed. The larger remaining risks are custom wallet
policies, change detection, the P2A CPFP child PSBT, large `OP_RETURN` backup
transactions and seed-derived message signatures.

## Sources

The analysis is based on these public interfaces and specs:

| Source | Relevant point |
| --- | --- |
| BHWI vision, `https://raw.githubusercontent.com/wizardsardine/bhwi/main/docs/VISION.md` | A HWW must reproduce addresses, wallet policy and change. It is not only a blind signer. |
| Bitcoin Core HWI support matrix, `https://hwi.readthedocs.io/en/latest/devices/index.html` | Common device features differ a lot. Some devices reject arbitrary scripts or non-wallet inputs. |
| Ledger Bitcoin app wallet policy docs, `https://raw.githubusercontent.com/LedgerHQ/app-bitcoin-new/develop/doc/wallet.md` | Default wallets are only standard BIP44, BIP49, BIP84 or BIP86 accounts. Other policies must be registered. |
| Ledger integration docs, `https://raw.githubusercontent.com/LedgerHQ/app-bitcoin-new/develop/doc/integration.md` | Ledger signs PSBTs against one wallet policy and hides change only when it matches that policy. |
| Ledger protocol docs, `https://raw.githubusercontent.com/LedgerHQ/app-bitcoin-new/develop/doc/bitcoin.md` | Commands include `GET_EXTENDED_PUBKEY`, `REGISTER_WALLET`, `SIGN_PSBT` and `SIGN_MESSAGE`. |
| BIP174 | PSBT output BIP32 derivation data is used by signers to detect change. |
| BIP388 | Wallet policies exist because devices need an account-level policy to verify receive/change scripts. |
| BIP322 and BIP137 | Message signing formats are interoperability formats, not deterministic key-derivation APIs. |

No real device test was run for this note. Anything marked "needs test" must be
verified on actual firmware before shipping.

## Common HWW Model

Most Bitcoin HWW flows are built from a few actions:

| Action | Common support | Rewind impact |
| --- | --- | --- |
| Get master fingerprint | Common | Needed for PSBT derivation metadata. |
| Get xpub for a path | Common, but non-standard paths may warn or require display | HWW `Signer` must store xpubs/descriptors instead of a mnemonic. |
| Display an address | Common for standard accounts | Rewind reserve addresses should be displayable from registered policies. Backup output display still needs a path/policy decision. |
| Sign PSBT | Common, but policy restrictions vary | Every Rewind signing surface must be classified by the account/policy being signed. |
| Register wallet policy | Ledger, BitBox02 and Jade support BIP388-style policy registration | Needed for non-default accounts, high account numbers and miniscript-style policies. |
| Sign message | Common through HWI, but not a deterministic secret API | Do not derive encryption keys from exact HWW message signature bytes. |

The important rule is: a HWW wants to know which wallet account it is signing
for. If it cannot prove an output is change for the same account, it should show
that output as an external payment or reject signing.

## Device Families

| Device family | What looks strong | Main limits for Rewind |
| --- | --- | --- |
| Ledger Bitcoin app v2.1+ | Wallet policies, default BIP44/49/84/86 accounts, PSBT signing, message signing and miniscript support | Default single-sig accounts have bounds. Account numbers over `100` and non-standard paths require policy registration. Change must match the wallet policy used for signing. P2A child PSBT and large `OP_RETURN` need real-device tests. |
| Trezor and KeepKey style devices | Standard single-sig, multisig, message signing and explicit `PAYTOOPRETURN` support in protocol | HWI says arbitrary scripts and arbitrary output scripts cannot be signed. HWI also says non-wallet inputs were removed in recent Trezor firmware. That is a likely blocker for a CPFP PSBT containing a P2A anchor input. |
| Coldcard | Strong PSBT workflow, single-sig and multisig, good air-gapped UX | HWI says Coldcard signs single-key and multisig transactions but cannot sign arbitrary scripts. P2A child PSBT and large `OP_RETURN` need tests. Miniscript is not a baseline assumption. |
| BitBox02 | BIP388 wallet policies are implemented, standard account UX is good | HWI says arbitrary scripts and non-wallet inputs are not supported. P2A child PSBT is likely a blocker unless firmware/client behavior has changed. |
| Blockstream Jade | BIP388 wallet policies are implemented and HWI lists arbitrary scripts plus non-wallet inputs | Jade has extra transport/PIN-server style flows. It is promising for Rewind, but P2A child PSBT, version 3 and large `OP_RETURN` need tests. |

## Rewind Signing Surfaces

| Surface | Current code | What the HWW sees | Risk |
| --- | --- | --- | --- |
| Normal send | `src/app/lib/sendTransaction.ts:240` signs wallet UTXOs | Usually standard wallet inputs, recipient output and change | Low if change belongs to the same account/script policy. Medium if user picks custom change from a different script/account. |
| Vault setup tx | `src/app/lib/vaults.ts:1538` builds and signs the vault tx | Wallet inputs, a large external-looking vault output, backup output, trigger reserve output and change | Medium. Scripts can be standard, but the HWW cannot understand Rewind vault semantics unless we teach/register them. Version 3 in P2A_TRUC needs tests. |
| Trigger parent | `src/app/lib/vaults.ts:1599` signs with `randomSigner` | Not signed by the main HWW today | Out of HWW scope for the main wallet. It uses special P2A/P2WSH shape. |
| Rescue parent | `src/app/lib/vaults.ts:1623` signs with `randomSigner` | Not signed by the main HWW today | Out of HWW scope for the main wallet. It uses special P2WSH and P2A shape. |
| Trigger CPFP child | `src/app/lib/vaults.ts:472` adds the P2A anchor input, then signs wallet/reserve inputs at `src/app/lib/vaults.ts:497` | A PSBT with one P2A input plus standard P2WPKH inputs | High. Some devices reject non-wallet or arbitrary-script inputs even if they do not sign them. |
| Rescue CPFP child | `src/app/components/vaults/useReserveBumpPlans.ts:196` uses the ephemeral rescue reserve signer | Usually not the main HWW | Low for main HWW. Risk depends on how rescue reserve is implemented later. |
| On-chain backup tx | `src/app/lib/backup/onchain.ts:836` spends backup output to `OP_RETURN` | A P2WPKH input at a custom Rewind path, one zero-value data output, no normal recipient | High. The custom derivation path and large `OP_RETURN` both need a HWW design and device tests. |
| Seed-derived cipher key | `src/app/lib/backup/shared.ts:13` signs `Satoshi Nakamoto` and hashes the signature | A message-signing prompt at a Rewind path | High. Message signing is not a portable deterministic secret API. |

## Custom Paths

Current paths with HWW impact:

| Path | Current use | Compatibility |
| --- | --- | --- |
| `m/1073'/coin_type'/0'/<vaultIndex>` | Vault identity, per-vault backup encryption material and current on-chain backup output path | High. Backup tx signing currently spends from this path. HWW support needs either a clear policy for this path or a backup-output path migration. |
| `m/84'/coin_type'/1073'/0/<vaultIndex>` | Trigger reserve output, via `getTriggerReservePath()` | Better. BIP84-shaped path, but account `1073'` is above Ledger default-wallet bounds and still needs policy registration there. |
| `m/1073'/coin_type'/1'/0` | Wallet data encryption key path | High risk for HWW if implemented through message signing. It is custom and depends on exact signature bytes. |
| `m/0'/0` style unvault key expression | Used to build the unvault path in the trigger descriptor | Out of scope if unvault signing is expected to use a special policy. It still needs a HWW design later. |

Current committed state keeps only the trigger reserve under the Rewind BIP84
account:

| Branch | Purpose |
| --- | --- |
| `/0/<vaultIndex>` | Trigger reserve output. |

Future HWW option: move the on-chain backup output to the same BIP84 account and
give backup and reserve explicit branches:

| Branch | Purpose |
| --- | --- |
| `/0/<vaultIndex>` | On-chain backup output, discovered like an external deterministic address. |
| `/1/<vaultIndex>` | Trigger reserve output, because it is internal wallet-owned reserve value. |

For Ledger, account `1073'` should be registered as a wallet policy, not used as
an unregistered default wallet, because account `1073'` is outside the default
bounds.

## Change Output Risks

Rewind allows custom change selection in normal sends, vault setup and trigger
CPFP actions:

| Code | Behavior |
| --- | --- |
| `src/app/screens/SendScreen.tsx:325` | Uses custom change if selected, otherwise preferred account change. |
| `src/app/screens/SetUpVaultScreen.tsx:238` | Lets vault setup estimate and use a custom change descriptor/index. |
| `src/app/components/vaults/modals/PresignedVaultAction.tsx:239` | Lets trigger CPFP use custom child change. |

This is fine for a software wallet. It is risky for HWW UX.

A Ledger-style signer gets one wallet policy for signing. Change is hidden only
when it matches that policy. If the user picks change from another script type
or account, the HWW may show it as a second external payment. That can be safe
only if the UI says it clearly and the user confirms it on-device.

Recommendation for HWW mode:

| Rule | Reason |
| --- | --- |
| Default to same-account change only | Best chance of clean signing across devices. |
| Disable custom change by default | Avoids accidental external-output prompts. |
| If custom change is enabled, treat it as an external output | Do not call it hidden change unless the HWW policy recognizes it. |
| Do not mix wallet policies inside one HWW signing request unless the target device supports it | Ledger signs against one wallet policy at a time. |

## P2A CPFP Child Risk

The trigger CPFP child is the hardest HWW transaction shape.

The transaction has:

| Input/output | Shape |
| --- | --- |
| Input 0 | P2A anchor input, finalized with empty witness. |
| Other inputs | Standard P2WPKH reserve and sometimes wallet supplement inputs. |
| Output | Change back to a wallet or reserve address. |

The HWW does not need to sign the P2A input. But many devices still parse every
input before signing. HWI explicitly says some devices do not support non-wallet
inputs or arbitrary scripts. That makes this a likely hard failure for Trezor and
BitBox02, and an unknown for Coldcard. Ledger and Jade are more promising but
still need real tests.

Mitigations to test:

| Mitigation | Notes |
| --- | --- |
| Finalize the P2A input before sending the PSBT to the HWW | BIP174 supports finalized inputs. Some devices may then ignore it, but this must be tested. |
| Keep CPFP child wallet inputs all in one standard BIP84 account | Reduces policy complexity. |
| Use a software-only reserve key for the small trigger reserve | This avoids HWW signing of the P2A child, but it gives the app a hot key for reserve funds. The vault funds still remain protected by the vault design. |
| Offer a parent-only mode for HWWs that cannot sign P2A children | Less flexible fee bumping. It may require higher parent fees. |

## Large OP_RETURN Backup Risk

The on-chain backup transaction currently stores `REW` plus encrypted backup
data in one `OP_RETURN` output:

| Backup entry | OP_RETURN payload |
| --- | --- |
| 20-byte emergency output data | `188` bytes |
| 32-byte emergency output data | `200` bytes |

Code references:

| Code | Behavior |
| --- | --- |
| `src/app/lib/backup/onchainFormat.ts:33` | Computes entry and payload sizes. |
| `src/app/lib/backup/onchain.ts:852` | Builds `REW + ciphertext`. |
| `src/app/lib/backup/onchain.ts:864` | Creates the `OP_RETURN` output. |

This has two separate risks:

| Risk | Details |
| --- | --- |
| HWW policy/display | Devices may reject large data outputs or show an alarming data/burn transaction. Device docs do not give one common safe limit. |
| Relay policy | Bitcoin Core policy changed over time. Older/default policy used an 83-byte script limit for data carrier relay. Newer policy may be larger, but the network is not uniform. |

Recommendation: keep this as a required hardware test vector. If common devices
reject it, HWW support needs a different backup design or a software-only backup
signing exception.

## Message Signatures Are Not A Stable Secret API

Rewind currently derives encryption keys by signing the fixed message
`Satoshi Nakamoto` and hashing the signature:

| Code | Behavior |
| --- | --- |
| `src/app/lib/backup/shared.ts:13` | Fixed message. |
| `src/app/lib/backup/shared.ts:50` | Signs the message with a private key. |
| `src/app/lib/backup/shared.ts:55` | Hashes the signature into a cipher key. |

This works for the current software signer because the app controls the signing
implementation. It is not safe to assume for HWWs.

Problems:

| Problem | Why it matters |
| --- | --- |
| Determinism is not part of the common API | HWI, Ledger and Trezor expose "sign message", not "derive deterministic secret". |
| Firmware can change signature behavior | A backup encrypted from exact signature bytes could become unrestorable. |
| User prompts are awkward | Restore may require signing a harmless-looking fixed message at a custom path. |
| Message signing formats differ | BIP137 legacy message signatures and BIP322 message signatures are interoperability formats, not key derivation formats. |

Recommendation: do not use message-signature bytes as the HWW backup encryption
key. Use a different HWW backup-key design. Possible directions are:

| Direction | Tradeoff |
| --- | --- |
| User password or recovery phrase for backup encryption | Portable, but adds user burden. |
| Device-specific secret/encryption API | Better UX on one device family, but not portable. |
| Store a random backup key encrypted to app storage plus a user backup | Simple for one phone, weaker for cross-device restore unless backed up. |
| Keep seed-derived signatures only for software wallets | Clear boundary, but HWW needs a separate backup protocol. |

## Version 3 And TRUC

P2A_TRUC uses version `3` parent transactions:

| Code | Behavior |
| --- | --- |
| `src/app/lib/vaults.ts:1541` | Vault setup tx is version 3 in P2A_TRUC. |
| `src/app/lib/vaults.ts:1600` | Trigger parent is version 3 in P2A_TRUC. |
| `src/app/lib/vaults.ts:1624` | Rescue parent is version 3 in P2A_TRUC. |
| `src/app/lib/backup/onchain.ts:839` | Backup tx inherits vault tx version. |

Bitcoin Core policy supports version 3 in modern releases, but HWW firmware may
have its own transaction-version checks. Ledger and Trezor protocol docs do not
give enough confidence to assume this works everywhere.

Recommendation: include version 3 txs in the physical HWW test suite. If a
device rejects version 3, use P2A_NON_TRUC or another non-v3 flow for that
device.

## Minimum HWW Test Vectors

Before enabling a device, test these exact flows on real firmware:

| Test | Expected result |
| --- | --- |
| Sign normal BIP84 send with same-account change | Device signs and hides change. |
| Sign normal BIP84 send with custom P2TR or P2PKH change | Device either shows custom change as external or rejects. The app must not mislabel it. |
| Register Rewind trigger reserve account `wpkh(@0/**)` at account `1073'` | Device registers or gives an understandable warning. |
| Sign vault setup tx in P2A_NON_TRUC | Device signs wallet inputs and shows external vault output clearly. |
| Sign vault setup tx in P2A_TRUC | Same as above, plus version 3 acceptance. |
| Sign backup tx with `188` byte OP_RETURN | Device accepts and user display is understandable. |
| Sign backup tx with `200` byte OP_RETURN | Device accepts and user display is understandable. |
| Sign trigger CPFP child with finalized P2A input | Device signs standard reserve/wallet inputs or gives a clear failure. |
| Sign trigger CPFP child with unfinalized P2A input | Optional comparison. This should not be the preferred path. |
| Message signing at the current Rewind paths twice | If signatures differ, current cipher-key derivation is impossible for that HWW. Even if they match, do not rely on this without a device guarantee. |

## Recommended HWW Plan

1. Add a real HWW signer abstraction first.
   It should support xpub retrieval, descriptor/policy registration, address display, PSBT signing and a separate backup-key capability. Do not pass `mnemonic` through HWW paths.

2. Keep the current beta path model until real HWW support is designed.
   Backup output remains `m/1073'/coin_type'/0'/<vaultIndex>`. Trigger reserve remains `m/84'/coin_type'/1073'/0/<vaultIndex>`.

3. Treat account `1073'` as a registered HWW policy.
   Do not rely on Ledger default-wallet behavior for this account because Ledger documents default account bounds.

4. Restrict HWW change by default.
   Use same-policy change unless the UI explicitly tells the user the custom output will appear as an external payment on the device.

5. Split software-wallet backup encryption from HWW backup encryption.
   The current seed-derived signature method is fine only for software wallets unless a device-specific deterministic secret API is chosen and documented.

6. Make P2A CPFP child signing a compatibility gate.
   Ledger and Jade are the first devices worth testing. Trezor and BitBox02 are likely blocked by non-wallet/arbitrary-script input limits.

7. Keep unvault/hot-spend policy separate.
   The unvault path is expected to need a special policy. Do not mix that work with basic HWW support for vault setup, backup and trigger fee bumping.

## Current Conclusion

The immediate mitigation already committed is the trigger reserve BIP84 path.
The backup output still uses the custom vault identity path as a spend path, so
backup tx signing remains a HWW compatibility issue.

The most important remaining blockers are not that path. They are:

| Blocker | Severity |
| --- | --- |
| Current code requires `signer.mnemonic` in core paths | Hard blocker |
| Message-signature-derived cipher keys | Hard blocker for portable HWW restore |
| Trigger CPFP child includes a P2A input | Hard or device-specific blocker |
| Large backup `OP_RETURN` | Device-specific blocker, needs tests |
| Mixed custom change | UX/security risk, must be restricted or shown as external |
| Version 3 P2A_TRUC txs | Needs tests |

So the trigger reserve path change helps, but the backup-output path migration
is deferred until HWW support is designed and tested.
