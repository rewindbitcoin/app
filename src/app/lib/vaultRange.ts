// Copyright (C) 2025 Jose-Luis Landabaso - https://rewindbitcoin.com
// Licensed under the GNU GPL v3 or later. See the LICENSE file for details.

import moize from 'moize';
import type { Network } from 'bitcoinjs-lib';
import {
  DUMMY_BACKUP_OUTPUT,
  DUMMY_CHANGE_OUTPUT,
  DUMMY_PKH_OUTPUT,
  DUMMY_TRIGGER_RESERVE_OUTPUT,
  DUMMY_VAULT_OUTPUT,
  getMainAccount
} from './vaultDescriptors';
import type { OutputInstance } from '@bitcoinerlab/descriptors';
import { vsize } from '@bitcoinerlab/coinselect';
import {
  coinSelectVaultTx,
  getTargetValue,
  type UtxosData,
  estimateMinimumRequiredVaultedAmount,
  getBackupFunding,
  getRequiredTriggerReserveValue
} from './vaults';
import type { Accounts } from './wallets';
import { toBigInt, toNumber } from './sats';
import { MIN_FEE_RATE } from './fees';
import { OP_RETURN_BACKUP_TX_VBYTES } from './vaultSizes';

type VaultSetupEstimate = {
  packageFee: number;
  packageFeeRate: number;
  triggerReserveValue: number;
  vaultedAmount: number;
};

const MAX_BACKUP_TX_VSIZE = Math.max(...OP_RETURN_BACKUP_TX_VBYTES);

export const estimateMaxVaultAmount = moize.shallow(
  ({
    utxosData,
    vaultOutput,
    backupOutput,
    triggerReserveOutput,
    triggerReserveValue,
    changeOutput,
    vaultMode,
    packageFeeRate
  }: {
    utxosData: UtxosData;
    vaultOutput: OutputInstance;
    backupOutput: OutputInstance;
    triggerReserveOutput: OutputInstance;
    triggerReserveValue: bigint;
    changeOutput: OutputInstance;
    vaultMode: 'P2A_TRUC' | 'P2A_NON_TRUC';
    packageFeeRate: number;
  }): VaultSetupEstimate | undefined => {
    const shouldFundTriggerReserve = triggerReserveValue > BigInt(0);
    const selected = coinSelectVaultTx({
      utxosData,
      vaultOutput,
      backupOutput,
      changeOutput,
      packageFeeRate,
      vaultMode,
      vaultedAmount: 'MAX_FUNDS',
      shiftFeesToBackupTx: true,
      ...(shouldFundTriggerReserve
        ? { triggerReserveOutput, triggerReserveValue }
        : {})
    });
    if (typeof selected === 'string') return;
    const finalBackupFunding = getTargetValue(selected.targets, backupOutput);
    // In this model the funded backup output later becomes the backup tx fee.
    const finalTriggerReserveValue = shouldFundTriggerReserve
      ? getTargetValue(selected.targets, triggerReserveOutput)
      : BigInt(0);
    const packageFee = toNumber(selected.fee + finalBackupFunding);
    return {
      packageFee,
      packageFeeRate: Number(
        (packageFee / (selected.vsize + MAX_BACKUP_TX_VSIZE)).toFixed(2)
      ),
      triggerReserveValue: toNumber(finalTriggerReserveValue),
      vaultedAmount: toNumber(getTargetValue(selected.targets, vaultOutput))
    };
  }
);

/**
 * Estimates the smallest P2A vault that can actually be created.
 *
 * This is intentionally based on the current vault design only: backup output,
 * vault dust, and the trigger/panic path constraints that the new app builds.
 */
const estimateMinimumVaultSetup = moize.shallow(
  ({
    utxosData,
    coldAddress,
    network,
    vaultOutput,
    backupOutput,
    triggerReserveOutput,
    triggerReserveValue,
    changeOutput,
    lockBlocks,
    packageFeeRate,
    vaultMode,
    presignedTriggerFeeRate,
    presignedRescueFeeRate
  }: {
    utxosData: UtxosData;
    coldAddress: string;
    network: Network;
    vaultOutput: OutputInstance;
    backupOutput: OutputInstance;
    triggerReserveOutput: OutputInstance;
    triggerReserveValue: bigint;
    changeOutput: OutputInstance;
    lockBlocks: number;
    packageFeeRate: number;
    /**
     * Structural parent mode.
     * P2A_TRUC means v3 + 0-sat anchor, P2A_NON_TRUC means v2 + funded anchor.
     */
    vaultMode: 'P2A_TRUC' | 'P2A_NON_TRUC';
    /** Fee rate baked directly into the trigger parent transaction. */
    presignedTriggerFeeRate: number;
    /** Fee rate baked directly into the rescue parent transaction. */
    presignedRescueFeeRate: number;
  }): VaultSetupEstimate => {
    const vaultedAmount = estimateMinimumRequiredVaultedAmount({
      coldAddress,
      lockBlocks,
      network,
      vaultMode,
      presignedTriggerFeeRate,
      presignedRescueFeeRate
    });
    const shouldFundTriggerReserve = triggerReserveValue > BigInt(0);
    const selected = coinSelectVaultTx({
      utxosData,
      vaultOutput,
      backupOutput,
      changeOutput,
      packageFeeRate,
      vaultMode,
      vaultedAmount: toBigInt(vaultedAmount),
      shiftFeesToBackupTx: true,
      ...(shouldFundTriggerReserve
        ? { triggerReserveOutput, triggerReserveValue }
        : {})
    });
    if (typeof selected !== 'string') {
      const finalBackupFunding = getTargetValue(selected.targets, backupOutput);
      // In this model the funded backup output later becomes the backup tx fee.
      const finalTriggerReserveValue = shouldFundTriggerReserve
        ? getTargetValue(selected.targets, triggerReserveOutput)
        : BigInt(0);
      const packageFee = toNumber(selected.fee + finalBackupFunding);
      return {
        vaultedAmount,
        packageFee,
        packageFeeRate: Number(
          (packageFee / (selected.vsize + MAX_BACKUP_TX_VSIZE)).toFixed(2)
        ),
        triggerReserveValue: toNumber(finalTriggerReserveValue)
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
      const backupFunding = toNumber(
        getBackupFunding(packageFeeRate, backupOutput)
      );
      const vaultTxFeeRate = vaultMode === 'P2A_TRUC' ? 0 : MIN_FEE_RATE;
      const packageFee =
        backupFunding + Math.ceil(vaultTxFeeRate * vaultTxSize);
      return {
        vaultedAmount,
        packageFee,
        packageFeeRate: Number(
          (packageFee / (vaultTxSize + MAX_BACKUP_TX_VSIZE)).toFixed(2)
        ),
        triggerReserveValue: toNumber(triggerReserveValue)
      };
    }
  }
);

export const estimateVaultSetupRange = moize.shallow(
  ({
    accounts,
    utxosData,
    coldAddress,
    minimumPackageFeeRate,
    packageFeeRate = null,
    lockBlocks,
    network,
    vaultMode,
    presignedTriggerFeeRate,
    presignedRescueFeeRate,
    maxTriggerFeeRate
  }: {
    accounts: Accounts;
    utxosData: UtxosData;
    coldAddress: string;
    minimumPackageFeeRate: number;
    packageFeeRate?: number | null;
    lockBlocks: number;
    network: Network;
    /**
     * Structural parent mode.
     * P2A_TRUC means v3 + 0-sat anchor, P2A_NON_TRUC means v2 + funded anchor.
     */
    vaultMode: 'P2A_TRUC' | 'P2A_NON_TRUC';
    /** Fee rate baked directly into the trigger parent transaction. */
    presignedTriggerFeeRate: number;
    /** Fee rate baked directly into the rescue parent transaction. */
    presignedRescueFeeRate: number;
    /** Trigger package-feerate ceiling used to size the dedicated reserve. */
    maxTriggerFeeRate: number;
  }) => {
    const backupOutput = DUMMY_BACKUP_OUTPUT(network);
    const changeOutput = DUMMY_CHANGE_OUTPUT(
      getMainAccount(accounts, network),
      network
    );
    const vaultOutput = DUMMY_VAULT_OUTPUT(network);
    const triggerReserveOutput = DUMMY_TRIGGER_RESERVE_OUTPUT(network);
    const triggerReserveValue = getRequiredTriggerReserveValue({
      triggerReserveOutput,
      changeOutput,
      vaultMode,
      presignedTriggerFeeRate,
      maxTriggerFeeRate
    });
    return {
      minimumVaultSetup: estimateMinimumVaultSetup({
        utxosData,
        coldAddress,
        network,
        vaultOutput,
        backupOutput,
        triggerReserveOutput,
        triggerReserveValue,
        changeOutput,
        lockBlocks,
        packageFeeRate: minimumPackageFeeRate,
        vaultMode,
        presignedTriggerFeeRate,
        presignedRescueFeeRate
      }),
      maxVaultAtMinimumPackageFeeRate: estimateMaxVaultAmount({
        utxosData,
        vaultOutput,
        backupOutput,
        triggerReserveOutput,
        triggerReserveValue,
        changeOutput,
        vaultMode,
        packageFeeRate: minimumPackageFeeRate
      }),
      maxVaultAtSelectedPackageFeeRate: estimateMaxVaultAmount({
        utxosData,
        vaultOutput,
        backupOutput,
        triggerReserveOutput,
        triggerReserveValue,
        changeOutput,
        vaultMode,
        packageFeeRate:
          packageFeeRate !== null ? packageFeeRate : minimumPackageFeeRate
      })
    };
  }
);
