// Copyright (C) 2026 Jose-Luis Landabaso - https://rewindbitcoin.com
// Licensed under the GNU GPL v3 or later. See the LICENSE file for details.

import { findLowestTrueBinarySearch } from '../../common/lib/binarySearch';
import { toHex } from 'uint8array-tools';
import type { OutputInstance } from '@bitcoinerlab/descriptors';
import { transactionFromHex } from './bitcoin';
import { computeMaxAllowedFeeRate, type FeeEstimates } from './fees';
import type { Signer } from './wallets';
import {
  estimateCpfpPackage,
  findP2AOutputData,
  type HistoryData,
  type TxHex,
  type UtxosData
} from './vaults';

// Bitcoin Core default -incrementalrelayfee is 100 sat/kvB = 0.1 sat/vB.
// A replacement child must pay at least the previous child fee plus the
// incremental relay delta in sats (ceil(childVSize * 0.1 sat/vB)), or nodes
// reject it.
// Sources:
// - https://github.com/bitcoin/bitcoin/blob/master/src/policy/policy.h
// - https://github.com/bitcoin/bitcoin/blob/master/doc/policy/mempool-replacements.md
export const INCREMENTAL_RELAY_FEE_RATE = 0.1;
//makes sense this is similar to the one in FeeInput.tsx since this is
//the minumum  the user can change anyway
const FEE_RATE_STEP = 0.01;

export type VaultActionTxData = {
  /**
   * Hex of the selected parent tx for the action:
   * - Init Unfreeze: trigger tx hex
   * - Rescue: panic tx hex
   *
   * In Rewind2, the anchor is an output inside this parent tx.
   * This is never an anchor tx hex.
   */
  parentTxHex: TxHex;

  /**
   * Miner fee of the parent tx only.
   * - Laddered (legacy): this is also the action fee.
   * - Rewind2: action fee may include CPFP child fee too.
   */
  parentTxFee: number;

  /**
   * Fee of the thing the user is about to submit.
   * - Laddered (legacy): parent tx fee
   * - Rewind2 parent-only: parent tx fee
   * - Rewind2 with CPFP: parent + child package fee
   */
  actionFee: number;

  /**
   * Fee rate of the thing the user is about to submit.
   * - Laddered (legacy): parent tx feerate
   * - Rewind2 parent-only: parent tx feerate
   * - Rewind2 with CPFP: parent + child package feerate
   */
  actionFeeRate: number;
};

export type PreparedCpfpPlan = {
  /** Non-anchor inputs that the child must spend. */
  utxosData: UtxosData;
  /** Child output destination. For rescue this should normally be the emergency address. */
  changeOutput: OutputInstance;
  signer: Signer;
};

/**
 * Finds the next item with equal-or-larger fee rate.
 *
 * `sortedItems` must be sorted ascending by `feeRate`.
 */
export const findNextEqualOrLargerFeeRate = <
  T extends { feeRate: number }
>(
  sortedItems: Array<T>,
  feeRate: number
): T | null => {
  const result = findLowestTrueBinarySearch(
    sortedItems.length - 1,
    index => sortedItems[index]!.feeRate >= feeRate,
    100
  );
  if (result.value !== undefined) return sortedItems[result.value]!;
  return null;
};

/**
 * Reconstructs CPFP fee info from wallet history.
 *
 * Replacement logic uses this for the old child, but the helper itself is
 * generic: given a P2A parent and one attached CPFP child, it reconstructs the
 * child's fee and the resulting package fee rate.
 *
 * This helper is only for real P2A package parents. It throws if the parent tx
 * does not contain exactly one P2A output.
 */
export const getCpfpFeeInfo = ({
  parentTxHex,
  parentFee,
  childTxHex,
  historyData
}: {
  parentTxHex: TxHex;
  parentFee: number;
  childTxHex: TxHex;
  historyData: HistoryData;
}):
  | {
      childFee: number;
      packageFeeRate: number;
    }
  | undefined => {
  const { tx: parentTx } = transactionFromHex(parentTxHex);
  const { tx: childTx } = transactionFromHex(childTxHex);
  const parentTxId = parentTx.getId();
  const anchorOutput = findP2AOutputData(parentTx);
  if (!anchorOutput)
    throw new Error('Expected exactly one P2A output in parent tx');

  const txById = new Map(historyData.map(item => [item.txId, item.tx]));
  let childInputValue = BigInt(0);

  for (const input of childTx.ins) {
    const prevTxId = toHex(Uint8Array.from(input.hash).reverse());
    if (prevTxId === parentTxId && input.index === anchorOutput.index) {
      childInputValue += BigInt(anchorOutput.value);
      continue;
    }
    const prevTx = txById.get(prevTxId);
    const prevOut = prevTx?.outs[input.index];
    if (!prevOut) return;
    childInputValue += prevOut.value;
  }

  const childOutputValue = childTx.outs.reduce(
    (sum, output) => sum + output.value,
    BigInt(0)
  );
  if (childInputValue <= childOutputValue) return;

  const childFee = Number(childInputValue - childOutputValue);
  return {
    childFee,
    packageFeeRate:
      (parentFee + childFee) /
      (parentTx.virtualSize() + childTx.virtualSize())
  };
};

/**
 * Minimum absolute fee the replacement child must pay so relay accepts it.
 *
 * Example: if the old child paid 584 sats and the new child is 160 vB, the new
 * child must pay at least 584 + ceil(160 * 0.1) = 600 sats.
 */
export const getMinimumReplacementChildFee = ({
  previousChildFee,
  replacementChildVSize,
  incrementalRelayFeeRate = INCREMENTAL_RELAY_FEE_RATE
}: {
  previousChildFee: number;
  replacementChildVSize: number;
  incrementalRelayFeeRate?: number;
}) =>
  previousChildFee + Math.ceil(replacementChildVSize * incrementalRelayFeeRate);

/**
 * Replacement floor for CPFP flows.
 *
 * A replacement child must satisfy two relay checks at once:
 * 1) the new package feerate must improve over the previous one, and
 * 2) the new child fee must be at least:
 *    previousChildFee + ceil(childVSize * 0.1 sat/vB)
 *
 * Example: if the previous child paid 584 sats and the replacement child would
 * be 160 vB, relay requires at least 584 + ceil(160 * 0.1) = 600 sats. A new
 * package can therefore look "faster" by feerate and still be rejected if the
 * child only pays, say, 590 sats.
 */
export const getCpfpReplacementFeeRateFloor = ({
  parentTxHex,
  parentFee,
  previousChildTxHex,
  historyData,
  feeEstimates,
  utxosData,
  childOutput
}: {
  parentTxHex: TxHex;
  parentFee: number;
  previousChildTxHex: TxHex;
  historyData: HistoryData | undefined;
  feeEstimates: FeeEstimates | undefined;
  utxosData: UtxosData;
  childOutput: OutputInstance;
}): number | null => {
  if (!historyData?.length || !feeEstimates) return null;

  const previousChildFeeInfo = getCpfpFeeInfo({
    parentTxHex,
    parentFee,
    childTxHex: previousChildTxHex,
    historyData
  });
  if (!previousChildFeeInfo) return null;

  const maxFeeRate = computeMaxAllowedFeeRate(feeEstimates);
  for (
    let targetPackageFeeRate = previousChildFeeInfo.packageFeeRate + 1;
    targetPackageFeeRate <= maxFeeRate;
    targetPackageFeeRate = Number(
      (targetPackageFeeRate + FEE_RATE_STEP).toFixed(2)
    )
  ) {
    const plan = estimateCpfpPackage({
      parentTxHex,
      parentFee,
      targetPackageFeeRate,
      utxosData,
      changeOutput: childOutput
    });
    if (!plan) continue;
    if (
      plan.childFee >=
      getMinimumReplacementChildFee({
        previousChildFee: previousChildFeeInfo.childFee,
        replacementChildVSize: plan.childVSize,
        incrementalRelayFeeRate: INCREMENTAL_RELAY_FEE_RATE
      })
    )
      return targetPackageFeeRate;
  }
  return null;
};

/**
 * Computes the initial fee rate shown in the fee selector.
 *
 * We prefer the wallet's current confirmation target, but if that target is no
 * longer fundable we fall back to the minimum actionable replacement floor so
 * the user can still continue instead of seeing an intro modal with only a
 * Cancel button.
 */
export const pickActionableInitialFeeRate = ({
  preferredFeeRate,
  minimumActionableFeeRate,
  canBuildAtFeeRate
}: {
  preferredFeeRate: number | null;
  minimumActionableFeeRate: number | null;
  canBuildAtFeeRate: (feeRate: number) => boolean;
}) => {
  if (preferredFeeRate !== null && canBuildAtFeeRate(preferredFeeRate))
    return preferredFeeRate;
  if (
    minimumActionableFeeRate !== null &&
    canBuildAtFeeRate(minimumActionableFeeRate)
  )
    return minimumActionableFeeRate;
  return null;
};

/** Finds the first fee rate on the slider grid that can actually build a tx. */
export const findMinimumActionableFeeRate = ({
  minimumFeeRate,
  maximumFeeRate,
  canBuildAtFeeRate
}: {
  minimumFeeRate: number;
  maximumFeeRate: number;
  canBuildAtFeeRate: (feeRate: number) => boolean;
}): number | null => {
  for (
    let feeRate = minimumFeeRate;
    feeRate <= maximumFeeRate;
    feeRate = Number((feeRate + FEE_RATE_STEP).toFixed(2))
  ) {
    if (canBuildAtFeeRate(feeRate)) return feeRate;
  }
  return null;
};
