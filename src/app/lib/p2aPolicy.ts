// Copyright (C) 2026 Jose-Luis Landabaso - https://rewindbitcoin.com
// Licensed under the GNU GPL v3 or later. See the LICENSE file for details.

import { type Transaction } from 'bitcoinjs-lib';
import { fromHex, toHex } from 'uint8array-tools';
import { toNumber } from './sats';

export const P2A_OUTPUT_SCRIPT = fromHex('51024e73');
export const P2A_OUTPUT_SCRIPT_HEX = toHex(P2A_OUTPUT_SCRIPT);
export const MAX_P2A_TRUC_CHILD_VSIZE = 1000; // P2A_TRUC v3 child size limit (vbytes)
export const P2A_DUST_THRESHOLD = BigInt(240); // Core default dust relay: (13 + 67) * 3 sat/vB.
// Core treats value == dust threshold as non-dust, but the app normally funds
// spendable outputs at dust+1, so use the same convention for NON_TRUC anchors.
export const P2A_NON_TRUC_ANCHOR_VALUE = P2A_DUST_THRESHOLD + BigInt(1);

// TRUC trigger parents are zero-fee and use the 0-sat ephemeral-dust anchor;
// NON_TRUC trigger parents pay a direct relay fee, so their anchor is non-dust.
export const getTriggerAnchorValue = (
  vaultMode: 'P2A_TRUC' | 'P2A_NON_TRUC'
) => (vaultMode === 'P2A_TRUC' ? BigInt(0) : P2A_NON_TRUC_ANCHOR_VALUE);

// Rescue parents pay a non-zero presigned fee, so their P2A anchors must be
// non-dust even when the rescue transaction itself uses version 3/TRUC.
export const getRescueAnchorValue = () => P2A_NON_TRUC_ANCHOR_VALUE;

/**
 * Finds the unique P2A output index/value in a transaction.
 *
 * Returns `undefined` when the tx has no P2A output.
 * Throws when the tx has more than one P2A output.
 */
export const findP2AOutputData = (
  tx: Transaction
): { index: number; value: number } | undefined => {
  const matchingOutputs = tx.outs
    .map((output, index) => ({ output, index }))
    .filter(({ output }) => toHex(output.script) === P2A_OUTPUT_SCRIPT_HEX);
  if (matchingOutputs.length === 0) return;
  if (matchingOutputs.length > 1)
    throw new Error('Expected exactly one P2A output');
  const firstMatch = matchingOutputs[0];
  if (!firstMatch) return;
  const { output, index } = firstMatch;
  if (!output) return;
  return { index, value: toNumber(output.value) };
};

/**
 * Verifies the standard-relay policy constraints that depend on the final P2A
 * parent transaction shape.
 *
 * Bitcoin Core allows an ephemeral dust output, such as a 0-sat P2A anchor,
 * only when the transaction that creates it is zero-fee. The incentive must
 * come from the child that spends that dust output in the same package.
 *
 * Rewind also uses the vault mode as a structural contract:
 * - `P2A_TRUC` parents are version 3.
 * - `P2A_NON_TRUC` parents are version 2 and must use a non-dust anchor.
 *
 * This check is intentionally run after signing/extraction, using the actual tx
 * and actual fee that would be broadcast, so it applies equally to trigger and
 * rescue parents.
 */
export const assertP2AParentPolicy = ({
  tx,
  fee,
  txName,
  vaultMode
}: {
  tx: Transaction;
  fee: number;
  txName: string;
  vaultMode: 'P2A_TRUC' | 'P2A_NON_TRUC';
}) => {
  const expectedVersion = vaultMode === 'P2A_TRUC' ? 3 : 2;
  if (tx.version !== expectedVersion)
    throw new Error(
      `${txName} version ${tx.version} does not match ${vaultMode} expected version ${expectedVersion}`
    );

  const anchor = findP2AOutputData(tx);
  if (!anchor) throw new Error(`${txName} must include exactly one P2A anchor`);

  const hasDustAnchor = BigInt(anchor.value) < P2A_DUST_THRESHOLD;
  if (vaultMode === 'P2A_NON_TRUC' && hasDustAnchor)
    throw new Error(`${txName} P2A_NON_TRUC anchor must be non-dust`);

  if (fee !== 0 && hasDustAnchor)
    throw new Error(
      `${txName} has a dust P2A output and non-zero fee; tx with dust output must be 0-fee`
    );
};
