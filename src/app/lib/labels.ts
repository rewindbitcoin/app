// Copyright (C) 2026 Jose-Luis Landabaso - https://rewindbitcoin.com
// Licensed under the GNU GPL v3 or later. See the LICENSE file for details.

/**
 * Wallet labels design notes
 *
 * This file intentionally starts as a design stub. The goal is to keep the next
 * labels/BIP-329 branch focused before adding storage, UI, import, or export
 * code. Coin Control should stay intentionally sparse until labels and UTXO row
 * metadata are designed together instead of accreting one-off display fields.
 *
 * Terminology
 *
 * - A UTXO is identified by its outpoint: `txid:vout`.
 * - A label is user metadata. It is not blockchain data. Examples: "Salary",
 *   "Exchange withdrawal", "Do not spend", "KYC", "Gift from Alice".
 * - Labels can apply to different references: transactions, outputs/UTXOs,
 *   addresses, xpubs, public keys, inputs, etc.
 * - In Coin Control, the first useful label target is the output/UTXO, because
 *   users choose coins by context, not only by amount.
 *
 * BIP-329 direction
 *
 * - BIP-329 is the relevant Bitcoin wallet label interoperability format.
 * - It should be the import/export compatibility target.
 * - It should not blindly dictate every internal storage decision. It is an
 *   interchange format; the app still needs convenient typed lookups and
 *   possibly Rewind-specific metadata.
 * - The likely internal model should be a small typed superset of BIP-329:
 *   BIP-329-compatible core fields plus optional app-only fields.
 * - Export should strip app-only fields and produce valid BIP-329 records.
 * - Import should parse BIP-329 records, keep supported fields, and mark their
 *   provenance if useful.
 *
 * Internal model sketch, not an implementation commitment:
 *
 * ```ts
 * type LabelRef =
 *   | { type: 'tx'; txId: string }
 *   | { type: 'output'; txId: string; vout: number }
 *   | { type: 'address'; address: string }
 *   | { type: 'xpub'; xpub: string };
 *
 * type WalletLabel = {
 *   ref: LabelRef;
 *   label: string;
 *   origin?: string; // BIP-329 origin, when available
 *   source?: 'manual' | 'bip329-import';
 * };
 * ```
 *
 * Keep the first real model minimal. Do not add color, archived, createdAt,
 * updatedAt, tombstones, multiple-label semantics, or conflict metadata until a
 * concrete UX/storage need exists. Those can be added later as app-only fields
 * if the product actually needs them.
 *
 * Storage and privacy
 *
 * - Labels are privacy-sensitive. They can reveal identities, exchanges,
 *   spending intent, custody practices, or KYC status.
 * - Labels must follow the wallet's existing encrypted storage expectations.
 * - Import/export should be explicit user action. Do not silently leak labels
 *   to logs, network requests, analytics, or support payloads.
 * - If labels are exported, the UI should make clear that the export contains
 *   sensitive personal wallet metadata.
 *
 * Coin Control UX direction
 *
 * Keep the current Coin Control modal simple until this label model exists.
 * The modal currently has only data that is already safe and local to UTXOs:
 * amount, outpoint, descriptor-derived group, selectable/unavailable state, and
 * disabled reason. Richer rows should be added as one coherent UX pass.
 *
 * Useful future Coin Control row fields, in rough priority order:
 *
 * - amount
 * - user label for the UTXO/output
 * - short outpoint, with a way to inspect/copy full `txid:vout`
 * - confirmation state and either confirmations, block height, or date
 * - explorer link for the funding transaction
 * - source/group, such as receive/change/vault/native segwit/account
 * - disabled reason when the output cannot currently be selected
 *
 * Data that is not currently in CoinControlModal but will be needed for some of
 * the above:
 *
 * - `historyData` or a transaction metadata map for block height/time
 * - current tip height for confirmation count
 * - `blockExplorerURL` for explorer links
 * - label storage/indexes for output/address/tx labels
 * - reliable receive/change/source attribution if we choose to show it
 *
 * Address display caveat
 *
 * Showing the address for a UTXO can be useful, but can also confuse users.
 * For normal wallet UTXOs it may be a receive address or a change address. For
 * vault-related outputs, an address may be less meaningful than a semantic label
 * such as "Vault", "Unfreeze reserve", or "Change". Do not add address display
 * without deciding how source/type should be explained.
 *
 * Suggested implementation order
 *
 * 1. Define the minimal typed internal label model and BIP-329 parser/encoder.
 * 2. Add storage under the wallet's encrypted metadata path.
 * 3. Add derived lookup helpers, especially label-by-outpoint for Coin Control.
 * 4. Add unit tests for BIP-329 round-trips and invalid records.
 * 5. Add simple output labels to Coin Control rows.
 * 6. Add import/export UI once the storage and row display are stable.
 * 7. Consider richer Coin Control metadata: date, confirmations, explorer link,
 *    source/change annotations.
 */

export {};
