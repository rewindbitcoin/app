// Copyright (C) 2025 Jose-Luis Landabaso - https://rewindbitcoin.com
// Licensed under the GNU GPL v3 or later. See the LICENSE file for details.

import moize from 'moize';
import { transactionFromHex } from './bitcoin';
import type { HistoryData, TxId, UtxosData, VaultsStatuses } from './vaults';

type VaultableMode = 'P2A_TRUC' | 'P2A_NON_TRUC';

const getUnconfirmedTxIds = (historyData: HistoryData | undefined) =>
  new Set(
    historyData?.filter(item => item.blockHeight === 0).map(item => item.txId)
  );

const keepOriginalReferenceIfUnchanged = (
  originalUtxosData: UtxosData,
  filteredUtxosData: UtxosData
) =>
  filteredUtxosData.length === originalUtxosData.length
    ? originalUtxosData
    : filteredUtxosData;

/**
 * Returns UTXOs that are stable enough for generic wallet coin selection.
 *
 * Rewind hides outputs created by unconfirmed acceleration children because
 * those children may be replaced. If that happens, their outputs disappear, and
 * any later tx spending them would depend on an output that no longer exists.
 *
 * This is only a narrow subset of replaceability. In practice, any mempool tx
 * can be replaced by a conflicting tx if policy allows it. We may remove this
 * policy later and instead warn when replacing an acceleration tx whose outputs
 * have already been spent by another mempool tx.
 */
export const getStableUtxosData = moize.shallow(
  (
    utxosData: UtxosData,
    vaultsStatuses: VaultsStatuses | undefined,
    historyData: HistoryData | undefined
  ): UtxosData => {
    if (!vaultsStatuses || !historyData?.length) return utxosData;

    const unconfirmedTxIds = getUnconfirmedTxIds(historyData);
    const replaceableChildTxIds = new Set<TxId>();

    Object.values(vaultsStatuses).forEach(vaultStatus => {
      [vaultStatus.triggerCpfpTxHex, vaultStatus.panicCpfpTxHex].forEach(
        txHex => {
          if (!txHex) return;
          const { txId } = transactionFromHex(txHex);
          if (unconfirmedTxIds.has(txId)) replaceableChildTxIds.add(txId);
        }
      );
    });

    if (replaceableChildTxIds.size === 0) return utxosData;
    const stableUtxosData = utxosData.filter(
      utxoData => !replaceableChildTxIds.has(utxoData.tx.getId())
    );
    return keepOriginalReferenceIfUnchanged(utxosData, stableUtxosData);
  }
);

/**
 * Returns UTXOs that can fund a normal send transaction.
 *
 * Normal sends are v2 today, so they cannot spend outputs from unconfirmed v3
 * transactions. Confirmed v3 outputs are fine.
 */
export const getSendableUtxosData = moize.shallow(
  (
    utxosData: UtxosData,
    vaultsStatuses: VaultsStatuses | undefined,
    historyData: HistoryData | undefined
  ): UtxosData => {
    const stableUtxosData = getStableUtxosData(
      utxosData,
      vaultsStatuses,
      historyData
    );
    const unconfirmedTxIds = getUnconfirmedTxIds(historyData);
    if (unconfirmedTxIds.size === 0) return stableUtxosData;

    const sendableUtxosData = stableUtxosData.filter(utxoData => {
      const isUnconfirmed = unconfirmedTxIds.has(utxoData.tx.getId());
      return !isUnconfirmed || utxoData.tx.version !== 3;
    });
    return keepOriginalReferenceIfUnchanged(stableUtxosData, sendableUtxosData);
  }
);

/**
 * Returns UTXOs that can fund a new vault setup transaction.
 *
 * P2A_TRUC setup uses a v3 vault tx plus its backup child, so it only uses
 * confirmed wallet inputs. P2A_NON_TRUC setup builds a v2 vault tx, so it can
 * use unconfirmed inputs except outputs from unconfirmed v3 transactions.
 */
export const getVaultableUtxosData = moize.shallow(
  (
    utxosData: UtxosData,
    vaultsStatuses: VaultsStatuses | undefined,
    historyData: HistoryData | undefined,
    vaultMode: VaultableMode
  ): UtxosData => {
    const stableUtxosData = getStableUtxosData(
      utxosData,
      vaultsStatuses,
      historyData
    );
    const unconfirmedTxIds = getUnconfirmedTxIds(historyData);
    if (unconfirmedTxIds.size === 0) return stableUtxosData;

    const vaultableUtxosData = stableUtxosData.filter(utxoData => {
      const isUnconfirmed = unconfirmedTxIds.has(utxoData.tx.getId());
      if (!isUnconfirmed) return true;
      if (vaultMode === 'P2A_TRUC') return false;
      return utxoData.tx.version !== 3;
    });
    return keepOriginalReferenceIfUnchanged(
      stableUtxosData,
      vaultableUtxosData
    );
  }
);
