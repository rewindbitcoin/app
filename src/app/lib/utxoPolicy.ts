// Copyright (C) 2025 Jose-Luis Landabaso - https://rewindbitcoin.com
// Licensed under the GNU GPL v3 or later. See the LICENSE file for details.

import moize from 'moize';
import { transactionFromHex } from './bitcoin';
import type { HistoryData, TxId, UtxosData, VaultsStatuses } from './vaults';

type VaultableMode = 'P2A_TRUC' | 'P2A_NON_TRUC';

type UtxoData = UtxosData[number];

export type UtxoUnavailableReason =
  | 'unconfirmedAcceleratableOutput'
  | 'unconfirmedV3Output'
  | 'trucRequiresConfirmedInput';

export type UtxoAvailability =
  | { status: 'selectable'; utxoData: UtxoData }
  | {
      status: 'temporarilyUnavailable';
      utxoData: UtxoData;
      reason: UtxoUnavailableReason;
    };

const getUnconfirmedTxIds = (historyData: HistoryData) =>
  new Set(
    historyData.filter(item => item.blockHeight === 0).map(item => item.txId)
  );

const getUnconfirmedAccelerationChildTxIds = (
  vaultsStatuses: VaultsStatuses,
  unconfirmedTxIds: Set<TxId>
) => {
  const accelerationChildTxIds = new Set<TxId>();

  Object.values(vaultsStatuses).forEach(vaultStatus => {
    [vaultStatus.triggerCpfpTxHex, vaultStatus.panicCpfpTxHex].forEach(
      txHex => {
        if (!txHex) return;
        const { txId } = transactionFromHex(txHex);
        if (unconfirmedTxIds.has(txId)) accelerationChildTxIds.add(txId);
      }
    );
  });

  return accelerationChildTxIds;
};

const keepOriginalReferenceIfUnchanged = (
  originalUtxosData: UtxosData,
  filteredUtxosData: UtxosData
) =>
  filteredUtxosData.length === originalUtxosData.length
    ? originalUtxosData
    : filteredUtxosData;

/**
 * Returns UTXOs that can fund a normal send transaction.
 *
 * Normal sends are v2 today, so they cannot spend outputs from unconfirmed v3
 * transactions. Confirmed v3 outputs are fine.
 */
export const getSendableUtxos = moize.shallow(
  (
    utxosData: UtxosData,
    vaultsStatuses: VaultsStatuses,
    historyData: HistoryData
  ): {
    utxosData: UtxosData;
    utxosAvailability: UtxoAvailability[];
  } => {
    const unconfirmedTxIds = getUnconfirmedTxIds(historyData);
    const unconfirmedAccelerationChildTxIds =
      getUnconfirmedAccelerationChildTxIds(vaultsStatuses, unconfirmedTxIds);

    const selectableUtxosData: UtxosData = [];
    const utxosAvailability: UtxoAvailability[] = utxosData.map(utxoData => {
      const txId = utxoData.tx.getId();
      const isUnconfirmed = unconfirmedTxIds.has(txId);
      if (unconfirmedAccelerationChildTxIds.has(txId))
        return {
          status: 'temporarilyUnavailable',
          utxoData,
          reason: 'unconfirmedAcceleratableOutput'
        };
      if (isUnconfirmed && utxoData.tx.version === 3)
        return {
          status: 'temporarilyUnavailable',
          utxoData,
          reason: 'unconfirmedV3Output'
        };
      selectableUtxosData.push(utxoData);
      return { status: 'selectable', utxoData };
    });
    return {
      utxosData: keepOriginalReferenceIfUnchanged(
        utxosData,
        selectableUtxosData
      ),
      utxosAvailability
    };
  }
);

/**
 * Returns UTXOs that can fund a new vault setup transaction.
 *
 * P2A_TRUC setup uses a v3 vault tx plus its backup child, so it only uses
 * confirmed wallet inputs. P2A_NON_TRUC setup builds a v2 vault tx, so it can
 * use unconfirmed inputs except outputs from unconfirmed v3 transactions.
 */
export const getVaultableUtxos = moize.shallow(
  (
    utxosData: UtxosData,
    vaultsStatuses: VaultsStatuses,
    historyData: HistoryData,
    vaultMode: VaultableMode
  ): {
    utxosData: UtxosData;
    utxosAvailability: UtxoAvailability[];
  } => {
    const unconfirmedTxIds = getUnconfirmedTxIds(historyData);
    const unconfirmedAccelerationChildTxIds =
      getUnconfirmedAccelerationChildTxIds(vaultsStatuses, unconfirmedTxIds);

    const selectableUtxosData: UtxosData = [];
    const utxosAvailability: UtxoAvailability[] = utxosData.map(utxoData => {
      const txId = utxoData.tx.getId();
      const isUnconfirmed = unconfirmedTxIds.has(txId);
      if (unconfirmedAccelerationChildTxIds.has(txId))
        return {
          status: 'temporarilyUnavailable',
          utxoData,
          reason: 'unconfirmedAcceleratableOutput'
        };
      if (isUnconfirmed && utxoData.tx.version === 3)
        return {
          status: 'temporarilyUnavailable',
          utxoData,
          reason: 'unconfirmedV3Output'
        };
      if (isUnconfirmed && vaultMode === 'P2A_TRUC')
        return {
          status: 'temporarilyUnavailable',
          utxoData,
          reason: 'trucRequiresConfirmedInput'
        };
      selectableUtxosData.push(utxoData);
      return { status: 'selectable', utxoData };
    });
    return {
      utxosData: keepOriginalReferenceIfUnchanged(
        utxosData,
        selectableUtxosData
      ),
      utxosAvailability
    };
  }
);
