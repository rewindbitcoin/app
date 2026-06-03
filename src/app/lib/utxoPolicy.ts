// Copyright (C) 2025 Jose-Luis Landabaso - https://rewindbitcoin.com
// Licensed under the GNU GPL v3 or later. See the LICENSE file for details.

import moize from 'moize';
import { findVoutByScript, transactionFromHex } from './bitcoin';
import { ensureDescriptorsFactoryInstance } from './descriptorsFactory';
import { networkMapping, type NetworkId } from './network';
import {
  getRemainingBlocks,
  type HistoryData,
  type TxId,
  type UtxosData,
  type Vaults,
  type VaultsStatuses
} from './vaults';

type VaultableMode = 'P2A_TRUC' | 'P2A_NON_TRUC';

type UtxoData = UtxosData[number];

export type UtxoUnavailableReason =
  | 'unconfirmedAcceleratableOutput'
  | 'unconfirmedV3Output'
  | 'trucRequiresConfirmedInput'
  | 'frozenVaultOutput';

export type UtxoAvailability =
  | { status: 'selectable'; utxoData: UtxoData }
  | {
      status: 'temporarilyUnavailable';
      utxoData: UtxoData;
      reason: Exclude<UtxoUnavailableReason, 'frozenVaultOutput'>;
    }
  | {
      status: 'temporarilyUnavailable';
      utxoData: UtxoData;
      reason: 'frozenVaultOutput';
      /**
       * Used when we know the output is locked for a fixed number of blocks,
       * not when it is only waiting for a mempool transaction to confirm.
       */
      remainingBlocks: number;
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
 * Finds vault outputs that are still frozen and builds disabled Coin Control
 * rows for them. These outputs are not in the normal spendable UTXO list yet,
 * so we recreate them from each vault's trigger transaction and mark how many
 * blocks remain before they become selectable.
 */
const getFrozenVaultUtxosAvailability = moize.shallow(
  (
    vaults: Vaults,
    vaultsStatuses: VaultsStatuses,
    blockchainTip: number,
    networkId: NetworkId
  ): UtxoAvailability[] => {
    const { Output } = ensureDescriptorsFactoryInstance();
    const network = networkMapping[networkId];

    return Object.entries(vaults).flatMap(([vaultId, vault]) => {
      const vaultStatus = vaultsStatuses[vaultId];
      if (!vaultStatus) return [];
      if (!vaultStatus.triggerTxHex) return [];

      const remainingBlocks = getRemainingBlocks(
        vault,
        vaultStatus,
        blockchainTip
      );
      if (typeof remainingBlocks !== 'number' || remainingBlocks <= 0)
        return [];

      const output = new Output({
        descriptor: vault.triggerDescriptor,
        network
      });
      const { tx } = transactionFromHex(vaultStatus.triggerTxHex);
      const vout = findVoutByScript(tx, output.getScriptPubKey());
      if (vout < 0) throw new Error('Frozen vault trigger output not found');

      return [
        {
          status: 'temporarilyUnavailable',
          reason: 'frozenVaultOutput',
          remainingBlocks,
          utxoData: {
            tx,
            txHex: vaultStatus.triggerTxHex,
            vout,
            descriptor: vault.triggerDescriptor,
            output
          }
        }
      ];
    });
  }
);

/**
 * Adds still-frozen vault outputs to Coin Control so the user can see them and
 * why they cannot be selected. Use this only before rendering Coin Control; do
 * not use these extra rows as inputs for transaction building.
 */
export const withFrozenVaultUtxosForCoinControl = moize.shallow(
  (
    utxosAvailability: UtxoAvailability[],
    vaults: Vaults,
    vaultsStatuses: VaultsStatuses,
    blockchainTip: number,
    networkId: NetworkId
  ) => {
    const existingOutpoints = new Set(
      utxosAvailability.map(
        ({ utxoData }) => `${utxoData.tx.getId()}:${utxoData.vout}`
      )
    );
    const frozenVaultUtxosAvailability = getFrozenVaultUtxosAvailability(
      vaults,
      vaultsStatuses,
      blockchainTip,
      networkId
    ).filter(
      ({ utxoData }) =>
        !existingOutpoints.has(`${utxoData.tx.getId()}:${utxoData.vout}`)
    );

    return frozenVaultUtxosAvailability.length === 0
      ? utxosAvailability
      : [...utxosAvailability, ...frozenVaultUtxosAvailability];
  }
);

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
