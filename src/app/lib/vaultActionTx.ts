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
  type Vault,
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
   * In P2A flows, the anchor is an output inside this parent tx.
   * This is never an anchor tx hex.
   */
  parentTxHex: TxHex;

  /**
   * Miner fee of the parent tx only.
   * - Laddered (legacy): this is also the action fee.
   * - P2A flows: action fee may include CPFP child fee too.
   */
  parentTxFee: number;

  /**
   * Fee of the thing the user is about to submit.
   * - Laddered (legacy): parent tx fee
   * - P2A parent-only: parent tx fee
   * - P2A with CPFP: parent + child package fee
   */
  actionFee: number;

  /**
   * Fee rate of the thing the user is about to submit.
   * - Laddered (legacy): parent tx feerate
   * - P2A parent-only: parent tx feerate
   * - P2A with CPFP: parent + child package feerate
   */
  actionFeeRate: number;
};

export type PresignedTxInfo = { txHex: TxHex; fee: number; feeRate: number };

/**
 * Fully prepared non-anchor CPFP funding plan for P2A flows.
 *
 * This is a small emergency or reserve-backed plan used
 * only to fund a child tx. The caller already knows which UTXOs the child
 * must spend, where leftover value must go, and which signer controls those
 * UTXOs.
 *
 * Think if it as a small emergency wallet plan prepared outside the
 * main wallet after an attack. It provides fresh UTXOs and a signer that are
 * not meant to be under the compromised wallet's normal flow.
 *
 * This can be created after an attack, so fresh UTXOs and signers
 * stay outside the compromised wallet's normal flow.
 */
export type PreparedCpfpPlan = {
  /** Non-anchor inputs that the child must spend. */
  utxosData: UtxosData;
  /** Leftover value destination. For rescue this should normally be the emergency address. */
  changeOutput: OutputInstance;
  /** Signer used for the non-anchor child inputs. */
  signer: Signer;
  /** Existing CPFP child tx that a new child must replace, if any. */
  previousChildTxHex?: TxHex;
};

/**
 * Current acceleration availability state for one already-broadcast tx.
 */
export type AccelerationInfo = {
  /**
   * Minimum package fee rate that improves the currently live state.
   * Returns `null` when the helper cannot compute a valid floor yet.
   */
  replacementFeeRateFloor: number | null;
  /**
   * A valid fee-bump transaction/package can be built from the supplied inputs.
   * This is only the transaction-building result: the UI may still hide or
   * disable acceleration while another action is in progress, after rescue has
   * started, or when a confirmation rule blocks the flow.
   */
  hasAccelerationPath: boolean;
};

export const getP2ATriggerInfo = (vault: Vault): PresignedTxInfo => {
  const txHex = Object.keys(vault.triggerMap)[0];
  if (!txHex) throw new Error('P2A vault is missing trigger tx');
  const triggerTxData = vault.txMap[txHex];
  if (!triggerTxData) throw new Error('P2A trigger tx is not mapped');
  return { txHex, fee: triggerTxData.fee, feeRate: triggerTxData.feeRate };
};

export const getLadderedTriggerSortedTxs = (vault: Vault): PresignedTxInfo[] =>
  Object.entries(vault.triggerMap)
    .map(([txHex]) => {
      const txData = vault.txMap[txHex];
      if (!txData) throw new Error('trigger tx not mapped');
      return { txHex, fee: txData.fee, feeRate: txData.feeRate };
    })
    .sort((a, b) => a.feeRate - b.feeRate);

export const getP2ARescueInfo = (
  vault: Vault,
  triggerTxHex: TxHex
): PresignedTxInfo => {
  const txHex = vault.triggerMap[triggerTxHex]?.[0];
  if (!txHex) throw new Error('P2A trigger tx is missing rescue tx');
  const rescueTxData = vault.txMap[txHex];
  if (!rescueTxData) throw new Error('P2A rescue tx is not mapped');
  return { txHex, fee: rescueTxData.fee, feeRate: rescueTxData.feeRate };
};

export const getLadderedRescueSortedTxs = (
  vault: Vault,
  triggerTxHex: string
): PresignedTxInfo[] => {
  const rescueTxs = vault.triggerMap[triggerTxHex];
  if (!rescueTxs)
    throw new Error("Triggered vault doesn't have matching rescue txs");
  return rescueTxs
    .map(txHex => {
      const txData = vault.txMap[txHex];
      if (!txData) throw new Error('rescue tx not mapped');
      return { txHex, fee: txData.fee, feeRate: txData.feeRate };
    })
    .sort((a, b) => a.feeRate - b.feeRate);
};

/**
 * Returns the current acceleration state for an unconfirmed action tx.
 *
 * The returned fields mean:
 * - `replacementFeeRateFloor`: the minimum package fee rate that improves the
 *   currently live state
 * - `hasAccelerationPath`: a valid fee-bump transaction/package can be built
 *   from the supplied inputs
 */
export const getActionAccelerationInfo = ({
  vaultMode,
  feeEstimates,
  historyData,
  pushedTxHex,
  presignedTxs,
  bumpPlan
}: {
  vaultMode: 'LADDERED' | 'P2A_TRUC' | 'P2A_NON_TRUC';
  feeEstimates: FeeEstimates | undefined;
  historyData: HistoryData | undefined;
  /**
   * Hex of the action tx that status currently says was pushed/live. The caller
   * only provides this while that action tx is still unconfirmed.
   *
   * In practice this is either `vaultStatus.triggerTxHex` or
   * `vaultStatus.panicTxHex`.
   */
  pushedTxHex: TxHex | undefined;
  /** Pre-signed parent tx choices. P2A has one item; laddered has many. */
  presignedTxs: PresignedTxInfo[];
  /** P2A CPFP plan. Undefined means a child cannot be built yet. */
  bumpPlan: PreparedCpfpPlan | undefined;
}): AccelerationInfo => {
  if (!pushedTxHex) throw new Error('pushed action tx is not set');
  if (!feeEstimates)
    return {
      replacementFeeRateFloor: null,
      hasAccelerationPath: false
    };

  const maxFeeRate = computeMaxAllowedFeeRate(feeEstimates);
  if (vaultMode === 'LADDERED') {
    const pushedTxInfo = presignedTxs.find(
      presignedTx => presignedTx.txHex === pushedTxHex
    );
    if (!pushedTxInfo) throw new Error('Pushed action tx is not presigned');
    const { tx } = transactionFromHex(pushedTxHex);
    if (!tx || tx.outs.length !== 1) throw new Error('Invalid pushed tx hex');

    // Same fee as the previous input-minus-output calculation, sourced from txMap.
    const replacementFeeRateFloor = pushedTxInfo.fee / tx.virtualSize() + 1;
    if (replacementFeeRateFloor > maxFeeRate)
      return {
        replacementFeeRateFloor,
        hasAccelerationPath: false
      };

    return {
      replacementFeeRateFloor,
      hasAccelerationPath:
        findNextEqualOrLargerFeeRate(presignedTxs, replacementFeeRateFloor) !==
        null
    };
  }

  if (!bumpPlan || bumpPlan.utxosData.length === 0)
    return {
      replacementFeeRateFloor: null,
      hasAccelerationPath: false
    };

  const parentTx = presignedTxs[0];
  if (!parentTx) throw new Error('Missing P2A action tx');
  const replacementFeeRateFloor = getCpfpReplacementFeeRateFloor({
    parentTxHex: parentTx.txHex,
    parentFee: parentTx.fee,
    feeEstimates,
    utxosData: bumpPlan.utxosData,
    childOutput: bumpPlan.changeOutput,
    ...(historyData ? { historyData } : {}),
    ...(bumpPlan.previousChildTxHex
      ? { childTxHex: bumpPlan.previousChildTxHex }
      : {})
  });

  if (replacementFeeRateFloor === null)
    return {
      replacementFeeRateFloor: null,
      hasAccelerationPath: false
    };

  return {
    replacementFeeRateFloor,
    hasAccelerationPath: replacementFeeRateFloor <= maxFeeRate
  };
};

/**
 * Finds the next item with equal-or-larger fee rate.
 *
 * `sortedItems` must be sorted ascending by `feeRate`.
 */
export const findNextEqualOrLargerFeeRate = <T extends { feeRate: number }>(
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
}): {
  childFee: number;
  packageFeeRate: number;
} => {
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
    if (!prevTx)
      throw new Error('Cannot reconstruct CPFP fee info: missing previous tx');
    const prevOut = prevTx?.outs[input.index];
    if (!prevOut)
      throw new Error(
        'Cannot reconstruct CPFP fee info: missing previous output'
      );
    childInputValue += prevOut.value;
  }

  const childOutputValue = childTx.outs.reduce(
    (sum, output) => sum + output.value,
    BigInt(0)
  );
  if (childInputValue <= childOutputValue)
    throw new Error('Cannot reconstruct CPFP fee info: child fee is invalid');

  const childFee = Number(childInputValue - childOutputValue);
  return {
    childFee,
    packageFeeRate:
      (parentFee + childFee) / (parentTx.virtualSize() + childTx.virtualSize())
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
 * Returns the minimum package fee rate that improves the currently live state.
 *
 * There are two cases:
 * - if no CPFP child exists yet, this returns the first actionable package fee
 *   rate above the current parent-only state
 * - if a CPFP child already exists, this returns the first actionable package
 *   fee rate that also satisfies replacement relay rules
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
  childTxHex,
  historyData,
  feeEstimates,
  utxosData,
  childOutput
}: {
  parentTxHex: TxHex;
  parentFee: number;
  childTxHex?: TxHex;
  historyData?: HistoryData;
  feeEstimates: FeeEstimates;
  utxosData: UtxosData;
  childOutput: OutputInstance;
}): number | null => {
  const { tx: parentTx } = transactionFromHex(parentTxHex);
  let currentChildFeeInfo;
  let currentPackageFeeRate;

  if (childTxHex) {
    if (!historyData?.length)
      throw new Error(
        'historyData must be present when computing a child replacement floor'
      );
    currentChildFeeInfo = getCpfpFeeInfo({
      parentTxHex,
      parentFee,
      childTxHex,
      historyData
    });
    currentPackageFeeRate = currentChildFeeInfo.packageFeeRate;
  } else currentPackageFeeRate = parentFee / parentTx.virtualSize();

  const maxFeeRate = computeMaxAllowedFeeRate(feeEstimates);
  for (
    let targetPackageFeeRate = Number(
      (currentPackageFeeRate + FEE_RATE_STEP).toFixed(2)
    );
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

    // if prev package had no child, mo replacement-child-fee rule applies
    if (!childTxHex) return targetPackageFeeRate;

    if (!currentChildFeeInfo)
      throw new Error('currentChildFeeInfo should exist if childTxHex exists');
    if (
      plan.childFee >=
      getMinimumReplacementChildFee({
        previousChildFee: currentChildFeeInfo.childFee,
        replacementChildVSize: plan.childVSize,
        incrementalRelayFeeRate: INCREMENTAL_RELAY_FEE_RATE
      })
    )
      return targetPackageFeeRate;
    //otherwise continue;
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
