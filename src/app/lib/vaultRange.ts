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
  getMinBackupFeeBudget,
  getRequiredTriggerReserveValue
} from './vaults';
import type { Accounts } from './wallets';
import { toBigInt, toNumber } from './sats';
import { MIN_FEE_RATE } from './fees';

type VaultAmountEstimate = {
  effectiveFee: number;
  vaultedAmount: number;
};

export const estimateMaxVaultAmount = moize.shallow(
  ({
    utxosData,
    vaultOutput,
    backupOutput,
    triggerReserveOutput,
    triggerReserveValue,
    changeOutput,
    vaultMode,
    effectiveFeeRate
  }: {
    utxosData: UtxosData;
    vaultOutput: OutputInstance;
    backupOutput: OutputInstance;
    triggerReserveOutput: OutputInstance;
    triggerReserveValue: bigint;
    changeOutput: OutputInstance;
    vaultMode: 'TRUC' | 'NON_TRUC';
    effectiveFeeRate: number;
  }): VaultAmountEstimate | undefined => {
    const selected = coinSelectVaultTx({
      utxosData,
      vaultOutput,
      backupOutput,
      triggerReserveOutput,
      triggerReserveValue,
      changeOutput,
      effectiveFeeRate,
      vaultMode,
      vaultedAmount: 'MAX_FUNDS'
    });
    if (typeof selected === 'string') return;
    const finalBackupFeeBudget = getTargetValue(selected.targets, backupOutput);
    const finalTriggerReserveValue = getTargetValue(
      selected.targets,
      triggerReserveOutput
    );
    return {
      //FIXME: this is not an effective fee - in fact this is then displayed
      //in the slider as a fee!?!?!
      effectiveFee: toNumber(
        selected.fee + finalBackupFeeBudget + finalTriggerReserveValue
      ),
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
    triggerReserveOutput,
    triggerReserveValue,
    changeOutput,
    lockBlocks,
    effectiveFeeRate,
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
    effectiveFeeRate: number;
    /**
     * Structural parent mode.
     * TRUC means v3 + 0-sat anchor, NON_TRUC means v2 + funded anchor.
     */
    vaultMode: 'TRUC' | 'NON_TRUC';
    /** Fee rate baked directly into the trigger parent transaction. */
    presignedTriggerFeeRate: number;
    /** Fee rate baked directly into the rescue parent transaction. */
    presignedRescueFeeRate: number;
  }): VaultAmountEstimate => {
    const vaultedAmount = estimateMinimumRequiredVaultedAmount({
      coldAddress,
      lockBlocks,
      network,
      vaultMode,
      presignedTriggerFeeRate,
      presignedRescueFeeRate
    });
    const selected = coinSelectVaultTx({
      utxosData,
      vaultOutput,
      backupOutput,
      triggerReserveOutput,
      triggerReserveValue,
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
      const finalTriggerReserveValue = getTargetValue(
        selected.targets,
        triggerReserveOutput
      );
      return {
        vaultedAmount,
        //FIXME: this is not an effective fee - in fact this is then displayed
        //in the slider as a fee!?!?!
        effectiveFee: toNumber(
          selected.fee + finalBackupFeeBudget + finalTriggerReserveValue
        )
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
      const triggerReserveAmount = toNumber(triggerReserveValue);
      const vaultTxFeeRate = vaultMode === 'TRUC' ? 0 : MIN_FEE_RATE;
      return {
        vaultedAmount,
        //FIXME: this is not an effective fee - in fact this is then displayed
        //in the slider as a fee!?!?!
        effectiveFee:
          minBackupFeeBudget +
          triggerReserveAmount +
          Math.ceil(vaultTxFeeRate * vaultTxSize)
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
    vaultMode,
    presignedTriggerFeeRate,
    presignedRescueFeeRate,
    maxTriggerFeeRate
  }: {
    accounts: Accounts;
    utxosData: UtxosData;
    coldAddress: string;
    minimumEffectiveFeeRate: number;
    effectiveFeeRate?: number | null;
    lockBlocks: number;
    network: Network;
    /**
     * Structural parent mode.
     * TRUC means v3 + 0-sat anchor, NON_TRUC means v2 + funded anchor.
     */
    vaultMode: 'TRUC' | 'NON_TRUC';
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
      minimumVaultAmount: estimateMinimumVaultAmount({
        utxosData,
        coldAddress,
        network,
        vaultOutput,
        backupOutput,
        triggerReserveOutput,
        triggerReserveValue,
        changeOutput,
        lockBlocks,
        effectiveFeeRate: minimumEffectiveFeeRate,
        vaultMode,
        presignedTriggerFeeRate,
        presignedRescueFeeRate
      }),
      maxVaultAmountAtMinFee: estimateMaxVaultAmount({
        utxosData,
        vaultOutput,
        backupOutput,
        triggerReserveOutput,
        triggerReserveValue,
        changeOutput,
        vaultMode,
        effectiveFeeRate: minimumEffectiveFeeRate
      }),
      maxVaultAmount: estimateMaxVaultAmount({
        utxosData,
        vaultOutput,
        backupOutput,
        triggerReserveOutput,
        triggerReserveValue,
        changeOutput,
        vaultMode,
        effectiveFeeRate:
          effectiveFeeRate !== null ? effectiveFeeRate : minimumEffectiveFeeRate
      })
    };
  }
);
