// Copyright (C) 2025 Jose-Luis Landabaso - https://rewindbitcoin.com
// Licensed under the GNU GPL v3 or later. See the LICENSE file for details.

import moize from 'moize';
import type { Network } from 'bitcoinjs-lib';
import {
  DUMMY_BACKUP_OUTPUT,
  DUMMY_CHANGE_OUTPUT,
  DUMMY_PKH_OUTPUT,
  DUMMY_VAULT_OUTPUT,
  getMainAccount
} from './vaultDescriptors';
import type { OutputInstance } from '@bitcoinerlab/descriptors';
import { dustThreshold, vsize } from '@bitcoinerlab/coinselect';
import {
  type UtxosData,
  estimateMinimumRequiredVaultedAmount,
  getBackupCost,
  selectCreateVaultUtxosData
} from './vaults';
import type { Accounts } from './wallets';
import { toNumber } from './sats';

type VaultAmountEstimate = {
  vaultTxMiningFee: number;
  vaultedAmount: number;
  transactionAmount: number;
};

export const estimateMaxVaultAmount = moize.shallow(
  ({
    utxosData,
    vaultOutput,
    backupOutput,
    changeOutput,
    vaultMode,
    effectiveFeeRate
  }: {
    utxosData: UtxosData;
    vaultOutput: OutputInstance;
    backupOutput: OutputInstance;
    changeOutput: OutputInstance;
    vaultMode: 'TRUC' | 'NON_TRUC';
    effectiveFeeRate: number;
  }): VaultAmountEstimate | undefined => {
    const selected = selectCreateVaultUtxosData({
      utxosData,
      vaultOutput,
      backupOutput,
      changeOutput,
      effectiveFeeRate,
      vaultMode,
      vaultedAmount: 'MAX_FUNDS'
    });
    if (!selected) return;
    return {
      vaultTxMiningFee: selected.vaultTxFee,
      transactionAmount: selected.transactionAmount,
      vaultedAmount: selected.vaultedAmount
    };
  }
);

/**
 * Estimates the smallest Rewind2 vault that can actually be created.
 *
 * This is intentionally based on the current vault design only: backup output,
 * vault dust, and the trigger/panic path constraints that the new app builds.
 */
export const estimateMinimumVaultAmount = moize.shallow(
  ({
    utxosData,
    coldAddress,
    network,
    vaultOutput,
    backupOutput,
    changeOutput,
    lockBlocks,
    effectiveFeeRate,
    vaultMode
  }: {
    utxosData: UtxosData;
    coldAddress: string;
    network: Network;
    vaultOutput: OutputInstance;
    backupOutput: OutputInstance;
    changeOutput: OutputInstance;
    lockBlocks: number;
    effectiveFeeRate: number;
    vaultMode: 'TRUC' | 'NON_TRUC';
  }): VaultAmountEstimate => {
    const vaultedAmount = estimateMinimumRequiredVaultedAmount({
      coldAddress,
      lockBlocks,
      network,
      vaultMode
    });
    const selected = selectCreateVaultUtxosData({
      utxosData,
      vaultedAmount,
      vaultOutput,
      backupOutput,
      changeOutput,
      effectiveFeeRate,
      vaultMode
    });
    if (selected) {
      return {
        vaultedAmount,
        transactionAmount: selected.transactionAmount,
        vaultTxMiningFee: selected.vaultTxFee
      };
    }

    const vaultTxSize = vsize(
      [...utxosData.map(utxoData => utxoData.output), DUMMY_PKH_OUTPUT()],
      [vaultOutput, backupOutput, changeOutput]
    );
    const minimumBackupCost = Math.max(
      toNumber(getBackupCost(effectiveFeeRate)),
      toNumber(dustThreshold(backupOutput)) + 1
    );
    return {
      vaultedAmount,
      transactionAmount: vaultedAmount + minimumBackupCost,
      vaultTxMiningFee: Math.ceil(effectiveFeeRate * vaultTxSize)
    };
  }
);

export const estimateVaultSetupRange = moize.shallow(
  ({
    accounts,
    utxosData,
    coldAddress,
    minimumEffectiveFeeRate,
    effectiveFeeRate = null,
    lockBlocks,
    network,
    vaultMode
  }: {
    accounts: Accounts;
    utxosData: UtxosData;
    coldAddress: string;
    minimumEffectiveFeeRate: number;
    effectiveFeeRate?: number | null;
    lockBlocks: number;
    network: Network;
    vaultMode: 'TRUC' | 'NON_TRUC';
  }) => {
    const backupOutput = DUMMY_BACKUP_OUTPUT(network);
    const changeOutput = DUMMY_CHANGE_OUTPUT(
      getMainAccount(accounts, network),
      network
    );
    const vaultOutput = DUMMY_VAULT_OUTPUT(network);
    return {
      minimumVaultAmount: estimateMinimumVaultAmount({
        utxosData,
        coldAddress,
        network,
        vaultOutput,
        backupOutput,
        changeOutput,
        lockBlocks,
        effectiveFeeRate: minimumEffectiveFeeRate,
        vaultMode
      }),
      maxVaultAmountAtMinFee: estimateMaxVaultAmount({
        utxosData,
        vaultOutput,
        backupOutput,
        changeOutput,
        vaultMode,
        effectiveFeeRate: minimumEffectiveFeeRate
      }),
      maxVaultAmount: estimateMaxVaultAmount({
        utxosData,
        vaultOutput,
        backupOutput,
        changeOutput,
        vaultMode,
        effectiveFeeRate:
          effectiveFeeRate !== null ? effectiveFeeRate : minimumEffectiveFeeRate
      })
    };
  }
);
