// Copyright (C) 2026 Jose-Luis Landabaso - https://rewindbitcoin.com
// Licensed under the GNU GPL v3 or later. See the LICENSE file for details.

import { type Network } from 'bitcoinjs-lib';
import { toHex } from 'uint8array-tools';
import {
  keyExpressionBIP32,
  type OutputInstance
} from '@bitcoinerlab/descriptors';
import { dustThreshold, vsize } from '@bitcoinerlab/coinselect';
import { ensureDescriptorsFactoryInstance } from './descriptorsFactory';
import { MIN_FEE_RATE } from './fees';
import { getTriggerReservePath, parseVaultIndex } from './rewindPaths';
import { toBigInt, toNumber } from './sats';
import { transactionFromHex } from './bitcoin';
import { getMasterNode } from './vaultDescriptors';
import type { Signer } from './wallets';

// P2A input weight = base input (36 prevout + 1 scriptLen + 4 sequence) * 4
// plus segwit marker/flag (2) and witness (1 stack item count + 1 empty push)
// so weight = 41*4 + 2 + 2 = 166 wu => vsize = ceil(166/4) = 42 vB.
const P2A_INPUT_WEIGHT = 166;

export const estimateCpfpChildVSizeFromOutputs = (
  selectedOutputs: Array<OutputInstance>,
  changeOutput: OutputInstance
) => {
  const p2aInput = {
    isSegwit: () => true,
    inputWeight: () => P2A_INPUT_WEIGHT
  };
  return vsize(
    [p2aInput as unknown as OutputInstance, ...selectedOutputs],
    [changeOutput]
  );
};

/**
 * Returns the sats that must be funded into the next P2A bump reserve UTXO.
 *
 * This is the shared P2A bump reserve-sizing primitive for parent+child
 * packages. It is not trigger-specific; callers provide the parent/action data.
 */
export const getRequiredNextP2ABumpReserveUtxoValue = ({
  existingBumpReserveOutputsWithValue,
  nextBumpReserveOutput,
  changeOutput,
  parentAnchorValue,
  presignedParentVSize,
  presignedParentFeeRate,
  targetPackageFeeRate
}: {
  existingBumpReserveOutputsWithValue: Array<{
    output: OutputInstance;
    value: bigint;
  }>;
  nextBumpReserveOutput: OutputInstance;
  changeOutput: OutputInstance;
  /** Value of the P2A anchor output created by the parent being bumped. */
  parentAnchorValue: number;
  /** Virtual size of the already-presigned parent transaction. */
  presignedParentVSize: number;
  /** Fee rate already baked directly into the parent transaction. */
  presignedParentFeeRate: number;
  /** Package-feerate target that the full parent+child package should reach. */
  targetPackageFeeRate: number;
}) => {
  const childVSize = estimateCpfpChildVSizeFromOutputs(
    [
      ...existingBumpReserveOutputsWithValue.map(({ output }) => output),
      nextBumpReserveOutput
    ],
    changeOutput
  );
  const totalTargetFee = Math.ceil(
    targetPackageFeeRate * (presignedParentVSize + childVSize)
  );
  const parentFee = Math.ceil(presignedParentVSize * presignedParentFeeRate);
  const childFee = Math.max(
    Math.ceil(childVSize * MIN_FEE_RATE),
    totalTargetFee - parentFee
  );
  const childOutputMinValue = toNumber(dustThreshold(changeOutput)) + 1;
  const nextBumpReserveMinValue =
    toNumber(dustThreshold(nextBumpReserveOutput)) + 1;
  const existingBumpReserveValue = existingBumpReserveOutputsWithValue.reduce(
    (sum, { value }) => sum + toNumber(value),
    0
  );

  const nextBumpReserveValueNeeded =
    childFee +
    childOutputMinValue -
    parentAnchorValue -
    existingBumpReserveValue;
  if (nextBumpReserveValueNeeded <= 0) return BigInt(0);
  return toBigInt(
    Math.max(nextBumpReserveMinValue, nextBumpReserveValueNeeded)
  );
};

export const getTriggerReserveDescriptorForVaultIndex = ({
  signer,
  network,
  vaultIndex
}: {
  signer: Signer;
  network: Network;
  vaultIndex: number;
}) => {
  const mnemonic = signer?.mnemonic;
  if (!mnemonic)
    throw new Error(
      'Could not initialize the deterministic reserve derivation'
    );
  const masterNode = getMasterNode(mnemonic, network);
  const path = getTriggerReservePath(network, vaultIndex, '*');
  const lastSlashIndex = path.lastIndexOf('/');
  if (lastSlashIndex < 2) throw new Error(`Invalid path: ${path}`);
  return `wpkh(${keyExpressionBIP32({
    masterNode,
    originPath: path.slice(1, lastSlashIndex),
    keyPath: path.slice(lastSlashIndex)
  })})`;
};

export const getTriggerReserveDescriptor = ({
  vault,
  signer,
  network
}: {
  vault: { vaultPath: string };
  signer: Signer;
  network: Network;
}) =>
  getTriggerReserveDescriptorForVaultIndex({
    signer,
    network,
    vaultIndex: parseVaultIndex(vault.vaultPath)
  });

/**
 * Returns a dedicated per-vault trigger reserve output.
 *
 * The vault tx funds the first child at `/0`. Later top-ups use subsequent
 * children on the same per-vault branch and are discovered as one reserve set.
 */
export const getTriggerReserveOutput = ({
  descriptor,
  network,
  addressIndex
}: {
  descriptor: string;
  network: Network;
  addressIndex: number;
}) => {
  const { Output } = ensureDescriptorsFactoryInstance();
  return new Output({
    descriptor,
    index: addressIndex,
    network
  });
};

export const findTriggerReserveVout = ({
  vaultTxHex,
  descriptor,
  network,
  addressIndex
}: {
  vaultTxHex: string;
  descriptor: string;
  network: Network;
  addressIndex: number;
}) => {
  const triggerReserveOutput = getTriggerReserveOutput({
    descriptor,
    network,
    addressIndex
  });
  const { tx: vaultTx } = transactionFromHex(vaultTxHex);
  return vaultTx.outs.findIndex(
    out => toHex(out.script) === toHex(triggerReserveOutput.getScriptPubKey())
  );
};
