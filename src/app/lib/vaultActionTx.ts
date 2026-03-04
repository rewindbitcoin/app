// Copyright (C) 2026 Jose-Luis Landabaso - https://rewindbitcoin.com
// Licensed under the GNU GPL v3 or later. See the LICENSE file for details.

import { findLowestTrueBinarySearch } from '../../common/lib/binarySearch';
import { toHex } from 'uint8array-tools';
import { transactionFromHex } from './bitcoin';
import type { TxHex, TxId } from './vaults';

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
 * These are the only wallet-side inputs allowed for exact acceleration
 * replacement. The parent anchor input is always added separately.
 */
export const getReplacementNonAnchorTxos = ({
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
