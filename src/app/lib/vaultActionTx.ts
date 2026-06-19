// Copyright (C) 2026 Jose-Luis Landabaso - https://rewindbitcoin.com
// Licensed under the GNU GPL v3 or later. See the LICENSE file for details.

import { findLowestTrueBinarySearch } from '../../common/lib/binarySearch';
import { toHex } from 'uint8array-tools';
import type { Account } from '@bitcoinerlab/discovery';
import type { OutputInstance } from '@bitcoinerlab/descriptors';
import { transactionFromHex } from './bitcoin';
import {
  computeMaxAllowedFeeRate,
  MIN_FEE_RATE,
  type FeeEstimates
} from './fees';
import type { Signer } from './wallets';
import { assertP2AParentPolicy, findP2AOutputData } from './p2aPolicy';
import { getAdditionalP2AOutputValue } from './p2aReserve';
import {
  estimateCpfpPackage,
  type HistoryData,
  type TxHex,
  type Vault,
  type UtxosData
} from './vaults';
import { toNumber } from './sats';

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

export type VaultActionData = {
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
  parentFee: number;

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

  /**
   * Reserve input/signing plan used to build a P2A child for this action.
   * Omitted for laddered actions and P2A parent-only actions.
   */
  p2aBumpPlan?: P2ABumpPlan;

  /**
   * Exact child change destination to use when broadcasting a P2A child package.
   *
   * This is set for every action that includes `p2aBumpPlan`. Usually it is the
   * same value as the modal's initial child change. It differs only when the
   * trigger user manually picks a custom change address.
   *
   * `walletAccountToTrack` is only needed for custom wallet change. Tracked
   * accounts are the wallet accounts that discovery keeps scanning. If custom
   * change uses an account that is not tracked yet, the wallet must track it
   * before broadcast so it can later see the change UTXO.
   */
  finalChildChange?: {
    descriptor: string;
    index: number;
    walletAccountToTrack?: Account;
  };

  /**
   * Hot-wallet UTXOs selected as a supplement to the P2A reserve inputs.
   * `walletSupplementUnneeded` means the action does not need hot-wallet inputs,
   * including laddered, parent-only, and reserve-only actions.
   */
  walletSupplementUtxosData: UtxosData | 'walletSupplementUnneeded';
};

export type PresignedTxInfo = { txHex: TxHex; fee: number; feeRate: number };

/**
 * P2A reserve fee-bump plan used to fund/sign a CPFP child.
 *
 * This plan contains the reserve UTXOs and signer known before
 * fee-rate-specific wallet supplement selection. It does not include normal
 * wallet supplement UTXOs; those stay separate as
 * `VaultActionData.walletSupplementUtxosData`.
 *
 * Trigger plans usually spend deterministic per-vault reserve UTXOs and send
 * leftover value back to normal wallet change. Rescue plans spend temporary
 * rescue-wallet UTXOs and send leftover value back to that temporary wallet's
 * internal/change path, not to the emergency destination address. The child
 * change output is selected by the caller because trigger flows may let the
 * user override it per action.
 */
export type P2ABumpPlan = {
  /** Non-anchor reserve outputs that the child must spend. */
  txosData: UtxosData;
  /** Whether any non-anchor child inputs are still awaiting confirmation. */
  hasUnconfirmedUtxos: boolean;
  /** Signer used for the non-anchor child inputs. */
  signer?: Signer;
};

const getTxosOutputsWithValue = (utxosData: UtxosData) =>
  utxosData.map(utxoData => {
    const output = utxoData.tx.outs[utxoData.vout];
    if (!output) throw new Error('Invalid utxoData output');
    return { output: utxoData.output, value: output.value };
  });

/**
 * Computes the recommended value, in sats, for one additional output that will
 * later be spent as a P2A CPFP child input.
 *
 * This is the shared sizing helper for both rescue reserve top-ups and trigger
 * hot-wallet supplement hints. It always returns a concrete value, including 0
 * when no additional value is needed. Callers must wait until all required data
 * is loaded before calling it; invalid internal assumptions throw.
 */
export const getAdditionalOutputValue = ({
  p2aBumpPlan,
  additionalOutput,
  childChangeOutput,
  parentTxInfo,
  targetPackageFeeRate,
  vaultableWalletUtxosData
}: {
  /** Loaded P2A bump plan whose current reserve inputs are used. */
  p2aBumpPlan: P2ABumpPlan | 'loading' | 'error';
  /** Output script/type of the next UTXO that will be added to the child inputs. */
  additionalOutput: OutputInstance;
  /** Output that receives leftover child value after fees. */
  childChangeOutput: OutputInstance;
  /** Presigned P2A parent/action tx being bumped by the child package. */
  parentTxInfo: PresignedTxInfo;
  /** Target parent+child package feerate the additional output should fund. */
  targetPackageFeeRate: number;
  /**
   * Normal wallet UTXOs that are already policy-filtered for this vault mode.
   * Omit this only when wallet UTXOs must not be considered, such as rescue
   * reserve funding. Pass an empty array when wallet UTXOs are intentionally in
   * scope but none are currently available; do not call this helper while they
   * are still loading.
   */
  vaultableWalletUtxosData?: UtxosData;
}): number => {
  if (typeof p2aBumpPlan !== 'object')
    throw new Error('P2A bump plan must be loaded');

  const { tx: parentTx } = transactionFromHex(parentTxInfo.txHex);
  const parentAnchor = findP2AOutputData(parentTx);
  if (!parentAnchor)
    throw new Error('Expected exactly one P2A output in parent tx');
  const existingOutputsWithValue = getTxosOutputsWithValue([
    ...p2aBumpPlan.txosData,
    ...(vaultableWalletUtxosData ?? [])
  ]);

  return Number(
    getAdditionalP2AOutputValue({
      outputsWithValue: existingOutputsWithValue,
      additionalOutput,
      changeOutput: childChangeOutput,
      parentAnchorValue: parentAnchor.value,
      presignedParentVSize: parentTx.virtualSize(),
      presignedParentFeeRate: parentTxInfo.fee / parentTx.virtualSize(),
      targetPackageFeeRate
    })
  );
};

/**
 * Selects wallet supplement inputs for a P2A CPFP child while preserving the
 * reserve-first invariant.
 *
 * The full reserve set is always tried first; if it can build the target
 * package this returns `walletSupplementUnneeded`. Only when reserve-only cannot
 * build does this select user-approved normal-wallet supplement UTXOs, largest
 * first, until the package becomes buildable. It never selects a subset of
 * reserve UTXOs.
 */
const coinSelectWalletSupplementUtxosData = ({
  parentTxHex,
  parentFee,
  targetPackageFeeRate,
  reserveUtxosData,
  vaultableWalletUtxosData,
  coinControl,
  changeOutput
}: {
  /** P2A parent transaction whose anchor output will be spent by the child. */
  parentTxHex: TxHex;
  /** Miner fee already paid directly by the parent transaction. */
  parentFee: number;
  /** Target package feerate for parent plus CPFP child. */
  targetPackageFeeRate: number;
  /** Full reserve set; the helper never selects a subset of these inputs. */
  reserveUtxosData: UtxosData;
  /**
   * Normal wallet UTXOs that are already policy-filtered for this vault mode.
   * For P2A_TRUC they must be confirmed; for P2A_NON_TRUC they may include only
   * stable unconfirmed inputs allowed by wallet/vault policy. These are appended
   * only after reserve-only selection fails, so they do not weaken reserve-first
   * behavior.
   */
  vaultableWalletUtxosData?: UtxosData;
  /**
   * When true, `vaultableWalletUtxosData` is the exact manual normal-wallet
   * supplement selection. The full reserve set remains an all-or-none policy
   * input; only wallet supplement inputs are user-selected.
   */
  coinControl: boolean;
  /** Output that receives leftover child value. */
  changeOutput: OutputInstance;
}): UtxosData | 'walletSupplementUnneeded' | 'cannotBuildPackage' => {
  const reserveOnlyCanBuild =
    reserveUtxosData.length > 0 &&
    !!estimateCpfpPackage({
      parentTxHex,
      parentFee,
      targetPackageFeeRate,
      utxosData: reserveUtxosData,
      changeOutput
    });

  if (reserveOnlyCanBuild) return 'walletSupplementUnneeded';

  if (!vaultableWalletUtxosData?.length) return 'cannotBuildPackage';

  if (coinControl) {
    const childUtxosData = [...reserveUtxosData, ...vaultableWalletUtxosData];
    return estimateCpfpPackage({
      parentTxHex,
      parentFee,
      targetPackageFeeRate,
      utxosData: childUtxosData,
      changeOutput
    })
      ? vaultableWalletUtxosData
      : 'cannotBuildPackage';
  }

  const selectedWalletUtxosData: UtxosData = [];
  const sortedWalletUtxosData = [...vaultableWalletUtxosData].sort((a, b) => {
    const outputA = a.tx.outs[a.vout];
    const outputB = b.tx.outs[b.vout];
    if (!outputA || !outputB) throw new Error('Invalid utxoData output');
    return toNumber(outputB.value) - toNumber(outputA.value);
  });
  for (const utxoData of sortedWalletUtxosData) {
    selectedWalletUtxosData.push(utxoData);
    const childUtxosData = [...reserveUtxosData, ...selectedWalletUtxosData];
    if (
      estimateCpfpPackage({
        parentTxHex,
        parentFee,
        targetPackageFeeRate,
        utxosData: childUtxosData,
        changeOutput
      })
    )
      return selectedWalletUtxosData;
  }
  return 'cannotBuildPackage';
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
  p2aBumpPlan,
  childChangeOutput,
  vaultableWalletUtxosData,
  coinControl,
  historyData
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
  /** Output that receives leftover child value after fees. */
  childChangeOutput?: OutputInstance;
  /**
   * Normal wallet UTXOs that are already policy-filtered for this vault mode.
   * For P2A_TRUC they must be confirmed; for P2A_NON_TRUC they may include only
   * stable unconfirmed inputs allowed by wallet/vault policy. These are appended
   * only after reserve-only selection fails, so they do not weaken reserve-first
   * behavior.
   */
  vaultableWalletUtxosData?: UtxosData;
  /**
   * When true, `vaultableWalletUtxosData` is the exact manual normal-wallet
   * supplement selection for P2A child construction.
   */
  coinControl: boolean;
  /**
   * Needed for P2A replacements when the previous child used inputs that do not
   * belong to the reserve, such as normal-wallet supplement inputs in the trigger.
   */
  historyData: HistoryData;
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
  // known child inputs to reconstruct its fee and build a new child. Treat a
  // missing/empty plan as unavailable instead of throwing because the plan can
  // be legitimately loading or unavailable after app restart.
  const canAttemptP2AChild =
    !!p2aBumpPlan &&
    (p2aBumpPlan.txosData.length > 0 || !!vaultableWalletUtxosData?.length);
  if (!p2aBumpPlan || !canAttemptP2AChild)
    return {
      replacementFeeRateFloor: null,
      hasAccelerationPath: false
    };
  if (!childChangeOutput)
    throw new Error('P2A bump plan with child inputs requires change output');
  const parentTxInfo = presignedTxInfos[0];
  if (!parentTxInfo) throw new Error('Missing P2A action tx');
  const replacementFeeRateFloor = getCpfpReplacementFeeRateFloor({
    parentTxHex: parentTxInfo.txHex,
    parentFee: parentTxInfo.fee,
    feeEstimates,
    reserveUtxosData: p2aBumpPlan.txosData,
    ...(vaultableWalletUtxosData?.length ? { vaultableWalletUtxosData } : {}),
    coinControl,
    childOutput: childChangeOutput,
    historyData,
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
 * Checks what would block a trigger/rescue vault action.
 *
 * This studies whether an initial trigger/rescue or an acceleration can move
 * past the intro step by testing conditions that would prevent building it,
 * then returns the user-visible reason if one is found. If no reason blocks the
 * action, it may also return the minimum fee rate that can build. That is
 * useful for accelerations because it computes the next package fee rate that
 * meets replacement policy. Callers still need
 * `buildVaultActionDataForFeeRate(...)` to build submit-ready action data for a
 * concrete fee rate.
 *
 * Use this before leaving the action intro step for either:
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
export const getVaultActionBlocker = ({
  vaultMode,
  feeEstimates,
  pushedTxHex,
  pushedChildTxHex,
  presignedTxInfos,
  p2aBumpPlan,
  childChangeOutput,
  vaultableWalletUtxosData,
  coinControl,
  historyData
}: {
  vaultMode: 'LADDERED' | 'P2A_TRUC' | 'P2A_NON_TRUC';
  feeEstimates?: FeeEstimates;
  pushedTxHex?: TxHex;
  pushedChildTxHex?: TxHex;
  presignedTxInfos: PresignedTxInfo[];
  p2aBumpPlan?: P2ABumpPlan;
  /** Output that receives leftover child value after fees. */
  childChangeOutput?: OutputInstance;
  /**
   * Normal wallet UTXOs that are already policy-filtered for this vault mode.
   * For P2A_TRUC they must be confirmed; for P2A_NON_TRUC they may include only
   * stable unconfirmed inputs allowed by wallet/vault policy. These are appended
   * only after reserve-only selection fails, so they do not weaken reserve-first
   * behavior.
   */
  vaultableWalletUtxosData?: UtxosData;
  /**
   * When true, `vaultableWalletUtxosData` is the exact manual normal-wallet
   * supplement selection for P2A child construction.
   */
  coinControl: boolean;
  /**
   * Needed for P2A replacements when the previous child used inputs that do not
   * belong to the reserve, such as normal-wallet supplement inputs in the trigger.
   */
  historyData: HistoryData;
}): {
  /**
   * `reason: null` means no blocking reason was found, so the action can move
   * past the intro step. The caller must still build concrete action data for
   * the chosen fee rate before enabling final submission.
   *
   * Non-null reason values describe why the user cannot start or accelerate the
   * action now:
   * - `noP2AReserve`: no reserve UTXO is available, and the action cannot fall
   *   back to a valid parent-only push. Example: P2A_TRUC trigger with no
   *   reserve.
   * - `p2aReserveUnconfirmed`: a P2A_TRUC reserve UTXO exists but is still
   *   unconfirmed, so package relay cannot use it yet.
   * - `p2aReserveCannotFundMinimumPackage`: reserve UTXOs exist for a first push,
   *   but they cannot fund even the cheapest valid package. In practice
   *   this usually means reserve + anchor value cannot pay the child minimum
   *   relay fee while still leaving a dust-safe child change output.
   * - `childChangeUnavailable`: a P2A child package has candidate inputs, but
   *   its change destination is not ready yet.
   * - `noReplacementPath`: an already-pushed action cannot be accelerated with
   *   the supplied presigned txs/reserve inputs under current relay rules.
   * - `replacementFeeAboveMaximum`: replacement is theoretically possible, but
   *   only above the app's overpayment guard. This protects the user from
   *   wasting funds on a fee far above current express estimates. Today that
   *   guard is `computeMaxAllowedFeeRate(feeEstimates)`, which is 2x the
   *   highest fee estimate.
   */
  reason:
    | null
    | 'noP2AReserve'
    | 'p2aReserveUnconfirmed'
    | 'p2aReserveCannotFundMinimumPackage'
    | 'childChangeUnavailable'
    | 'noReplacementPath'
    | 'replacementFeeAboveMaximum';
  /**
   * Lowest fee rate the user can select in a fee picker. `null` means no fee
   * picker should be shown; the action may still be submittable at a fixed
   * presigned fee when `reason` is `null`.
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
        presignedTxInfos,
        coinControl,
        historyData
      });
      return {
        reason: accelerationInfo.hasAccelerationPath
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
        reason: null,
        minimumSelectableFeeRate
      };
    }
  } else {
    const parentTxInfo = presignedTxInfos[0];
    if (!parentTxInfo) throw new Error('Missing presigned P2A action tx');
    const hasP2AReserveUtxos = !!p2aBumpPlan && p2aBumpPlan.txosData.length > 0;
    const hasVaultableWalletUtxos = !!vaultableWalletUtxosData?.length;
    const hasP2AChildInputs = hasP2AReserveUtxos || hasVaultableWalletUtxos;
    const hasUnconfirmedP2ATrucReserve =
      vaultMode === 'P2A_TRUC' && !!p2aBumpPlan?.hasUnconfirmedUtxos;
    const isChildChangeUnavailable =
      !!p2aBumpPlan && hasP2AChildInputs && !childChangeOutput;
    const canComputeMinimumP2APackageFeeRate =
      !!p2aBumpPlan &&
      !!childChangeOutput &&
      hasP2AChildInputs &&
      !hasUnconfirmedP2ATrucReserve;

    if (isReplacement && !hasP2AChildInputs)
      return {
        minimumSelectableFeeRate: null,
        reason: 'noP2AReserve'
      };
    if (hasUnconfirmedP2ATrucReserve)
      return {
        minimumSelectableFeeRate: null,
        reason: 'p2aReserveUnconfirmed'
      };
    if (isChildChangeUnavailable)
      return {
        minimumSelectableFeeRate: null,
        reason: 'childChangeUnavailable'
      };

    if (isReplacement) {
      if (!feeEstimates)
        throw new Error('Fee estimates are required for replacement actions');
      const accelerationInfo = getActionAccelerationInfo({
        vaultMode,
        feeEstimates,
        pushedTxHex,
        ...(pushedChildTxHex ? { pushedChildTxHex } : {}),
        presignedTxInfos,
        ...(p2aBumpPlan ? { p2aBumpPlan } : {}),
        ...(childChangeOutput ? { childChangeOutput } : {}),
        ...(vaultableWalletUtxosData?.length
          ? { vaultableWalletUtxosData }
          : {}),
        coinControl,
        historyData
      });
      return {
        reason: accelerationInfo.hasAccelerationPath
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
      const maximumFeeRate = feeEstimates
        ? computeMaxAllowedFeeRate(feeEstimates)
        : null;
      if (canComputeMinimumP2APackageFeeRate && !feeEstimates)
        throw new Error('Fee estimates are required for package actions');
      // For first pushes with reserve UTXOs, this asks whether the reserve can
      // fund any valid child package at all. It intentionally starts at
      // MIN_FEE_RATE, not at the current network estimate. If the minimum cannot
      // be built, higher targets cannot be built either because they only
      // increase child fee and shrink the dust-constrained change output.
      const packageMinimumFeeRate =
        canComputeMinimumP2APackageFeeRate && maximumFeeRate !== null
          ? findMinimumActionableFeeRate({
              minimumFeeRate: MIN_FEE_RATE,
              maximumFeeRate,
              canBuildAtFeeRate: feeRate => {
                return (
                  coinSelectWalletSupplementUtxosData({
                    parentTxHex: parentTxInfo.txHex,
                    parentFee: parentTxInfo.fee,
                    targetPackageFeeRate: feeRate,
                    reserveUtxosData: p2aBumpPlan.txosData,
                    ...(vaultableWalletUtxosData?.length
                      ? { vaultableWalletUtxosData }
                      : {}),
                    coinControl,
                    changeOutput: childChangeOutput
                  }) !== 'cannotBuildPackage'
                );
              }
            })
          : null;

      return {
        minimumSelectableFeeRate: packageMinimumFeeRate,
        reason:
          canSubmitParentOnly || packageMinimumFeeRate !== null
            ? null
            : hasP2AChildInputs
              ? 'p2aReserveCannotFundMinimumPackage'
              : 'noP2AReserve'
      };
    }
  }
};

/**
 * Builds display/submission data for the selected trigger/rescue fee rate.
 *
 * Use this in the action confirmation step after `getVaultActionBlocker(...)`
 * returns `reason: null` and, when a fee picker is shown, after the user
 * selected a fee rate.
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
export const buildVaultActionDataForFeeRate = ({
  vaultMode,
  selectedFeeRate,
  pushedTxHex,
  presignedTxInfos,
  p2aBumpPlan,
  childChangePlan,
  vaultableWalletUtxosData,
  coinControl
}: {
  vaultMode: 'LADDERED' | 'P2A_TRUC' | 'P2A_NON_TRUC';
  selectedFeeRate: number;
  pushedTxHex?: TxHex;
  presignedTxInfos: PresignedTxInfo[];
  p2aBumpPlan?: P2ABumpPlan;
  /** Output used for child-change sizing, plus the child change data to return if a child package builds. */
  childChangePlan?: {
    output: OutputInstance;
    finalChildChange: NonNullable<VaultActionData['finalChildChange']>;
  };
  /**
   * Normal wallet UTXOs that are already policy-filtered for this vault mode.
   * For P2A_TRUC they must be confirmed; for P2A_NON_TRUC they may include only
   * stable unconfirmed inputs allowed by wallet/vault policy. These are appended
   * only after reserve-only selection fails, so they do not weaken reserve-first
   * behavior.
   */
  vaultableWalletUtxosData?: UtxosData;
  /**
   * When true, `vaultableWalletUtxosData` is the exact manual normal-wallet
   * supplement selection for P2A child construction.
   */
  coinControl: boolean;
}): VaultActionData | null => {
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
      parentFee: actionInfo.fee,
      actionFee: actionInfo.fee,
      actionFeeRate: actionInfo.feeRate,
      walletSupplementUtxosData: 'walletSupplementUnneeded'
    };
  } else {
    const parentTxInfo = presignedTxInfos[0];
    if (!parentTxInfo) throw new Error('Missing presigned P2A action tx');
    if (isReplacement && pushedTxHex !== parentTxInfo.txHex)
      throw new Error('Pushed P2A action tx is not the presigned action tx');
    if (vaultMode === 'P2A_TRUC' && p2aBumpPlan?.hasUnconfirmedUtxos)
      return null;

    // Only run coin selection when a child package has candidate inputs.
    // Selected wallet UTXOs are added to the full bump-plan input set.
    const canAttemptCoinSelect =
      !!p2aBumpPlan &&
      (p2aBumpPlan.txosData.length > 0 || !!vaultableWalletUtxosData?.length);
    if (canAttemptCoinSelect && !childChangePlan)
      throw new Error('P2A bump plan with child inputs requires change output');
    // `walletSupplementUnneeded` means the reserve alone can build the package,
    // an array means those wallet UTXOs are needed, and `cannotBuildPackage`
    // means the target package cannot be built from reserve plus the supplied
    // wallet candidates.
    const walletSupplementUtxosData =
      canAttemptCoinSelect && childChangePlan
        ? coinSelectWalletSupplementUtxosData({
            parentTxHex: parentTxInfo.txHex,
            parentFee: parentTxInfo.fee,
            targetPackageFeeRate: selectedFeeRate,
            reserveUtxosData: p2aBumpPlan.txosData,
            ...(vaultableWalletUtxosData?.length
              ? { vaultableWalletUtxosData }
              : {}),
            coinControl,
            changeOutput: childChangePlan.output
          })
        : 'cannotBuildPackage';

    if (walletSupplementUtxosData !== 'cannotBuildPackage') {
      //walletSupplementUtxosData is either 'walletSupplementUnneeded' or an
      //array (UtxosData)
      if (!p2aBumpPlan || !childChangePlan)
        throw new Error('P2A package data missing after coin selection');

      const packageEstimate = estimateCpfpPackage({
        parentTxHex: parentTxInfo.txHex,
        parentFee: parentTxInfo.fee,
        targetPackageFeeRate: selectedFeeRate,
        utxosData: [
          ...p2aBumpPlan.txosData,
          ...(Array.isArray(walletSupplementUtxosData)
            ? walletSupplementUtxosData
            : []) /* walletSupplementUtxosData === 'walletSupplementUnneeded'*/
        ],
        changeOutput: childChangePlan.output
      });
      if (packageEstimate)
        return {
          parentTxHex: parentTxInfo.txHex,
          parentFee: parentTxInfo.fee,
          actionFee: packageEstimate.packageFee,
          actionFeeRate: packageEstimate.packageFeeRate,
          p2aBumpPlan,
          finalChildChange: childChangePlan.finalChildChange,
          walletSupplementUtxosData
        };
      else return null;
    } else {
      //walletSupplementUtxosData === 'cannotBuildPackage'

      // If reserve UTXOs exist but cannot fund the selected package, do not
      // fall back to parent-only: spending the reserve is part of the invariant.
      if (p2aBumpPlan?.txosData.length) return null;

      // Without reserve UTXOs, parent-only submission may still be valid.
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
        parentFee: parentTxInfo.fee,
        actionFee: parentTxInfo.fee,
        actionFeeRate: parentOnlyFeeRate,
        walletSupplementUtxosData: 'walletSupplementUnneeded'
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
  reserveUtxosData,
  historyData
}: {
  parentTxHex: TxHex;
  parentFee: number;
  childTxHex: TxHex;
  /** Reserve UTXOs known locally when reconstructing the child input values. */
  reserveUtxosData: UtxosData;
  /**
   * Needed for P2A replacements when the previous child used inputs that do not
   * belong to the reserve, such as normal-wallet supplement inputs in the trigger.
   * If a non-anchor child input cannot be found in either `reserveUtxosData` or
   * `historyData`, this helper throws because the child fee cannot be reconstructed.
   */
  historyData: HistoryData;
}): { childFee: number; packageFeeRate: number } => {
  const { tx: parentTx } = transactionFromHex(parentTxHex);
  const { tx: childTx } = transactionFromHex(childTxHex);
  const parentTxId = parentTx.getId();
  const anchorOutput = findP2AOutputData(parentTx);
  if (!anchorOutput)
    throw new Error('Expected exactly one P2A output in parent tx');

  const knownUtxoValueByOutpoint = new Map(
    reserveUtxosData.map(utxoData => {
      const output = utxoData.tx.outs[utxoData.vout];
      if (!output)
        throw new Error(
          'Cannot reconstruct CPFP fee info: missing known UTXO output'
        );
      return [`${utxoData.tx.getId()}:${utxoData.vout}`, output.value];
    })
  );
  const knownTxById = new Map(
    historyData.map(item => [item.tx.getId(), item.tx])
  );
  let childInputValue = BigInt(0);
  let spendsAnchor = false;

  // Sum every child input value; the parent P2A anchor is not in reserveUtxosData.
  for (const input of childTx.ins) {
    const prevTxId = toHex(Uint8Array.from(input.hash).reverse());
    if (prevTxId === parentTxId && input.index === anchorOutput.index) {
      spendsAnchor = true;
      childInputValue += BigInt(anchorOutput.value);
    } else {
      let inputValue = knownUtxoValueByOutpoint.get(
        `${prevTxId}:${input.index}`
      );
      if (inputValue === undefined) {
        const prevTx = knownTxById.get(prevTxId);
        const prevOutput = prevTx?.outs[input.index];
        if (prevOutput) inputValue = prevOutput.value;
      }
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
  reserveUtxosData,
  vaultableWalletUtxosData,
  coinControl,
  childOutput,
  historyData
}: {
  parentTxHex: TxHex;
  parentFee: number;
  /**
   * Previously broadcast CPFP child in the live package. Omit when the user only
   * broadcast the parent action tx and this acceleration adds the first child.
   */
  childTxHex?: TxHex;
  feeEstimates: FeeEstimates;
  /** Reserve UTXOs available for building the replacement child. */
  reserveUtxosData: UtxosData;
  /**
   * Normal wallet UTXOs that are already policy-filtered for this vault mode.
   * For P2A_TRUC they must be confirmed; for P2A_NON_TRUC they may include only
   * stable unconfirmed inputs allowed by wallet/vault policy. These are appended
   * only after reserve-only selection fails, so they do not weaken reserve-first
   * behavior.
   */
  vaultableWalletUtxosData?: UtxosData;
  /**
   * When true, `vaultableWalletUtxosData` is the exact manual normal-wallet
   * supplement selection for P2A child construction.
   */
  coinControl: boolean;
  childOutput: OutputInstance;
  /**
   * Needed for P2A replacements when the previous child used inputs that do not
   * belong to the reserve, such as normal-wallet supplement inputs in the trigger.
   */
  historyData: HistoryData;
}): number | null => {
  const { tx: parentTx } = transactionFromHex(parentTxHex);
  const currentChildFeeInfo = childTxHex
    ? getCpfpFeeInfo({
        parentTxHex,
        parentFee,
        childTxHex,
        reserveUtxosData,
        historyData
      })
    : null;
  const currentPackageFeeRate =
    currentChildFeeInfo?.packageFeeRate ?? parentFee / parentTx.virtualSize();

  const maxFeeRate = computeMaxAllowedFeeRate(feeEstimates);
  const minimumReplacementPackageFeeRate = Number(
    (currentPackageFeeRate + FEE_RATE_STEP).toFixed(2)
  );
  if (minimumReplacementPackageFeeRate > maxFeeRate)
    return minimumReplacementPackageFeeRate;

  for (
    let targetPackageFeeRate = minimumReplacementPackageFeeRate;
    targetPackageFeeRate <= maxFeeRate;
    targetPackageFeeRate = Number(
      (targetPackageFeeRate + FEE_RATE_STEP).toFixed(2)
    )
  ) {
    const walletSupplementUtxosData = coinSelectWalletSupplementUtxosData({
      parentTxHex,
      parentFee,
      targetPackageFeeRate,
      reserveUtxosData,
      ...(vaultableWalletUtxosData?.length ? { vaultableWalletUtxosData } : {}),
      coinControl,
      changeOutput: childOutput
    });
    if (walletSupplementUtxosData === 'cannotBuildPackage') continue;
    const packageEstimate = estimateCpfpPackage({
      parentTxHex,
      parentFee,
      targetPackageFeeRate,
      utxosData: [
        ...reserveUtxosData,
        ...(Array.isArray(walletSupplementUtxosData)
          ? walletSupplementUtxosData
          : [])
      ],
      changeOutput: childOutput
    });
    if (packageEstimate) {
      // If the previous package had no child, no replacement-child-fee rule applies.
      if (!currentChildFeeInfo) return targetPackageFeeRate;
      const minimumReplacementChildFee = getMinimumReplacementChildFee({
        previousChildFee: currentChildFeeInfo.childFee,
        replacementChildVSize: packageEstimate.childVSize,
        incrementalRelayFeeRate: INCREMENTAL_RELAY_FEE_RATE
      });
      if (packageEstimate.childFee >= minimumReplacementChildFee)
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
