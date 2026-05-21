// Copyright (C) 2025 Jose-Luis Landabaso - https://rewindbitcoin.com
// Licensed under the GNU GPL v3 or later. See the LICENSE file for details.

import moize from 'moize';
import { sha256 } from '@noble/hashes/sha2';
import type { Explorer } from '@bitcoinerlab/explorer';
import { Transaction } from 'bitcoinjs-lib';
import { compare, toHex } from 'uint8array-tools';
import { isP2AOutputScript } from './p2aPolicy';

export const transactionFromHex = moize(
  (txHex: string) => {
    const tx = Transaction.fromHex(txHex);
    const txId = tx.getId();
    return { tx, txId };
  },
  {
    maxSize: 1000
  }
);

/**
 * Returns whether `spendingTxHex` spends the exact `prevTxId:prevVout`
 * outpoint.
 *
 * This is the shared predicate used after a candidate spending transaction is
 * found by some discoverable script. For example, P2A fee-payer discovery first
 * finds a candidate through a unique reserve output, then validates that the
 * candidate also spends the parent transaction's P2A anchor.
 */
export const findVinByOutpoint = (
  spendingTxHex: string,
  prevTxId: string,
  prevVout: number
) => {
  const { tx } = transactionFromHex(spendingTxHex);
  return tx.ins.findIndex(
    input =>
      toHex(Uint8Array.from(input.hash).reverse()) === prevTxId &&
      input.index === prevVout
  );
};

export const txSpendsOutpoint = (
  spendingTxHex: string,
  prevTxId: string,
  prevVout: number
) => findVinByOutpoint(spendingTxHex, prevTxId, prevVout) >= 0;

export const findVoutByScript = (tx: Transaction, scriptPubKey: Uint8Array) =>
  tx.outs.findIndex(output => compare(output.script, scriptPubKey) === 0);

const txHexCache = new Map<string, string>();

export const fetchTxHex = async ({
  txId,
  explorer
}: {
  txId: string;
  explorer: Explorer;
}) => {
  const cachedTxHex = txHexCache.get(txId);
  if (cachedTxHex) return cachedTxHex;

  let fetchedTxHex: string;
  try {
    fetchedTxHex = await explorer.fetchTx(txId);
  } catch {
    return undefined;
  }
  const fetchedTxId = transactionFromHex(fetchedTxHex).txId;
  if (fetchedTxId !== txId)
    throw new Error(`Explorer returned tx ${fetchedTxId} for ${txId}`);
  txHexCache.set(txId, fetchedTxHex);
  return fetchedTxHex;
};

export const fetchTxFee = async ({
  txHex,
  explorer
}: {
  txHex: string;
  explorer: Explorer;
}) => {
  const { tx, txId } = transactionFromHex(txHex);
  txHexCache.set(txId, txHex);
  let inputValue = BigInt(0);
  for (const input of tx.ins) {
    const prevTxId = toHex(Uint8Array.from(input.hash).reverse());
    const prevTxHex = await fetchTxHex({
      txId: prevTxId,
      explorer
    });
    if (!prevTxHex) {
      throw new Error(`Previous tx ${prevTxId} is not available`);
    }
    const { tx: prevTx } = transactionFromHex(prevTxHex);
    const prevOutput = prevTx.outs[input.index];
    if (!prevOutput)
      throw new Error(
        `Could not find previous tx output ${prevTxId}:${input.index}`
      );
    inputValue += prevOutput.value;
  }
  const outputValue = tx.outs.reduce(
    (sum, output) => sum + output.value,
    BigInt(0)
  );
  return Number(inputValue - outputValue);
};

export type SpendingTxData = {
  txHex: string;
  irreversible: boolean;
  blockHeight: number;
};

const spendingTxCache = new Map<string, SpendingTxData>();

/**
 * Returns the transaction that spent a tx output, including mempool spends.
 * If the spend is in mempool, `blockHeight` is set to zero.
 * Irreversible results are cached because they cannot change.
 */
export async function fetchSpendingTx(
  txHex: string,
  vout: number,
  explorer: Explorer
): Promise<SpendingTxData | undefined> {
  const cacheKey = `${txHex}:${vout}`;
  const cachedResult = spendingTxCache.get(cacheKey);

  if (cachedResult && cachedResult.irreversible) return cachedResult;

  const { tx, txId } = transactionFromHex(txHex);
  const output = tx.outs[vout];
  if (!output) throw new Error('Invalid out');
  if (isP2AOutputScript(output.script))
    throw new Error(
      `fetchSpendingTx must not scan P2A output ${txId}:${vout}; P2A uses a shared global script, so this will scan unrelated P2A history and will require checking thousands of transactions.`
    );
  const scriptHashBytes = Uint8Array.from(sha256(output.script)).reverse();
  const scriptHash = toHex(scriptHashBytes);

  // During mempool replacements, fetchTxHistory and fetchTx can briefly become
  // inconsistent: history can include txids that were just evicted.
  const MAX_HISTORY_SCAN_ATTEMPTS = 3;
  const RETRY_DELAY_MS = 250;
  for (let attempt = 0; attempt < MAX_HISTORY_SCAN_ATTEMPTS; attempt++) {
    let hadFetchTxError = false;
    const history = await explorer.fetchTxHistory({ scriptHash });

    for (let i = 0; i < history.length; i++) {
      const txData = history[i];
      if (!txData) throw new Error('Invalid history');
      let historyTxHex: string;
      try {
        historyTxHex = await explorer.fetchTx(txData.txId);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        hadFetchTxError = true;
        console.warn(
          `[fetchSpendingTx] Attempt ${attempt + 1}/${MAX_HISTORY_SCAN_ATTEMPTS}: fetchTx failed for history txid ${txData.txId} on outpoint ${txId}:${vout}; refetching history: ${message}`
        );
        break;
      }
      if (txSpendsOutpoint(historyTxHex, txId, vout)) {
        const spendingTx = {
          txHex: historyTxHex,
          irreversible: txData.irreversible,
          blockHeight: txData.blockHeight
        };
        spendingTxCache.set(cacheKey, spendingTx);
        return spendingTx;
      }
    }

    if (!hadFetchTxError) return;
    else if (attempt < MAX_HISTORY_SCAN_ATTEMPTS - 1)
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
  }
  throw new Error(
    `Failed to resolve spending tx for outpoint ${txId}:${vout} after ${MAX_HISTORY_SCAN_ATTEMPTS} attempts due to repeated fetchTx errors.`
  );
}
