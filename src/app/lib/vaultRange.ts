import moize from 'moize';
import type { Network } from 'bitcoinjs-lib';
import {
  DUMMY_VAULT_OUTPUT,
  DUMMY_SERVICE_OUTPUT,
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
  estimateTriggerTxSize,
  estimatePanicTxSize,
  splitTransactionAmount
} from './vaults';
import type { Accounts } from './wallets';
// nLockTime which results into the largest possible serialized size:
const LOCK_BLOCKS_MAS_SIZE = 0xffff;
const MIN_VAULT_BIN_SEARCH_ITERS = 100;

/**
 * Estimates the maximum vault amount when sending maxFunds.
 * This amount accounts for the sume of both the vault and
 * service fee (if serviceFeeRate > 0).
 *
 * The function performs a series of calculations to determine if it's possible
 * to include a service fee without violating the dust threshold constraints.
 *
 * - First, it checks if it's possible to add a minimal service output (dust).
 * - Then, it calculates the correct service fee based on the total amount and
 *   tries to include it.
 * - If including the correct service fee is not possible, it returns undefined.
 * - Finally, it calculates the maximum vault amount based on the available UTXOs
 *   and the determined fee conditions.
 *
 * The function returns the estimated amount or `undefined` if it's impossible
 * to obtain a valid value.
 *
 */
const estimateMaxVaultAmount = moize.shallow(
  ({
    utxosData,
    vaultOutput,
    serviceOutput,
    feeRate,
    serviceFeeRate
  }: {
    utxosData: UtxosData;
    vaultOutput: OutputInstance;
    serviceOutput: OutputInstance;
    feeRate: number;
    serviceFeeRate: number;
  }):
    | {
        vaultTxMiningFee: number;
        vaultedAmount: number;
        serviceFee: number;
        transactionAmount: number;
      }
    | undefined => {
    const utxos = getOutputsWithValue(utxosData);
    if (utxos.length === 0) return;
    let coinselected:
      | {
          fee: number;
          vsize: number;
          utxos: Array<{ output: OutputInstance; value: number }>;
          targets: Array<{ output: OutputInstance; value: number }>;
        }
      | undefined;
    if (serviceFeeRate > 0) {
      coinselected = maxFunds({
        utxos,
        targets: [
          { output: serviceOutput, value: dustThreshold(vaultOutput) + 1 }
        ],
        remainder: vaultOutput,
        feeRate
      });
      //console.log('TRACE maxFunds', JSON.stringify(coinselected, null, 2));
      if (!coinselected) return;
      // It looks like it was possible to add a service output. We
      // can now know the total amount and we can compute the correct
      // serviceFee and the correct coinselect

      //The total amount is correct, but targets have incorrect ratios
      const transactionAmount = coinselected.targets.reduce(
        (a, { value }) => a + value,
        0
      );
      const split = splitTransactionAmount({
        transactionAmount,
        vaultOutput,
        serviceOutput,
        serviceFeeRate
      });
      //console.log('TRACE maxFunds split', JSON.stringify(split, null, 2));
      if (!split) return;

      //All code below are just assertions:
      //Now let's recompute the utxos using the correct serviceFee value.
      //Note that output weights are kept the same and, thus, coinselection should
      //still be the same
      coinselected = maxFunds({
        utxos,
        targets: [{ output: serviceOutput, value: split.serviceFee }],
        remainder: vaultOutput,
        feeRate
      });
      if (!coinselected)
        throw new Error(
          `Final coinselected should be defined and be the same as before reassigning values`
        );

      //A final check after assining the correct values to each output.
      //finalTransactionAmount must be the same as amount since output weights
      //do not change (only value does).
      const finalTransactionAmount = coinselected?.targets.reduce(
        (a, { value }) => a + value,
        0
      );
      if (transactionAmount !== finalTransactionAmount)
        throw new Error(
          `Invalid final transactionAmount after assigning final rates in estimateMaxVaultAmount: transactionAmount: ${transactionAmount}, finalAmount: ${finalTransactionAmount}.`
        );

      return {
        vaultTxMiningFee: coinselected.fee,
        ...split
      };
    } else {
      //When not having serviceFee it's simpler:
      coinselected = maxFunds({
        utxos,
        targets: [],
        remainder: vaultOutput,
        feeRate
      });
      if (!coinselected) return;
      const transactionAmount = coinselected.targets.reduce(
        (a, { value }) => a + value,
        0
      );
      return {
        vaultTxMiningFee: coinselected.fee,
        transactionAmount,
        vaultedAmount: transactionAmount,
        serviceFee: 0
      };
    }
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
const estimateMinRecoverableVaultAmount = moize.shallow(
  ({
    utxosData,
    coldAddress,
    network,
    vaultOutput,
    serviceOutput,
    changeOutput,
    lockBlocks,
    feeRate,
    serviceFeeRate,
    feeRateCeiling,
    minRecoverableRatio
  }: {
    utxosData: UtxosData;
    coldAddress: string;
    network: Network;
    vaultOutput: OutputInstance;
    serviceOutput: OutputInstance;
    changeOutput: OutputInstance;
    lockBlocks: number;
    /** Fee rate used for the Vault*/
    feeRate: number;
    serviceFeeRate: number;
    /** Max Fee rate for the presigned txs */
    feeRateCeiling: number;
    minRecoverableRatio: number;
  }): {
    vaultTxMiningFee: number;
    vaultedAmount: number;
    serviceFee: number;
    transactionAmount: number;
  } => {
    //The minimum vaultedAmount + serviceFee feasible:
    const isRecoverable = (transactionAmount: number) => {
      const split = splitTransactionAmount({
        transactionAmount,
        vaultOutput,
        serviceOutput,
        serviceFeeRate
      });
      if (!split) return false;
      const { serviceFee, vaultedAmount } = split;
      const selected = selectVaultUtxosData({
        utxosData,
        vaultedAmount,
        vaultOutput,
        serviceOutput,
        changeOutput,
        feeRate,
        serviceFee
      });
      if (!selected) return false;
      const totalFees =
        //selected.fee + (vaultedAmount is resulting amount after inital tx, so selected.fee has already been substracted from vaultedAmount)
        Math.ceil(feeRateCeiling * estimateTriggerTxSize(lockBlocks)) +
        Math.ceil(
          feeRateCeiling * estimatePanicTxSize(lockBlocks, coldAddress, network)
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
    const maxVaultAmount = estimateMaxVaultAmount({
      vaultOutput,
      serviceOutput,
      utxosData,
      feeRate,
      serviceFeeRate
    });

    // If the current utxos cannot provide a solution, then we must
    // compute assuming that a new utxo (PKH) will send extra funds
    if (!maxVaultAmount || !isRecoverable(maxVaultAmount.transactionAmount)) {
      const vaultTxSize = vsize(
        [...utxosData.map(utxoData => utxoData.output), DUMMY_PKH_OUTPUT],
        [vaultOutput, changeOutput, ...(serviceFeeRate ? [serviceOutput] : [])]
      );
      const totalFees =
        //Math.ceil(feeRate * vaultTxSize) +
        Math.ceil(feeRateCeiling * estimateTriggerTxSize(lockBlocks)) +
        Math.ceil(
          feeRateCeiling * estimatePanicTxSize(lockBlocks, coldAddress, network)
        );

      const minTransactionAmount = Math.max(
        dustThreshold(vaultOutput) + 1 + serviceFeeRate > 0
          ? dustThreshold(serviceOutput) + 1
          : 0,

        // vaultedAmount >  totalFees / (1 - minRecoverableRatio)
        // transactionAmount = vaultedAmount * (1 + serviceFeeRate)
        // transactionAmount / (1 + serviceFeeRate) >  totalFees / (1 - minRecoverableRatio)
        // transactionAmount > totalFees * (1 + serviceFeeRate) / (1 - serviceFeeRate)
        Math.ceil(
          (totalFees * (1 + serviceFeeRate)) / (1 - minRecoverableRatio)
        )
      );
      //Note that minTransactionAmount won't be exact since there are roundings,
      //multiplications and divisions above. However, we're in the case
      //where the utxos cannot be used anyway. This is an approximated  way to
      //compute the minimum amount the user will need to add to the wallet
      //to be able to vault

      //Now split it. Since it isRecoverable it can be split 100% sure
      const split = splitTransactionAmount({
        transactionAmount: minTransactionAmount,
        vaultOutput,
        serviceOutput,
        serviceFeeRate
      });
      if (!split)
        throw new Error('After adding a PKH output the tx should be splitable');
      return {
        vaultTxMiningFee: Math.ceil(feeRate * vaultTxSize),
        vaultedAmount: split.vaultedAmount,
        serviceFee: split.serviceFee,
        transactionAmount: minTransactionAmount
      };
    } else {
      const { value: transactionAmount } = findLowestTrueBinarySearch(
        maxVaultAmount.transactionAmount,
        isRecoverable,
        MIN_VAULT_BIN_SEARCH_ITERS
      );
      if (transactionAmount !== undefined) {
        const split = splitTransactionAmount({
          transactionAmount,
          vaultOutput,
          serviceOutput,
          serviceFeeRate
        });
        if (!split)
          throw new Error(
            'After findLowestTrueBinarySearch the tx should be splitable'
          );
        const { serviceFee, vaultedAmount } = split;
        const selected = selectVaultUtxosData({
          utxosData,
          vaultedAmount,
          vaultOutput,
          serviceOutput,
          changeOutput,
          feeRate,
          serviceFee
        });
        if (!selected)
          throw new Error(
            'This should have a solution since isRecoverable calls it exactly the same'
          );
        return {
          vaultedAmount,
          transactionAmount,
          serviceFee,
          vaultTxMiningFee: selected.fee
        };
      } else return maxVaultAmount;
    }
  }
);

export const estimateVaultSetUpRange = moize.shallow(
  ({
    accounts,
    utxosData,
    coldAddress,
    maxFeeRate,
    serviceFeeRate,
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
    serviceFeeRate: number;
    feeRateCeiling: number;
    minRecoverableRatio: number;
  }) => {
    const maxVaultAmountWhenMaxFee = estimateMaxVaultAmount({
      utxosData,
      vaultOutput: DUMMY_VAULT_OUTPUT(network),
      serviceOutput: DUMMY_SERVICE_OUTPUT(network),
      feeRate: maxFeeRate,
      serviceFeeRate
    });
    const minRecoverableVaultAmount = estimateMinRecoverableVaultAmount({
      utxosData,
      coldAddress,
      network,
      vaultOutput: DUMMY_VAULT_OUTPUT(network),
      serviceOutput: DUMMY_SERVICE_OUTPUT(network),
      changeOutput: DUMMY_CHANGE_OUTPUT(
        getMainAccount(accounts, network),
        network
      ),
      lockBlocks: LOCK_BLOCKS_MAS_SIZE,
      // Set it to worst case: express confirmation time so that
      // minRecoverableVaultAmount in the Slider does not change when the user
      // changes the feeRate
      feeRate: maxFeeRate,
      serviceFeeRate,
      feeRateCeiling,
      minRecoverableRatio
    });
    const maxVaultAmount = estimateMaxVaultAmount({
      utxosData,
      vaultOutput: DUMMY_VAULT_OUTPUT(network),
      serviceOutput: DUMMY_SERVICE_OUTPUT(network),
      // while feeRate has not been set, estimate using the largest possible
      // feeRate. We allow the maxVaultAmount to change depending on the fee
      // rate selected by the uset
      feeRate: feeRate !== null ? feeRate : maxFeeRate,
      serviceFeeRate
    });
    return {
      maxVaultAmountWhenMaxFee,
      minRecoverableVaultAmount,
      maxVaultAmount
    };
  }
);

/**
 * Note that here we can only do some approximations.
 * The real serviceFee and real vaultedAmount are deduced unidirectionally
 * from transactionAmount using splitTransactionAmount. splitTransactionAmount is
 * the source of truth.
 * However, the user selects a vaultedAmount. Then, we must
 * find the most accurate serviceFee possible that ensures the final
 * transaction is within ranges. So the final serviceFee may not be exactly
 * serviceFeeRate * vaultedAmount (because there are non-linearities because of
 * dustThreshold and for roundings).
 * In other words it is possible to do an exact:
 *  transactionAmount -> (vaultedAmount, serviceFee)
 * But the reverse vaultedAmount -> (serviceFee, transactionAmount) cannot be
 * analytically found and several solutions can be possible in fact
 */
export const estimateServiceFee = ({
  vaultedAmount,
  serviceFeeRate,
  serviceOutput,
  minVaultAmount,
  maxVaultAmount
}: {
  vaultedAmount: number;
  serviceFeeRate: number;
  serviceOutput: OutputInstance;
  minVaultAmount: {
    vaultTxMiningFee: number;
    vaultedAmount: number;
    serviceFee: number;
    transactionAmount: number;
  };
  maxVaultAmount: {
    vaultTxMiningFee: number;
    vaultedAmount: number;
    serviceFee: number;
    transactionAmount: number;
  };
}) => {
  if (vaultedAmount > maxVaultAmount.vaultedAmount)
    throw new Error(
      `Out of range - vaultedAmount > max: ${vaultedAmount} > ${maxVaultAmount.vaultedAmount}`
    );
  if (vaultedAmount < minVaultAmount.vaultedAmount)
    throw new Error(
      `Out of range - vaultedAmount < min: ${vaultedAmount} < ${minVaultAmount.vaultedAmount}`
    );

  if (serviceFeeRate === 0) return 0;

  if (vaultedAmount === minVaultAmount.vaultedAmount)
    return minVaultAmount.serviceFee;
  if (vaultedAmount === maxVaultAmount.vaultedAmount)
    return maxVaultAmount.serviceFee;

  const largestPossibleFee = maxVaultAmount.transactionAmount - vaultedAmount; //largest possible serviceFee for vaultedAmount to be in-range
  const smallestPossibleFee = minVaultAmount.transactionAmount - vaultedAmount; //smallest possible serviceFee for vaultedAmount to be in-range

  if (smallestPossibleFee > largestPossibleFee)
    throw new Error('Impossible solution');

  let estimatedServiceFee = Math.max(
    dustThreshold(serviceOutput) + 1,
    Math.floor(serviceFeeRate * vaultedAmount)
  );

  //vaultedAmount + serviceFee must be within transaction ranges
  estimatedServiceFee = Math.min(estimatedServiceFee, largestPossibleFee);
  estimatedServiceFee = Math.max(estimatedServiceFee, smallestPossibleFee);
  if (estimatedServiceFee <= dustThreshold(serviceOutput))
    throw new Error('Final serviceFee should be above dust');
  return estimatedServiceFee;
};
