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
import { vsize } from '@bitcoinerlab/coinselect';
import {
  coinSelectVaultTx,
  getTargetValue,
  MIN_RELAY_FEE_RATE,
  type UtxosData,
  estimateMinimumRequiredVaultedAmount,
  getMinBackupFeeBudget
} from './vaults';
import type { Accounts } from './wallets';
import { toBigInt, toNumber } from './sats';

type VaultAmountEstimate = {
  effectiveFee: number;
  vaultedAmount: number;
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
    const selected = coinSelectVaultTx({
      utxosData,
      vaultOutput,
      backupOutput,
      changeOutput,
      effectiveFeeRate,
      vaultMode,
      vaultedAmount: 'MAX_FUNDS'
    });
    if (typeof selected === 'string') return;
    const finalBackupFeeBudget = getTargetValue(selected.targets, backupOutput);
    return {
      effectiveFee: toNumber(selected.fee + finalBackupFeeBudget),
      vaultedAmount: toNumber(getTargetValue(selected.targets, vaultOutput))
    };
  }
);

/**
 * Estimates the smallest Rewind2 vault that can actually be created.
 *
 * This is intentionally based on the current vault design only: backup output,
 * vault dust, and the trigger/panic path constraints that the new app builds.
 */
const estimateMinimumVaultAmount = moize.shallow(
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
    const selected = coinSelectVaultTx({
      utxosData,
      vaultOutput,
      backupOutput,
      changeOutput,
      effectiveFeeRate,
      vaultMode,
      vaultedAmount: toBigInt(vaultedAmount)
    });
    if (typeof selected !== 'string') {
      const finalBackupFeeBudget = getTargetValue(
        selected.targets,
        backupOutput
      );
      return {
        vaultedAmount,
        effectiveFee: toNumber(selected.fee + finalBackupFeeBudget)
      };
    } else {
      //This means it wa impossible to construct a solution with the current
      //utxos. Now let's assume we had an additional utxo
      //This is then used in VaultSetUp to compute missingFunds:
      //"you need at least X more"...
      const vaultTxSize = vsize(
        [...utxosData.map(utxoData => utxoData.output), DUMMY_PKH_OUTPUT()],
        [vaultOutput, backupOutput, changeOutput]
      );
      const minBackupFeeBudget = toNumber(
        getMinBackupFeeBudget(effectiveFeeRate, backupOutput)
      );
      const vaultTxFeeRate = vaultMode === 'TRUC' ? 0 : MIN_RELAY_FEE_RATE;
      return {
        vaultedAmount,
        effectiveFee:
          minBackupFeeBudget + Math.ceil(vaultTxFeeRate * vaultTxSize)
      };
    }
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
