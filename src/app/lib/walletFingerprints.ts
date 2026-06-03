// Copyright (C) 2026 Jose-Luis Landabaso - https://rewindbitcoin.com
// Licensed under the GNU GPL v3 or later. See the LICENSE file for details.

import type { UtxosData } from './vaults';
import type { Accounts } from './wallets';

const UNSET_FINGERPRINT = 'unset';

/**
 * Returns a stable fingerprint for a UTXO set based on outpoints.
 *
 * utxoData is already memoized and is expected to preserve
 * its reference when the underlying txo list is unchanged. Send / SetupVault
 * screens use this helper on policy-filtered UTXO arrays (`sendable`/
 * `vaultable`), which can be recomputed when history or vault status changes
 * even if the selectable outpoints did not change.
 */
export const utxoFingerprint = (utxosData: UtxosData | undefined): string =>
  utxosData
    ? utxosData
        .map(utxoData => `${utxoData.tx.getId()}:${utxoData.vout}`)
        .sort()
        .join('|')
    : UNSET_FINGERPRINT;

/**
 * Returns a stable fingerprint for accounts used by transaction screens.
 *
 * This keeps the form from resetting when only an account name changes, while
 * still resetting when accounts are added, removed, or marked discarded.
 */
export const accountsFingerprint = (accounts: Accounts | undefined): string =>
  accounts
    ? Object.entries(accounts)
        .map(
          ([account, accountSettings]) =>
            `${account}:${accountSettings.discard ? 'discard' : 'active'}`
        )
        .sort()
        .join('|')
    : UNSET_FINGERPRINT;
