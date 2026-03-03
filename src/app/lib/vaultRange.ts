// Copyright (C) 2025 Jose-Luis Landabaso - https://rewindbitcoin.com
// Licensed under the GNU GPL v3 or later. See the LICENSE file for details.

import moize from 'moize';
import type { Network } from 'bitcoinjs-lib';
import {
  DUMMY_VAULT_OUTPUT,
  DUMMY_CHANGE_OUTPUT,
  DUMMY_PKH_OUTPUT,
  getMainAccount
} from './vaultDescriptors';
import type { OutputInstance } from '@bitcoinerlab/descriptors';
import { maxFunds, vsize, dustThreshold } from '@bitcoinerlab/coinselect';
import { findLowestTrueBinarySearch } from '../../common/lib/binarySearch';
import {
  UtxosData,
  getOutputsWithValue,
  selectVaultUtxosData,
  estimateLegacyTriggerTxSize,
  estimateLegacyPanicTxSize
} from './vaults';
import type { Accounts } from './wallets';
import { toNumber } from './sats';
// nLockTime which results into the largest possible serialized size:
const LOCK_BLOCKS_MAS_SIZE = 0xffff;
const MIN_VAULT_BIN_SEARCH_ITERS = 100;

type VaultAmountEstimate = {
  vaultTxMiningFee: number;
  vaultedAmount: number;
  serviceFee: number;
  transactionAmount: number;
};

/**
 * Estimates the max vaultable amount for a given fee rate.
 */
export const estimateLegacyMaxVaultAmount = moize.shallow(
  ({
    utxosData,
    vaultOutput,
    feeRate
  }: {
    utxosData: UtxosData;
    vaultOutput: OutputInstance;
    feeRate: number;
  }): VaultAmountEstimate | undefined => {
    const utxos = getOutputsWithValue(utxosData);
    if (utxos.length === 0) return;
    const utxosCoinselect = utxos.map(utxo => ({
      output: utxo.output,
      value: utxo.value
    }));
    const coinselected = maxFunds({
      utxos: utxosCoinselect,
      targets: [],
      remainder: vaultOutput,
      feeRate
    });
    if (!coinselected) return;
    const transactionAmount = coinselected.targets.reduce(
      (a, { value }) => a + toNumber(value),
      0
    );
    return {
      vaultTxMiningFee: toNumber(coinselected.fee),
      transactionAmount,
      vaultedAmount: transactionAmount,
      serviceFee: 0
    };
  }
);

/**
 *
 * Estimates the minimum vault amount needed to ensure at least `minRecoverableRatio`
 * of funds are recoverable (including serviceFee + vaultAmount), e.g., limiting loss
 * to no more than (1 - minRecoverableRatio) of the initial value due to miner fees.
 * F.ex. if minRecoverableRatio is 2/3, then loss is no more than 1/3.
 * This function might not always find the absolute minimum but provides a safe,
 * conservative estimation.
 *
 * Utilizing a binary search starting from `maxVaultAmount`, it tests for lower values
 * to determine the smallest vault amount maintaining a recoverable value ≥ a specified
 * ratio (e.g., 2/3). The function employs `findLowestTrueBinarySearch`
 * with `MIN_VAULT_BIN_SEARCH_ITERS` for binary search optimization. Ideally, the test
 * function used in the search should follow a predictable pattern (returning false below
 * a certain threshold and true above it). In practice, while the test function may not
 * perfectly align with this binary search expectation, it often suffices and yields
 * mostly accurate results.
 *
 * If a solution isn't found with the current UTXOs or if `maxVaultAmount` is undefined,
 * the function calculates an estimate assuming a new PKH UTXO will provide additional
 * funds. This approach, though possibly not 100% optimal because funds may come
 * from more than one UTXO, it is the best that can be estimated at this point
 *
 * The function returns the estimated minimum amount, derived either from the binary
 * search or the computed value in cases where current UTXOs don't provide a solution.
 *
 */
const estimateLegacyMinRecoverableVaultAmount = moize.shallow(
  ({
    utxosData,
    coldAddress,
    network,
    vaultOutput,
    changeOutput,
    lockBlocks,
    feeRate,
    feeRateCeiling,
    minRecoverableRatio
  }: {
    utxosData: UtxosData;
    coldAddress: string;
    network: Network;
    vaultOutput: OutputInstance;
    changeOutput: OutputInstance;
    lockBlocks: number;
    /** Fee rate used for the Vault*/
    feeRate: number;
    /** Max Fee rate for the presigned txs */
    feeRateCeiling: number;
    minRecoverableRatio: number;
  }): VaultAmountEstimate => {
    const isRecoverable = (transactionAmount: number) => {
      const vaultedAmount = transactionAmount;
      const selected = selectVaultUtxosData({
        utxosData,
        vaultedAmount,
        vaultOutput,
        changeOutput,
        feeRate,
        serviceFee: 0
      });
      if (!selected) return false;
      const totalFees =
        //selected.fee + (vaultedAmount is resulting amount after inital tx, so selected.fee has already been substracted from vaultedAmount)
        Math.ceil(feeRateCeiling * estimateLegacyTriggerTxSize(lockBlocks)) +
        Math.ceil(
          feeRateCeiling *
            estimateLegacyPanicTxSize(lockBlocks, coldAddress, network)
        );
      //Lets compute min assuming we want the system to be able to rescue funds.
      //That is the guy getting the rescue file can at least try to rescue some
      //money from the extorted friend.

      // vaultedAmount - totalFees > minRecoverableRatio * vaultedAmount
      // vaultedAmount - minRecoverableRatio * vaultedAmount > totalFees
      // vaultedAmount * (1 - minRecoverableRatio) > totalFees
      // vaultedAmount > totalFees / (1 - minRecoverableRatio)
      // If minRecoverableRatio =  2/3 => It can loose up to 1/3 of value in fees
      return vaultedAmount >= Math.ceil(totalFees / (1 - minRecoverableRatio));
    };

    //1st compute the max possible; This is the starting value in the binary tree
    //search. But first check if max is even possible.
    const maxVaultAmount = estimateLegacyMaxVaultAmount({
      vaultOutput,
      utxosData,
      feeRate
    });

    // If the current utxos cannot provide a solution, then we must
    // compute assuming that a new utxo (PKH) will send extra funds
    if (!maxVaultAmount || !isRecoverable(maxVaultAmount.transactionAmount)) {
      const vaultTxSize = vsize(
        [...utxosData.map(utxoData => utxoData.output), DUMMY_PKH_OUTPUT()],
        [vaultOutput, changeOutput]
      );
      const totalFees =
        //Math.ceil(feeRate * vaultTxSize) +
        Math.ceil(feeRateCeiling * estimateLegacyTriggerTxSize(lockBlocks)) +
        Math.ceil(
          feeRateCeiling *
            estimateLegacyPanicTxSize(lockBlocks, coldAddress, network)
        );

      const minTransactionAmount = Math.max(
        toNumber(dustThreshold(vaultOutput)) + 1,
        Math.ceil(totalFees / (1 - minRecoverableRatio))
      );
      //Note that minTransactionAmount won't be exact since there are roundings,
      //multiplications and divisions above. However, we're in the case
      //where the utxos cannot be used anyway. This is an approximated  way to
      //compute the minimum amount the user will need to add to the wallet
      //to be able to vault

      return {
        vaultTxMiningFee: Math.ceil(feeRate * vaultTxSize),
        vaultedAmount: minTransactionAmount,
        serviceFee: 0,
        transactionAmount: minTransactionAmount
      };
    } else {
      const { value: transactionAmount } = findLowestTrueBinarySearch(
        maxVaultAmount.transactionAmount,
        isRecoverable,
        MIN_VAULT_BIN_SEARCH_ITERS
      );
      if (transactionAmount !== undefined) {
        const vaultedAmount = transactionAmount;
        const selected = selectVaultUtxosData({
          utxosData,
          vaultedAmount,
          vaultOutput,
          changeOutput,
          feeRate,
          serviceFee: 0
        });
        if (!selected)
          throw new Error(
            'This should have a solution since isRecoverable calls it exactly the same'
          );
        return {
          vaultedAmount,
          transactionAmount,
          serviceFee: 0,
          vaultTxMiningFee: selected.fee
        };
      } else return maxVaultAmount;
    }
  }
);

export const estimateLegacyVaultSetUpRange = moize.shallow(
  ({
    accounts,
    utxosData,
    coldAddress,
    maxFeeRate,
    feeRate = null,
    feeRateCeiling,
    minRecoverableRatio,
    network
  }: {
    accounts: Accounts;
    utxosData: UtxosData;
    coldAddress: string;
    maxFeeRate: number;
    network: Network;
    feeRate?: number | null;
    feeRateCeiling: number;
    minRecoverableRatio: number;
  }) => {
    const maxVaultAmountWhenMaxFee = estimateLegacyMaxVaultAmount({
      utxosData,
      vaultOutput: DUMMY_VAULT_OUTPUT(network),
      feeRate: maxFeeRate
    });
    const minRecoverableVaultAmount = estimateLegacyMinRecoverableVaultAmount({
      utxosData,
      coldAddress,
      network,
      vaultOutput: DUMMY_VAULT_OUTPUT(network),
      changeOutput: DUMMY_CHANGE_OUTPUT(
        getMainAccount(accounts, network),
        network
      ),
      lockBlocks: LOCK_BLOCKS_MAS_SIZE,
      // Set it to worst case: express confirmation time so that
      // minRecoverableVaultAmount in the Slider does not change when the user
      // changes the feeRate
      feeRate: maxFeeRate,
      feeRateCeiling,
      minRecoverableRatio
    });
    const maxVaultAmount = estimateLegacyMaxVaultAmount({
      utxosData,
      vaultOutput: DUMMY_VAULT_OUTPUT(network),
      // while feeRate has not been set, estimate using the largest possible
      // feeRate. We allow the maxVaultAmount to change depending on the fee
      // rate selected by the uset
      feeRate: feeRate !== null ? feeRate : maxFeeRate
    });
    return {
      maxVaultAmountWhenMaxFee,
      minRecoverableVaultAmount,
      maxVaultAmount
    };
  }
);
