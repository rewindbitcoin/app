// Copyright (C) 2026 Jose-Luis Landabaso - https://rewindbitcoin.com
// Licensed under the GNU GPL v3 or later. See the LICENSE file for details.

import { findLowestTrueBinarySearch } from '../../common/lib/binarySearch';
import { toHex } from 'uint8array-tools';
import type { OutputInstance } from '@bitcoinerlab/descriptors';
import { transactionFromHex } from './bitcoin';
import {
  computeMaxAllowedFeeRate,
  MIN_FEE_RATE,
  type FeeEstimates
} from './fees';
import type { Signer } from './wallets';
import { assertP2AParentPolicy, findP2AOutputData } from './p2aPolicy';
import {
  estimateCpfpPackage,
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

  /** Exact reserve plan used to build a P2A child for this action. */
  p2aBumpPlan?: P2ABumpPlan;
};

export type PresignedTxInfo = { txHex: TxHex; fee: number; feeRate: number };

/**
 * P2A fee-bump plan used to fund/sign a CPFP child.
 *
 * This is a reserve-backed plan used only to fund a child tx. The caller
 * already knows which UTXOs the child must spend, where leftover value must go,
 * and which signer controls those UTXOs.
 *
 * Trigger plans usually spend deterministic per-vault reserve UTXOs and send
 * leftover value back to normal wallet change. Future rescue plans should spend
 * temporary rescue-wallet UTXOs and send leftover value back to that temporary
 * wallet's internal/change branch, not to the emergency destination address.
 * Empty no-reserve plans may omit `changeOutput` and `signer`; non-empty plans
 * must include both because the child cannot be built without them.
 */
export type P2ABumpPlan = {
  /** Non-anchor reserve outputs that the child must spend. */
  txosData: UtxosData;
  /** Whether any non-anchor child inputs are still awaiting confirmation. */
  hasUnconfirmedUtxos: boolean;
  /** Action-specific leftover value destination for the CPFP child. */
  changeOutput?: OutputInstance;
  /** Signer used for the non-anchor child inputs. */
  signer?: Signer;
};

/**
 * Current acceleration availability state for one already-broadcast tx.
 */
type AccelerationInfo = {
  /**
   * Minimum fee rate that improves the currently live action state.
   * - Laddered: presigned replacement tx fee rate.
   * - P2A: parent+child package fee rate.
   *
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

const getP2AParentOnlyFeeRate = ({
  vaultMode,
  parentTxInfo
}: {
  vaultMode: 'P2A_TRUC' | 'P2A_NON_TRUC';
  parentTxInfo: PresignedTxInfo;
}): number => {
  const { tx } = transactionFromHex(parentTxInfo.txHex);
  assertP2AParentPolicy({
    tx,
    fee: parentTxInfo.fee,
    txName: 'P2A parent-only action tx',
    vaultMode
  });
  return parentTxInfo.fee / tx.virtualSize();
};

const canSubmitP2AParentOnly = ({
  vaultMode,
  parentTxInfo
}: {
  vaultMode: 'P2A_TRUC' | 'P2A_NON_TRUC';
  parentTxInfo: PresignedTxInfo;
}): boolean =>
  getP2AParentOnlyFeeRate({ vaultMode, parentTxInfo }) >= MIN_FEE_RATE;

/**
 * Returns the current acceleration state for an unconfirmed action tx.
 *
 * The returned fields mean:
 * - `replacementFeeRateFloor`: the minimum fee rate that improves the currently
 *   live state. For laddered vaults this is a presigned replacement tx fee
 *   rate; for P2A vaults this is a parent+child package fee rate.
 * - `hasAccelerationPath`: a valid fee-bump transaction/package can be built
 *   from the supplied inputs
 */
const getActionAccelerationInfo = ({
  vaultMode,
  feeEstimates,
  pushedTxHex,
  pushedChildTxHex,
  presignedTxInfos,
  p2aBumpPlan
}: {
  vaultMode: 'LADDERED' | 'P2A_TRUC' | 'P2A_NON_TRUC';
  feeEstimates: FeeEstimates;
  /**
   * Hex of the action tx that status currently says was pushed/live. The caller
   * only calls this helper while that action tx is still unconfirmed.
   *
   * In practice this is either `vaultStatus.triggerTxHex` or
   * `vaultStatus.panicTxHex`.
   */
  pushedTxHex: TxHex;
  /**
   * Existing CPFP child tx that a new P2A child must replace, if any.
   * Only used in P2A vault modes, and not always present.
   */
  pushedChildTxHex?: TxHex;
  /** Pre-signed parent tx choices. P2A has one item; laddered has many. */
  presignedTxInfos: PresignedTxInfo[];
  /** P2A bump plan. Omitted when a child cannot be built yet. */
  p2aBumpPlan?: P2ABumpPlan;
}): AccelerationInfo => {
  const maxFeeRate = computeMaxAllowedFeeRate(feeEstimates);
  if (vaultMode === 'LADDERED') {
    if (pushedChildTxHex)
      throw new Error('Laddered acceleration cannot have a CPFP child tx');
    if (p2aBumpPlan)
      throw new Error('Laddered acceleration cannot have a P2A bump plan');
    const pushedTxInfo = presignedTxInfos.find(
      presignedTxInfo => presignedTxInfo.txHex === pushedTxHex
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
        findNextEqualOrLargerFeeRate(
          presignedTxInfos,
          replacementFeeRateFloor
        ) !== null
    };
  }

  // A pushed child is not enough to evaluate a P2A replacement: we also need
  // the reserve inputs to reconstruct its fee and build a new child. Treat a
  // missing/empty plan as unavailable instead of throwing because the plan can
  // be legitimately loading or unavailable after app restart.
  if (!p2aBumpPlan || p2aBumpPlan.txosData.length === 0)
    return {
      replacementFeeRateFloor: null,
      hasAccelerationPath: false
    };
  if (!p2aBumpPlan.changeOutput)
    throw new Error('P2A bump plan with reserve UTXOs requires change output');

  const parentTxInfo = presignedTxInfos[0];
  if (!parentTxInfo) throw new Error('Missing P2A action tx');
  const replacementFeeRateFloor = getCpfpReplacementFeeRateFloor({
    parentTxHex: parentTxInfo.txHex,
    parentFee: parentTxInfo.fee,
    feeEstimates,
    utxosData: p2aBumpPlan.txosData,
    childOutput: p2aBumpPlan.changeOutput,
    ...(pushedChildTxHex ? { childTxHex: pushedChildTxHex } : {})
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
 * Experimental pure availability calculator for trigger/rescue action modals.
 *
 * Use this before opening the action confirmation step for either:
 * - Init Unfreeze: pass trigger presigned txs and omit `pushedTxHex` for the
 *   first push, or pass the unconfirmed trigger tx as `pushedTxHex` to check
 *   acceleration.
 * - Rescue: pass rescue presigned txs and omit `pushedTxHex` for the first
 *   rescue, or pass the unconfirmed rescue tx as `pushedTxHex` to check
 *   acceleration.
 *
 * Passing `pushedTxHex` means the action was already broadcast and this is an
 * acceleration/replacement check. Omitting it means this is the first push.
 * If P2A reserve UTXOs exist, the action must use them so the reserve is spent
 * and returned as change instead of leaving stale reserve UTXOs behind.
 * Fixed-fee no-reserve first pushes can be evaluated without fee estimates;
 * replacement checks and package fee selection still require them.
 */
export const getActionAvailability = ({
  vaultMode,
  feeEstimates,
  pushedTxHex,
  pushedChildTxHex,
  presignedTxInfos,
  p2aBumpPlan
}: {
  vaultMode: 'LADDERED' | 'P2A_TRUC' | 'P2A_NON_TRUC';
  feeEstimates?: FeeEstimates;
  pushedTxHex?: TxHex;
  pushedChildTxHex?: TxHex;
  presignedTxInfos: PresignedTxInfo[];
  p2aBumpPlan?: P2ABumpPlan;
}): {
  /**
   * `null` means the user can submit the action somehow: first push,
   * replacement, parent-only tx, or parent+child package depending on the
   * current state.
   *
   * Failure values describe why the user cannot submit the action now:
   * - `noP2AReserve`: no reserve UTXO is available, and the action cannot fall
   *   back to a valid parent-only push. Example: P2A_TRUC trigger with no
   *   reserve.
   * - `p2aReserveUnconfirmed`: a P2A_TRUC reserve UTXO exists but is still
   *   unconfirmed, so package relay cannot use it yet.
   * - `p2aReserveCannotFundMinimumPackage`: reserve UTXOs exist for a first push,
   *   but they cannot fund even the cheapest valid package. In practice
   *   this usually means reserve + anchor value cannot pay the child minimum
   *   relay fee while still leaving a dust-safe child change output.
   * - `noReplacementPath`: an already-pushed action cannot be accelerated with
   *   the supplied presigned txs/reserve inputs under current relay rules.
   * - `replacementFeeAboveMaximum`: replacement is theoretically possible, but
   *   only above the app's overpayment guard. This protects the user from
   *   wasting funds on a fee far above current express estimates. Today that
   *   guard is `computeMaxAllowedFeeRate(feeEstimates)`, which is 2x the
   *   highest fee estimate.
   */
  result:
    | null
    | 'noP2AReserve'
    | 'p2aReserveUnconfirmed'
    | 'p2aReserveCannotFundMinimumPackage'
    | 'noReplacementPath'
    | 'replacementFeeAboveMaximum';
  /**
   * Lowest fee rate the user can select in a fee picker. `null` means no fee
   * picker should be shown; the action may still be submittable at a fixed
   * presigned fee when `result` is `null`.
   */
  minimumSelectableFeeRate: number | null;
} => {
  const isReplacement = pushedTxHex !== undefined;

  if (pushedChildTxHex && !isReplacement)
    throw new Error('A pushed child tx requires a pushed parent tx');

  if (vaultMode === 'LADDERED') {
    if (pushedChildTxHex)
      throw new Error('Laddered actions cannot have a CPFP child tx');
    if (p2aBumpPlan)
      throw new Error('Laddered actions cannot have a P2A bump plan');

    if (isReplacement) {
      if (!feeEstimates)
        throw new Error('Fee estimates are required for replacement actions');
      const accelerationInfo = getActionAccelerationInfo({
        vaultMode,
        feeEstimates,
        pushedTxHex,
        presignedTxInfos
      });
      return {
        result: accelerationInfo.hasAccelerationPath
          ? null
          : accelerationInfo.replacementFeeRateFloor !== null &&
              accelerationInfo.replacementFeeRateFloor >
                computeMaxAllowedFeeRate(feeEstimates)
            ? 'replacementFeeAboveMaximum'
            : 'noReplacementPath',
        minimumSelectableFeeRate: accelerationInfo.hasAccelerationPath
          ? accelerationInfo.replacementFeeRateFloor
          : null
      };
    } else {
      const minimumSelectableFeeRate = presignedTxInfos[0]?.feeRate;
      if (minimumSelectableFeeRate === undefined)
        throw new Error('Missing presigned action tx');
      return {
        result: null,
        minimumSelectableFeeRate
      };
    }
  } else {
    const parentTxInfo = presignedTxInfos[0];
    if (!parentTxInfo) throw new Error('Missing presigned P2A action tx');
    const hasP2AReserveUtxos = !!p2aBumpPlan && p2aBumpPlan.txosData.length > 0;
    const p2aReserveUnconfirmed =
      vaultMode === 'P2A_TRUC' && !!p2aBumpPlan?.hasUnconfirmedUtxos;
    const spendableP2ABumpPlan =
      p2aReserveUnconfirmed || !hasP2AReserveUtxos ? undefined : p2aBumpPlan;

    if (isReplacement) {
      if (!hasP2AReserveUtxos)
        return {
          minimumSelectableFeeRate: null,
          result: 'noP2AReserve'
        };
      if (p2aReserveUnconfirmed)
        return {
          minimumSelectableFeeRate: null,
          result: 'p2aReserveUnconfirmed'
        };
      if (!feeEstimates)
        throw new Error('Fee estimates are required for replacement actions');
      const accelerationInfo = getActionAccelerationInfo({
        vaultMode,
        feeEstimates,
        pushedTxHex,
        ...(pushedChildTxHex ? { pushedChildTxHex } : {}),
        presignedTxInfos,
        ...(spendableP2ABumpPlan ? { p2aBumpPlan: spendableP2ABumpPlan } : {})
      });
      return {
        result: accelerationInfo.hasAccelerationPath
          ? null
          : accelerationInfo.replacementFeeRateFloor !== null &&
              accelerationInfo.replacementFeeRateFloor >
                computeMaxAllowedFeeRate(feeEstimates)
            ? 'replacementFeeAboveMaximum'
            : 'noReplacementPath',
        minimumSelectableFeeRate: accelerationInfo.hasAccelerationPath
          ? accelerationInfo.replacementFeeRateFloor
          : null
      };
    } else {
      const canSubmitParentOnly =
        !hasP2AReserveUtxos &&
        canSubmitP2AParentOnly({ vaultMode, parentTxInfo });
      if (p2aReserveUnconfirmed)
        return {
          minimumSelectableFeeRate: null,
          result: 'p2aReserveUnconfirmed'
        };
      if (
        spendableP2ABumpPlan &&
        spendableP2ABumpPlan.txosData.length > 0 &&
        !feeEstimates
      )
        throw new Error('Fee estimates are required for package actions');
      const maximumFeeRate = feeEstimates
        ? computeMaxAllowedFeeRate(feeEstimates)
        : null;
      // For first pushes with reserve UTXOs, this asks whether the reserve can
      // fund any valid child package at all. It intentionally starts at
      // MIN_FEE_RATE, not at the current network estimate. If the minimum cannot
      // be built, higher targets cannot be built either because they only
      // increase child fee and shrink the dust-constrained change output.
      const packageMinimumFeeRate =
        spendableP2ABumpPlan &&
        spendableP2ABumpPlan.txosData.length > 0 &&
        maximumFeeRate !== null
          ? findMinimumActionableFeeRate({
              minimumFeeRate: MIN_FEE_RATE,
              maximumFeeRate,
              canBuildAtFeeRate: feeRate =>
                spendableP2ABumpPlan.changeOutput !== undefined &&
                estimateCpfpPackage({
                  parentTxHex: parentTxInfo.txHex,
                  parentFee: parentTxInfo.fee,
                  targetPackageFeeRate: feeRate,
                  utxosData: spendableP2ABumpPlan.txosData,
                  changeOutput: spendableP2ABumpPlan.changeOutput
                }) !== null
            })
          : null;

      return {
        minimumSelectableFeeRate: packageMinimumFeeRate,
        result:
          canSubmitParentOnly || packageMinimumFeeRate !== null
            ? null
            : hasP2AReserveUtxos
              ? 'p2aReserveCannotFundMinimumPackage'
              : 'noP2AReserve'
      };
    }
  }
};

/**
 * Builds display/submission data for the selected trigger/rescue fee rate.
 *
 * Use this in the action confirmation step after `getActionAvailability(...)`
 * has established that the action can be submitted and, when a fee picker is
 * shown, after the user selected a fee rate.
 *
 * Examples:
 * - Init Unfreeze first push: pass the trigger presigned tx. If P2A trigger
 *   reserve UTXOs exist, this returns parent+child package data; otherwise it
 *   can return parent-only data when the presigned trigger fee is policy-valid.
 * - Trigger acceleration: pass `pushedTxHex` to mark that the trigger is already
 *   in the mempool. P2A acceleration needs a reserve-backed child package.
 * - Rescue first push: pass the rescue presigned tx. If P2A rescue reserve
 *   UTXOs exist, they are always consumed; otherwise parent-only rescue is
 *   allowed when the presigned rescue fee is policy-valid.
 * - Rescue acceleration: pass `pushedTxHex` for the unconfirmed rescue tx and a
 *   P2A bump plan when using P2A.
 */
export const buildTxDataForFeeRate = ({
  vaultMode,
  selectedFeeRate,
  pushedTxHex,
  presignedTxInfos,
  p2aBumpPlan
}: {
  vaultMode: 'LADDERED' | 'P2A_TRUC' | 'P2A_NON_TRUC';
  selectedFeeRate: number;
  pushedTxHex?: TxHex;
  presignedTxInfos: PresignedTxInfo[];
  p2aBumpPlan?: P2ABumpPlan;
}): VaultActionTxData | null => {
  const isReplacement = pushedTxHex !== undefined;

  if (vaultMode === 'LADDERED') {
    if (p2aBumpPlan)
      throw new Error('Laddered actions cannot have a P2A bump plan');
    const actionInfo = findNextEqualOrLargerFeeRate(
      presignedTxInfos,
      selectedFeeRate
    );
    if (!actionInfo) return null;
    return {
      parentTxHex: actionInfo.txHex,
      parentTxFee: actionInfo.fee,
      actionFee: actionInfo.fee,
      actionFeeRate: actionInfo.feeRate
    };
  } else {
    const parentTxInfo = presignedTxInfos[0];
    if (!parentTxInfo) throw new Error('Missing presigned P2A action tx');
    if (isReplacement && pushedTxHex !== parentTxInfo.txHex)
      throw new Error('Pushed P2A action tx is not the presigned action tx');

    if (p2aBumpPlan && p2aBumpPlan.txosData.length > 0) {
      if (vaultMode === 'P2A_TRUC' && p2aBumpPlan.hasUnconfirmedUtxos)
        return null;
      if (!p2aBumpPlan.changeOutput)
        throw new Error(
          'P2A bump plan with reserve UTXOs requires change output'
        );
      const plan = estimateCpfpPackage({
        parentTxHex: parentTxInfo.txHex,
        parentFee: parentTxInfo.fee,
        targetPackageFeeRate: selectedFeeRate,
        utxosData: p2aBumpPlan.txosData,
        changeOutput: p2aBumpPlan.changeOutput
      });
      if (!plan) return null;
      return {
        parentTxHex: parentTxInfo.txHex,
        parentTxFee: parentTxInfo.fee,
        actionFee: plan.packageFee,
        actionFeeRate: plan.packageFeeRate,
        p2aBumpPlan
      };
    } else {
      if (isReplacement) return null;
      const parentOnlyFeeRate = getP2AParentOnlyFeeRate({
        vaultMode,
        parentTxInfo
      });
      if (
        parentOnlyFeeRate < MIN_FEE_RATE ||
        selectedFeeRate > parentOnlyFeeRate
      )
        return null;
      return {
        parentTxHex: parentTxInfo.txHex,
        parentTxFee: parentTxInfo.fee,
        actionFee: parentTxInfo.fee,
        actionFeeRate: parentOnlyFeeRate
      };
    }
  }
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
 * Reconstructs CPFP fee info from the known non-anchor UTXOs.
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
  utxosData
}: {
  parentTxHex: TxHex;
  parentFee: number;
  childTxHex: TxHex;
  utxosData: UtxosData;
}): { childFee: number; packageFeeRate: number } => {
  const { tx: parentTx } = transactionFromHex(parentTxHex);
  const { tx: childTx } = transactionFromHex(childTxHex);
  const parentTxId = parentTx.getId();
  const anchorOutput = findP2AOutputData(parentTx);
  if (!anchorOutput)
    throw new Error('Expected exactly one P2A output in parent tx');

  const knownUtxoValueByOutpoint = new Map(
    utxosData.map(utxoData => {
      const output = utxoData.tx.outs[utxoData.vout];
      if (!output)
        throw new Error(
          'Cannot reconstruct CPFP fee info: missing known UTXO output'
        );
      return [`${utxoData.tx.getId()}:${utxoData.vout}`, output.value] as const;
    })
  );
  let childInputValue = BigInt(0);
  let spendsAnchor = false;

  // Sum every child input value; the parent P2A anchor is not in utxosData.
  for (const input of childTx.ins) {
    const prevTxId = toHex(Uint8Array.from(input.hash).reverse());
    if (prevTxId === parentTxId && input.index === anchorOutput.index) {
      spendsAnchor = true;
      childInputValue += BigInt(anchorOutput.value);
    } else {
      const inputValue = knownUtxoValueByOutpoint.get(
        `${prevTxId}:${input.index}`
      );
      if (inputValue === undefined)
        throw new Error(
          'Cannot reconstruct CPFP fee info: missing known child input'
        );
      childInputValue += inputValue;
    }
  }
  if (!spendsAnchor)
    throw new Error('CPFP child does not spend parent P2A anchor');

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
  feeEstimates,
  utxosData,
  childOutput
}: {
  parentTxHex: TxHex;
  parentFee: number;
  /**
   * Previously broadcast CPFP child in the live package. Omit when the user only
   * broadcast the parent action tx and this acceleration adds the first child.
   */
  childTxHex?: TxHex;
  feeEstimates: FeeEstimates;
  utxosData: UtxosData;
  childOutput: OutputInstance;
}): number | null => {
  const { tx: parentTx } = transactionFromHex(parentTxHex);
  const currentChildFeeInfo = childTxHex
    ? getCpfpFeeInfo({
        parentTxHex,
        parentFee,
        childTxHex,
        utxosData
      })
    : null;
  const currentPackageFeeRate =
    currentChildFeeInfo?.packageFeeRate ?? parentFee / parentTx.virtualSize();

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
    if (plan) {
      // If the previous package had no child, no replacement-child-fee rule applies.
      if (!currentChildFeeInfo) return targetPackageFeeRate;
      const minimumReplacementChildFee = getMinimumReplacementChildFee({
        previousChildFee: currentChildFeeInfo.childFee,
        replacementChildVSize: plan.childVSize,
        incrementalRelayFeeRate: INCREMENTAL_RELAY_FEE_RATE
      });
      if (plan.childFee >= minimumReplacementChildFee)
        return targetPackageFeeRate;
    }
  }
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
