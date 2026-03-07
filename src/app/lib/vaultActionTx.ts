// Copyright (C) 2026 Jose-Luis Landabaso - https://rewindbitcoin.com
// Licensed under the GNU GPL v3 or later. See the LICENSE file for details.

import { findLowestTrueBinarySearch } from '../../common/lib/binarySearch';
import { toHex } from 'uint8array-tools';
import { transactionFromHex } from './bitcoin';
import type { HistoryData, TxHex, TxId, UtxosData } from './vaults';

// Default Bitcoin Core incremental relay fee is 100 sat/kvB = 0.1 sat/vB.
// Replacements must not only beat the previous fee, they must also add at
// least this much extra absolute fee or nodes reject them.
export const INCREMENTAL_RELAY_FEE_RATE = 0.1;

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

  /** Txid of parentTxHex (same parent tx). */
  parentTxId: TxId;

  /** Virtual size of the parent tx only. */
  parentTxVSize: number;

  /**
   * Miner fee of the parent tx only.
   * - Legacy: this is also the effective fee.
   * - Rewind2: effective fee may include CPFP child fee too.
   */
  parentTxFee: number;

  /**
   * Effective fee used by selection/submission.
   * - Legacy: parent-only fee
   * - Rewind2: parent + CPFP child package fee
   */
  effectiveFee: number;

  /**
   * Effective fee rate used by selection/submission.
   * - Legacy: parent-only feerate
   * - Rewind2: parent + CPFP child package feerate
   */
  effectiveFeeRate: number;
};

/**
 * Finds the next tx data with equal-or-larger effective fee rate.
 *
 * `sortedTxs` must be sorted ascending by `effectiveFeeRate`.
 */
export const findNextEqualOrLargerEffectiveFeeRate = <
  T extends { effectiveFeeRate: number }
>(
  sortedTxs: Array<T>,
  feeRate: number
): T | null => {
  const result = findLowestTrueBinarySearch(
    sortedTxs.length - 1,
    index => sortedTxs[index]!.effectiveFeeRate >= feeRate,
    100
  );
  if (result.value !== undefined) return sortedTxs[result.value]!;
  return null;
};

/**
 * Returns the exact non-anchor inputs used by the previous child tx in
 * outpoint format (`txid:vout`).
 *
 * During replacement, these previous non-anchor inputs are mandatory. Extra
 * wallet inputs may still be added later, but only if they are confirmed and
 * strictly needed to keep the replacement valid.
 */
const getReplacementNonAnchorTxos = ({
  parentTxHex,
  previousChildTxHex,
  anchorOutputIndex = 1
}: {
  parentTxHex: TxHex;
  previousChildTxHex: TxHex;
  anchorOutputIndex?: number;
}): Array<string> => {
  const { tx: parentTx } = transactionFromHex(parentTxHex);
  const parentTxId = parentTx.getId();
  const { tx: previousChildTx } = transactionFromHex(previousChildTxHex);

  const txos = new Set<string>();
  for (const input of previousChildTx.ins) {
    const prevTxId = toHex(Uint8Array.from(input.hash).reverse());
    const prevOutpoint = `${prevTxId}:${input.index}`;
    const isAnchorInput =
      prevTxId === parentTxId && input.index === anchorOutputIndex;
    if (!isAnchorInput) txos.add(prevOutpoint);
  }
  return Array.from(txos);
};

/**
 * For replacements, keep all previous non-anchor inputs mandatory and only
 * allow additional confirmed wallet UTXOs if the mandatory set alone cannot
 * satisfy fee/dust/TRUC constraints.
 *
 * This keeps replacement selection simple and, importantly, avoids relying on
 * outputs created by the tx being replaced. Those outputs may disappear after
 * the replacement wins and should never be treated as reusable funding here.
 */
export const getReplacementUtxosData = ({
  parentTxHex,
  previousChildTxHex,
  utxosData,
  historyData,
  getUtxosDataFromTxos
}: {
  parentTxHex: TxHex;
  previousChildTxHex: TxHex;
  utxosData: UtxosData;
  historyData: HistoryData;
  getUtxosDataFromTxos: (txos: Array<string>) => UtxosData;
}):
  | {
      mandatoryUtxosData: UtxosData;
      optionalUtxosData: UtxosData;
    }
  | undefined => {
  const mandatoryTxos = getReplacementNonAnchorTxos({
    parentTxHex,
    previousChildTxHex
  });
  const mandatoryUtxosData = getUtxosDataFromTxos(mandatoryTxos);
  if (mandatoryUtxosData.length !== mandatoryTxos.length) return;

  const mandatoryTxoSet = new Set(mandatoryTxos);
  const confirmedTxIds = new Set(
    historyData.filter(item => item.blockHeight > 0).map(item => item.txId)
  );
  const optionalUtxosData = utxosData.filter(utxoData => {
    const txId = utxoData.tx.getId();
    return (
      confirmedTxIds.has(txId) &&
      !mandatoryTxoSet.has(`${utxoData.tx.getId()}:${utxoData.vout}`)
    );
  });

  return {
    mandatoryUtxosData,
    optionalUtxosData
  };
};

/**
 * Reconstructs the previous CPFP child fee from wallet history.
 *
 * We need the exact old child fee because replacement policy checks absolute
 * fee deltas too. A higher effective fee rate alone is not enough. Example:
 * an old child paying 584 sats can still beat a new child paying 562 sats even
 * if the new package feerate is higher.
 */
export const getPreviousCpfpChildData = ({
  parentTxHex,
  parentFee,
  previousChildTxHex,
  historyData,
  anchorOutputIndex = 1
}: {
  parentTxHex: TxHex;
  parentFee: number;
  previousChildTxHex: TxHex;
  historyData: HistoryData;
  anchorOutputIndex?: number;
}):
  | {
      childFee: number;
      childVSize: number;
      effectiveFeeRate: number;
    }
  | undefined => {
  const { tx: parentTx } = transactionFromHex(parentTxHex);
  const { tx: previousChildTx } = transactionFromHex(previousChildTxHex);
  const parentTxId = parentTx.getId();
  const anchorOutput = parentTx.outs[anchorOutputIndex];
  if (!anchorOutput) return;

  const txById = new Map(historyData.map(item => [item.txId, item.tx]));
  let childInputValue = BigInt(0);

  for (const input of previousChildTx.ins) {
    const prevTxId = toHex(Uint8Array.from(input.hash).reverse());
    if (prevTxId === parentTxId && input.index === anchorOutputIndex) {
      childInputValue += anchorOutput.value;
      continue;
    }
    const prevTx = txById.get(prevTxId);
    const prevOut = prevTx?.outs[input.index];
    if (!prevOut) return;
    childInputValue += prevOut.value;
  }

  const childOutputValue = previousChildTx.outs.reduce(
    (sum, output) => sum + output.value,
    BigInt(0)
  );
  if (childInputValue <= childOutputValue) return;

  const childFee = Number(childInputValue - childOutputValue);
  const childVSize = previousChildTx.virtualSize();
  return {
    childFee,
    childVSize,
    effectiveFeeRate:
      (parentFee + childFee) / (parentTx.virtualSize() + childVSize)
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
