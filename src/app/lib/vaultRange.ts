import memoize from 'lodash.memoize';
import type { Network } from 'bitcoinjs-lib';
import {
  DUMMY_VAULT_OUTPUT,
  DUMMY_SERVICE_OUTPUT,
  DUMMY_CHANGE_OUTPUT,
  DUMMY_PKH_OUTPUT
} from './vaultDescriptors';
import type { OutputInstance } from '@bitcoinerlab/descriptors';
import { maxFunds, vsize, dustThreshold } from '@bitcoinerlab/coinselect';
import { findLowestTrueBinarySearch } from '../../common/lib/binarySearch';
import {
  UtxosData,
  getOutputsWithValue,
  getServiceFee,
  selectVaultUtxosData,
  estimateTriggerTxSize
} from './vaults';
// nLockTime which results into the largest possible serialized size:
const LOCK_BLOCKS_MAS_SIZE = 0xffff;
const MIN_VAULT_BIN_SEARCH_ITERS = 100;

/**
 * Estimates the maximum vault amount when sending maxFunds.
 * This amount accounts for the sume of both the vault and
 * service fee, though in rare cases, the service fee might be zero if it
 * would result in the main target value falling below the dust threshold.
 *
 * The function performs a series of calculations to determine if it's possible
 * to include a service fee without violating the dust threshold constraints. If
 * it's not feasible to include the service fee while respecting the dust
 * threshold, the function proceeds under the assumption of no service fee.
 *
 * - First, it checks if it's possible to add a minimal service output (dust).
 *   If not, it assumes no service fee.
 * - Then, it calculates the correct service fee based on the total amount and
 *   tries to include it.
 * - If including the correct service fee is not possible, it proceeds without
 *   the service fee.
 * - Finally, it calculates the maximum vault amount based on the available UTXOs
 *   and the determined fee conditions.
 *
 * The function returns the estimated amount or `undefined` if it's impossible
 * to obtain a valid value.
 *
 */
const estimateMaxVaultAmount = ({
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
}) => {
  // We cannot compute serviceFees yet because we don't know amounts but
  // if serviceFeeRate, we will first assume there will a service output
  let coinselected:
    | {
        fee: number;
        vsize: number;
        utxos: Array<{ output: OutputInstance; value: number }>;
        targets: Array<{ output: OutputInstance; value: number }>;
      }
    | undefined;
  if (serviceFeeRate > 0) {
    const dustServiceFee = dustThreshold(vaultOutput);
    if (dustServiceFee === 0) throw new Error('Incorrect dust');
    coinselected = maxFunds({
      utxos: getOutputsWithValue(utxosData),
      targets: [{ output: serviceOutput, value: dustServiceFee }],
      remainder: vaultOutput,
      feeRate
    });
  }
  if (coinselected) {
    // It looks like it was possible to add a servive output. We
    // can now know the total amount and we can compute the correct
    // serviceFee and the correct coinselect

    //The total amount is correct, but targets have incorrect ratios
    const amount = coinselected.targets.reduce((a, { value }) => a + value, 0);
    const serviceFee = getServiceFee({
      amount,
      vaultOutput,
      serviceOutput,
      serviceFeeRate
    });
    coinselected = maxFunds({
      utxos: getOutputsWithValue(utxosData),
      targets: serviceFee ? [{ output: serviceOutput, value: serviceFee }] : [],
      remainder: vaultOutput,
      feeRate
    });
  }
  if (!coinselected) {
    // At this point either it was impossible to add dust or it
    // was impossible to add the correct final fee output, so we
    // must assume no fee at all
    coinselected = maxFunds({
      utxos: getOutputsWithValue(utxosData),
      targets: [],
      remainder: vaultOutput,
      feeRate
    });
  }
  if (!coinselected) return;

  return coinselected.targets.reduce((a, { value }) => a + value, 0);
};

/**
 *
 * Estimates the minimum vault amount needed to ensure at least `minRecoverableRatio`
 * of funds are recoverable (including serviceFee + vaultAmount), e.g., limiting loss
 * to no more than 1/3 (minRecoverableRatio) of the initial value due to miner fees. This function might not
 * always find the absolute minimum but provides a safe, conservative estimation.
 *
 * Utilizing a binary search starting from `maxVaultAmount`, it tests for lower values
 * to determine the smallest vault amount maintaining a recoverable value ≥ a specified
 * ratio (e.g., 2/3 linked to `serviceFeeRate`). The function employs `findLowestTrueBinarySearch`
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
const estimateMinVaultAmount = ({
  utxosData,
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
}): number => {
  const isRecoverable = (amount: number) => {
    const selected = selectVaultUtxosData({
      utxosData,
      amount,
      vaultOutput,
      serviceOutput,
      changeOutput,
      feeRate,
      serviceFeeRate
    });
    if (!selected) return false;
    const totalFees =
      selected.fee +
      Math.ceil(feeRateCeiling * estimateTriggerTxSize(lockBlocks));

    // initialValue - totalFees > minRecoverableRatio * initialValue
    // initialValue - minRecoverableRatio * initialValue > totalFees
    // initialValue * (1 - minRecoverableRatio) > totalFees
    // initialValue > totalFees / (1 - minRecoverableRatio)
    // If minRecoverableRatio =  2/3 => It can loose up to 1/3 of value in fees
    return amount >= Math.ceil(totalFees / (1 - minRecoverableRatio));
  };

  const maxVaultAmount = estimateMaxVaultAmountMemo({
    vaultOutput,
    serviceOutput,
    utxosData,
    feeRate,
    serviceFeeRate
  });
  if (maxVaultAmount === undefined || !isRecoverable(maxVaultAmount)) {
    // If the current utxos cannot provide a solution, then we must
    // compute assuming that a new utxo (PKH) will send extra funds
    const vaultTxSize = vsize(
      [...utxosData.map(utxoData => utxoData.output), DUMMY_PKH_OUTPUT],
      [vaultOutput, changeOutput, serviceOutput]
    );
    const totalFees =
      Math.ceil(feeRate * vaultTxSize) +
      Math.ceil(feeRateCeiling * estimateTriggerTxSize(lockBlocks));

    return Math.ceil(totalFees / (1 - minRecoverableRatio));
  } else {
    const { value } = findLowestTrueBinarySearch(
      maxVaultAmount,
      isRecoverable,
      MIN_VAULT_BIN_SEARCH_ITERS
    );
    if (value === undefined) return maxVaultAmount;
    return value;
  }
};

export const estimateVaultSetUpRange = ({
  utxosData,
  maxFeeRate,
  serviceFeeRate,
  feeRate = null,
  feeRateCeiling,
  minRecoverableRatio,
  network
}: {
  utxosData: UtxosData;
  maxFeeRate: number;
  network: Network;
  feeRate?: number | null;
  serviceFeeRate: number;
  feeRateCeiling: number;
  minRecoverableRatio: number;
}) => {
  const lowestMaxVaultAmount =
    estimateMaxVaultAmountMemo({
      utxosData,
      vaultOutput: DUMMY_VAULT_OUTPUT(network),
      serviceOutput: DUMMY_SERVICE_OUTPUT(network),
      feeRate: maxFeeRate,
      serviceFeeRate
    }) || 0;
  const largestMinVaultAmount = estimateMinVaultAmountMemo({
    utxosData,
    vaultOutput: DUMMY_VAULT_OUTPUT(network),
    serviceOutput: DUMMY_SERVICE_OUTPUT(network),
    changeOutput: DUMMY_CHANGE_OUTPUT(network),
    lockBlocks: LOCK_BLOCKS_MAS_SIZE,
    // Set it to worst case: express confirmation time so that
    // largestMinVaultAmount in the Slider does not change when the user
    // changes the feeRate
    feeRate: maxFeeRate,
    serviceFeeRate,
    feeRateCeiling,
    minRecoverableRatio
  });
  const maxVaultAmount = estimateMaxVaultAmountMemo({
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
    lowestMaxVaultAmount,
    largestMinVaultAmount,
    maxVaultAmount
  };
};

//
//
//
//
//
//
// Memoization exports of complex *Factory methods
//
//
//
//
//
//

const estimateMaxVaultAmountFactory = memoize((utxosData: UtxosData) =>
  memoize((vaultOutput: OutputInstance) =>
    memoize((serviceOutput: OutputInstance) =>
      memoize(
        ({
          feeRate,
          serviceFeeRate
        }: {
          feeRate: number;
          serviceFeeRate: number;
        }) =>
          estimateMaxVaultAmount({
            utxosData,
            vaultOutput,
            serviceOutput,
            feeRate,
            serviceFeeRate
          }),
        ({ feeRate, serviceFeeRate }) =>
          JSON.stringify({ feeRate, serviceFeeRate })
      )
    )
  )
);
const estimateMaxVaultAmountMemo = ({
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
}) =>
  estimateMaxVaultAmountFactory(utxosData)(vaultOutput)(serviceOutput)({
    feeRate,
    serviceFeeRate
  });
export { estimateMaxVaultAmountMemo as estimateMaxVaultAmount };

const estimateMinVaultAmountFactory = memoize((utxosData: UtxosData) =>
  memoize((vaultOutput: OutputInstance) =>
    memoize((serviceOutput: OutputInstance) =>
      memoize((changeOutput: OutputInstance) =>
        memoize(
          ({
            lockBlocks,
            feeRate,
            serviceFeeRate,
            feeRateCeiling,
            minRecoverableRatio
          }: {
            lockBlocks: number;
            feeRate: number;
            serviceFeeRate: number;
            feeRateCeiling: number;
            minRecoverableRatio: number;
          }) =>
            estimateMinVaultAmount({
              utxosData,
              vaultOutput,
              serviceOutput,
              changeOutput,
              lockBlocks,
              feeRate,
              serviceFeeRate,
              feeRateCeiling,
              minRecoverableRatio
            }),
          ({
            lockBlocks,
            feeRate,
            serviceFeeRate,
            feeRateCeiling,
            minRecoverableRatio
          }) =>
            JSON.stringify({
              lockBlocks,
              feeRate,
              serviceFeeRate,
              feeRateCeiling,
              minRecoverableRatio
            })
        )
      )
    )
  )
);
const estimateMinVaultAmountMemo = ({
  utxosData,
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
  vaultOutput: OutputInstance;
  serviceOutput: OutputInstance;
  changeOutput: OutputInstance;
  lockBlocks: number;
  feeRate: number;
  serviceFeeRate: number;
  feeRateCeiling: number;
  minRecoverableRatio: number;
}) =>
  estimateMinVaultAmountFactory(utxosData)(vaultOutput)(serviceOutput)(
    changeOutput
  )({
    lockBlocks,
    feeRate,
    serviceFeeRate,
    feeRateCeiling,
    minRecoverableRatio
  });

export { estimateMinVaultAmountMemo as estimateMinVaultAmount };
