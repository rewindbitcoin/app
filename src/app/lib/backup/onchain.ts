import { dustThreshold } from '@bitcoinerlab/coinselect';
import {
  keyExpressionBIP32,
  signers,
  type OutputInstance
} from '@bitcoinerlab/descriptors';
import {
  address,
  crypto as bitcoinCrypto,
  opcodes,
  payments,
  Psbt,
  script,
  Transaction,
  type Network,
  type Transaction as BitcoinTransaction
} from 'bitcoinjs-lib';
import { xchacha20 } from '@noble/ciphers/chacha';
import {
  compare,
  concat,
  readUInt16,
  toHex,
  writeUInt16,
  writeUInt32
} from 'uint8array-tools';
import type { DiscoveryInstance } from '@bitcoinerlab/discovery';
import type { Explorer } from '@bitcoinerlab/explorer';
import * as secp256k1 from '@bitcoinerlab/secp256k1';

import {
  findVoutByScript,
  fetchTxFee,
  RBF_SEQUENCE,
  transactionFromHex,
  txSpendsOutpoint
} from '../bitcoin';
import { getSeedDerivedCipherKey } from './shared';
import {
  COMPRESSED_PUBLIC_KEY_BYTES,
  getOnChainBackupEntryBytes,
  getOnChainBackupPayloadBytes,
  LOCK_BLOCKS_BYTES,
  ONCHAIN_BACKUP_ENTRY_VERSION_BYTES,
  ONCHAIN_BACKUP_ENTRY_VERSION,
  ONCHAIN_BACKUP_MAGIC,
  ONCHAIN_BACKUP_NONCE_BYTES,
  ONCHAIN_BACKUP_SIGNATURE_BYTES,
  PUBLIC_KEY_HASH_BYTES
} from './onchainFormat';
import { ensureDescriptorsFactoryInstance } from '../descriptorsFactory';
import { networkMapping, type NetworkId } from '../network';
import {
  findP2AOutputData,
  getRescueAnchorValue,
  getTriggerAnchorValue,
  isP2AOutputScript,
  P2A_OUTPUT_SCRIPT
} from '../p2aPolicy';
import { maxBigInt } from '../sats';
import { OP_RETURN_BACKUP_TX_VBYTES } from '../vaultSizes';
import {
  getPresignedRescueParentFee,
  getPresignedTriggerParentFee,
  P2A_NON_TRUC_PRESIGNED_TRIGGER_FEERATE,
  P2A_TRUC_PRESIGNED_TRIGGER_FEERATE,
  PRESIGNED_RESCUE_FEERATE
} from '../vaultFees';
import {
  createTriggerDescriptor,
  createUnvaultKeyExpression,
  getMasterNode
} from '../vaultDescriptors';
import {
  getVaultOriginPath,
  getVaultPath,
  parseVaultIndex
} from '../rewindPaths';
import {
  createEmergencyOutputScript,
  EMERGENCY_OUTPUT_TYPE_BYTES,
  getEmergencyOutputDataBytes,
  getEmergencyOutputDataFromScript,
  getEmergencyOutputTypeFromId,
  getEmergencyOutputTypeId,
  type EmergencyOutputData
} from '../emergencyOutputs';
import type { Signer } from '../wallets';
import type { TxHex, Vault, Vaults } from '../vaults';
import { getVaultIdentity } from './vaultIdentity';

// Constants and types.

const BACKUP_SIGHASH_TYPE = Transaction.SIGHASH_ALL;
export const ONCHAIN_BACKUP_PRE_BROADCAST_ERROR_PREFIX =
  'ONCHAIN_BACKUP_PRE_BROADCAST_ERROR:';

type OnChainBackupEntry = {
  lockBlocks: number;
  ephemeralPubKey: Uint8Array;
  emergencyOutput: EmergencyOutputData;
  triggerSignature: Uint8Array;
  rescueSignature: Uint8Array;
};

type OnChainBackupVaultMode = 'P2A_TRUC' | 'P2A_NON_TRUC';

// Backup entry codec.

const readFixedBytes = ({
  serialized,
  offset,
  length,
  label
}: {
  serialized: Uint8Array;
  offset: number;
  length: number;
  label: string;
}) => {
  const bytes = serialized.subarray(offset, offset + length);
  if (bytes.length !== length) throw new Error(`Truncated ${label}`);
  return bytes;
};

/**
 * Turns a backup entry into the bytes that will be encrypted and stored in the
 * backup transaction's OP_RETURN output.
 */
const serializeOnChainBackupEntry = ({
  lockBlocks,
  ephemeralPubKey,
  emergencyOutput,
  triggerSignature,
  rescueSignature
}: OnChainBackupEntry) => {
  if (!script.isCanonicalPubKey(ephemeralPubKey))
    throw new Error('Invalid ephemeral public key');
  const emergencyOutputDataBytes = getEmergencyOutputDataBytes(
    emergencyOutput.type
  );
  if (emergencyOutput.data.length !== emergencyOutputDataBytes)
    throw new Error('Invalid emergency output data');
  if (triggerSignature.length !== ONCHAIN_BACKUP_SIGNATURE_BYTES)
    throw new Error('Invalid trigger signature');
  if (rescueSignature.length !== ONCHAIN_BACKUP_SIGNATURE_BYTES)
    throw new Error('Invalid rescue signature');
  if (!Number.isInteger(lockBlocks) || lockBlocks < 0 || lockBlocks > 0xffff)
    throw new Error(`Invalid lockBlocks value ${lockBlocks}`);

  const entryBytes = getOnChainBackupEntryBytes(emergencyOutput.type);
  const serialized = new Uint8Array(entryBytes);
  let offset = 0;
  serialized[offset] = ONCHAIN_BACKUP_ENTRY_VERSION;
  offset += ONCHAIN_BACKUP_ENTRY_VERSION_BYTES;
  serialized[offset] = getEmergencyOutputTypeId(emergencyOutput.type);
  offset += EMERGENCY_OUTPUT_TYPE_BYTES;
  writeUInt16(serialized, offset, lockBlocks, 'BE');
  offset += LOCK_BLOCKS_BYTES;
  serialized.set(ephemeralPubKey, offset);
  offset += COMPRESSED_PUBLIC_KEY_BYTES;
  serialized.set(emergencyOutput.data, offset);
  offset += emergencyOutputDataBytes;
  serialized.set(triggerSignature, offset);
  offset += ONCHAIN_BACKUP_SIGNATURE_BYTES;
  serialized.set(rescueSignature, offset);
  offset += ONCHAIN_BACKUP_SIGNATURE_BYTES;
  if (offset !== entryBytes)
    throw new Error('Invalid on-chain backup entry size');
  return serialized;
};

/**
 * Reads decrypted backup entry bytes and returns the fields needed to rebuild
 * the trigger and rescue transactions.
 */
const decodeOnChainBackupEntry = (
  serialized: Uint8Array
): OnChainBackupEntry => {
  let offset = 0;
  const version = serialized[offset];
  if (version !== ONCHAIN_BACKUP_ENTRY_VERSION)
    throw new Error('Unsupported on-chain backup entry version');
  offset += ONCHAIN_BACKUP_ENTRY_VERSION_BYTES;

  const emergencyOutputTypeId = serialized[offset];
  if (emergencyOutputTypeId === undefined)
    throw new Error('Truncated emergency output type');
  const emergencyOutputType = getEmergencyOutputTypeFromId(
    emergencyOutputTypeId
  );
  offset += EMERGENCY_OUTPUT_TYPE_BYTES;
  const entryBytes = getOnChainBackupEntryBytes(emergencyOutputType);
  if (serialized.length !== entryBytes)
    throw new Error('Invalid on-chain backup entry length');

  const lockBlocks = readUInt16(serialized, offset, 'BE');
  offset += LOCK_BLOCKS_BYTES;
  const ephemeralPubKey = readFixedBytes({
    serialized,
    offset,
    length: COMPRESSED_PUBLIC_KEY_BYTES,
    label: 'ephemeral public key'
  });
  offset += COMPRESSED_PUBLIC_KEY_BYTES;
  const emergencyOutputDataBytes =
    getEmergencyOutputDataBytes(emergencyOutputType);
  const emergencyOutputData = readFixedBytes({
    serialized,
    offset,
    length: emergencyOutputDataBytes,
    label: 'emergency output data'
  });
  offset += emergencyOutputDataBytes;
  const triggerSignature = readFixedBytes({
    serialized,
    offset,
    length: ONCHAIN_BACKUP_SIGNATURE_BYTES,
    label: 'trigger signature'
  });
  offset += ONCHAIN_BACKUP_SIGNATURE_BYTES;
  const rescueSignature = readFixedBytes({
    serialized,
    offset,
    length: ONCHAIN_BACKUP_SIGNATURE_BYTES,
    label: 'rescue signature'
  });
  offset += ONCHAIN_BACKUP_SIGNATURE_BYTES;
  if (offset !== serialized.length)
    throw new Error('Invalid on-chain backup entry length');
  if (!script.isCanonicalPubKey(ephemeralPubKey))
    throw new Error('Invalid ephemeral public key');

  return {
    lockBlocks,
    ephemeralPubKey,
    emergencyOutput: {
      type: emergencyOutputType,
      data: emergencyOutputData
    },
    triggerSignature,
    rescueSignature
  };
};

// Backup payload encryption.

/**
 * Finds the REW OP_RETURN payload inside a backup transaction.
 */
const extractOpReturnPayload = (backupTxHex: TxHex) => {
  const { tx } = transactionFromHex(backupTxHex);
  let rewPayload: Uint8Array | undefined;
  for (const output of tx.outs) {
    let payload: Uint8Array | undefined;
    try {
      payload = payments.embed({ output: output.script }).data?.[0];
    } catch {}
    if (
      payload &&
      compare(
        payload.subarray(0, ONCHAIN_BACKUP_MAGIC.length),
        ONCHAIN_BACKUP_MAGIC
      ) === 0
    ) {
      if (rewPayload) throw new Error('Found multiple REW backup payloads');
      rewPayload = payload;
    }
  }
  return rewPayload;
};

/**
 * Builds the deterministic encryption nonce for one vault index.
 */
const getBackupCipherNonce = (vaultIndex: number) => {
  const nonce = new Uint8Array(ONCHAIN_BACKUP_NONCE_BYTES);
  writeUInt32(nonce, ONCHAIN_BACKUP_NONCE_BYTES - 4, vaultIndex, 'BE');
  return nonce;
};

/**
 * Checks the REW header, derives the vault backup key, and decrypts one backup
 * entry for the given vault index.
 */
const decryptOnChainBackupEntry = async ({
  payload,
  signer,
  network,
  vaultIndex
}: {
  payload: Uint8Array;
  signer: Signer;
  network: Network;
  vaultIndex: number;
}) => {
  if (
    compare(
      payload.subarray(0, ONCHAIN_BACKUP_MAGIC.length),
      ONCHAIN_BACKUP_MAGIC
    ) !== 0
  )
    throw new Error('Backup payload missing REW header');
  const cipherKey = await getSeedDerivedCipherKey({
    vaultPath: getVaultPath(network, vaultIndex),
    signer,
    network
  });
  const nonce = getBackupCipherNonce(vaultIndex);
  return decodeOnChainBackupEntry(
    xchacha20(cipherKey, nonce, payload.subarray(ONCHAIN_BACKUP_MAGIC.length))
  );
};

// Transaction helpers.

const decodeScriptNumber = (chunk: number | Uint8Array) => {
  let value: number;
  if (chunk instanceof Uint8Array) value = script.number.decode(chunk, 5);
  else if (chunk === opcodes.OP_0) value = 0;
  else if (chunk >= opcodes.OP_1 && chunk <= opcodes.OP_16)
    value = chunk - (opcodes.OP_1 - 1);
  else throw new Error('Unexpected script number');

  if (value < 0) throw new Error('Negative timelock not supported');
  return value;
};

const encodeWitnessSignature = (signature: Uint8Array) =>
  script.signature.encode(signature, BACKUP_SIGHASH_TYPE);

const decodeWitnessSignature = (signatureWithHashType: Uint8Array) => {
  const { signature, hashType } = script.signature.decode(
    signatureWithHashType
  );
  if (hashType !== BACKUP_SIGHASH_TYPE)
    throw new Error('Unexpected backup signature hash type');
  if (signature.length !== ONCHAIN_BACKUP_SIGNATURE_BYTES)
    throw new Error('Unexpected backup signature length');
  return signature;
};

/**
 * Reads the trigger witness script and pulls out the CSV lock and rescue key
 * hash needed to rebuild the trigger descriptor.
 */
const parseTriggerWitnessScript = (witnessScript: Uint8Array) => {
  const chunks = script.decompile(witnessScript);
  if (!chunks) throw new Error('Could not parse trigger witness script');

  let csvIndex: number | undefined;
  for (let index = 0; index < chunks.length; index++) {
    if (chunks[index] !== opcodes.OP_CHECKSEQUENCEVERIFY) continue;
    if (csvIndex !== undefined)
      throw new Error('Found multiple trigger timelocks');
    csvIndex = index;
  }
  if (csvIndex === undefined)
    throw new Error('Could not find trigger timelock');
  const lockBlocksChunk = chunks[csvIndex - 1];
  if (csvIndex < 1 || lockBlocksChunk === undefined)
    throw new Error('Could not find trigger timelock');

  let rescuePubKeyHash: Uint8Array | undefined;
  for (let index = 0; index < chunks.length; index++) {
    const chunk = chunks[index];
    if (
      chunk instanceof Uint8Array &&
      chunk.length === 20 &&
      chunks[index - 1] === opcodes.OP_HASH160 &&
      chunks[index + 1] === opcodes.OP_EQUALVERIFY
    ) {
      if (rescuePubKeyHash)
        throw new Error('Found multiple rescue pubkey hashes');
      rescuePubKeyHash = chunk;
    }
  }
  if (!rescuePubKeyHash) throw new Error('Could not find rescue pubkey hash');
  return {
    lockBlocks: decodeScriptNumber(lockBlocksChunk),
    rescuePubKeyHash
  };
};

const getSingleInputSpendingTx = ({
  tx,
  prevTxId,
  txName
}: {
  tx: BitcoinTransaction;
  prevTxId: string;
  txName: string;
}) => {
  const matchingInputs = tx.ins
    .map((input, vin) => ({ input, vin }))
    .filter(
      ({ input }) => toHex(Uint8Array.from(input.hash).reverse()) === prevTxId
    );
  if (matchingInputs.length !== 1)
    throw new Error(
      `${txName} should spend exactly one output from ${prevTxId}`
    );
  const match = matchingInputs[0];
  if (!match) throw new Error(`${txName} input not found`);
  return { vin: match.vin, vout: match.input.index };
};

const getOnlyNonP2AOutput = (tx: BitcoinTransaction, txName: string) => {
  const outputCandidates = tx.outs.filter(
    output => !isP2AOutputScript(output.script)
  );
  if (outputCandidates.length !== 1)
    throw new Error(`Could not determine ${txName} non-anchor output`);
  const output = outputCandidates[0];
  if (!output) throw new Error(`${txName} non-anchor output not found`);
  return output;
};

const assertValidSignature = ({
  signature,
  pubkey,
  hash,
  label
}: {
  signature: Uint8Array;
  pubkey: Uint8Array;
  hash: Uint8Array;
  label: string;
}) => {
  if (!secp256k1.verify(hash, pubkey, signature, true))
    throw new Error(`${label} signature does not verify`);
};

// Transaction reconstruction.

/**
 * Rebuilds the trigger and rescue transactions from a backup entry and vault
 * transaction, then verifies the stored signatures against those transactions.
 */
const reconstructPresignedTxsFromOnChainBackup = async ({
  entry,
  signer,
  networkId,
  vaultMode,
  vaultTxHex
}: {
  entry: OnChainBackupEntry;
  signer: Signer;
  networkId: NetworkId;
  vaultMode: OnChainBackupVaultMode;
  vaultTxHex: TxHex;
}) => {
  const { Output } = ensureDescriptorsFactoryInstance();
  const network = networkMapping[networkId];
  const { tx: vaultTx, txId: vaultTxId } = transactionFromHex(vaultTxHex);
  const vaultOutputScript = payments.p2wpkh({
    pubkey: entry.ephemeralPubKey,
    network
  }).output;
  if (!vaultOutputScript) throw new Error('Could not build vault output');
  const vaultVout = findVoutByScript(vaultTx, vaultOutputScript);
  if (vaultVout < 0) throw new Error('Vault output not found');
  const vaultOutput = vaultTx.outs[vaultVout];
  if (!vaultOutput) throw new Error('Vault output not found');

  const unvaultKeyExpression = await createUnvaultKeyExpression({
    signer,
    network
  });
  const triggerDescriptor = createTriggerDescriptor({
    unvaultKeyExpression,
    panicKeyExpression: toHex(entry.ephemeralPubKey),
    lockBlocks: entry.lockBlocks
  });
  const triggerDescriptorOutput = new Output({
    descriptor: triggerDescriptor,
    network,
    signersPubKeys: [entry.ephemeralPubKey]
  });
  const triggerOutputScript = triggerDescriptorOutput.getScriptPubKey();
  const witnessScript = triggerDescriptorOutput.getWitnessScript();
  if (!witnessScript) throw new Error('Trigger witness script not found');

  const emergencyOutputScript = createEmergencyOutputScript(
    entry.emergencyOutput
  );
  const triggerSigningScript = payments.p2pkh({
    hash: bitcoinCrypto.hash160(entry.ephemeralPubKey),
    network
  }).output;
  if (!triggerSigningScript)
    throw new Error('Could not build trigger signing script');
  const rescueAnchorValue = getRescueAnchorValue();
  const rescueFee = getPresignedRescueParentFee(PRESIGNED_RESCUE_FEERATE);
  const rescueSequence = RBF_SEQUENCE;

  const triggerAnchorValue = getTriggerAnchorValue(vaultMode);
  // These fee constants are part of on-chain backup entry version 0. If vault
  // fee policy changes, add a new backup version instead of changing this path.
  const triggerFee = getPresignedTriggerParentFee(
    vaultMode === 'P2A_TRUC'
      ? P2A_TRUC_PRESIGNED_TRIGGER_FEERATE
      : P2A_NON_TRUC_PRESIGNED_TRIGGER_FEERATE
  );
  const triggerOutputValue =
    vaultOutput.value - triggerAnchorValue - triggerFee;
  if (triggerOutputValue <= BigInt(0))
    throw new Error('Invalid trigger output value');

  const triggerTx = new Transaction();
  triggerTx.version = vaultMode === 'P2A_TRUC' ? 3 : 2;
  triggerTx.addInput(vaultTx.getHash(), vaultVout, RBF_SEQUENCE);
  triggerTx.addOutput(triggerOutputScript, triggerOutputValue);
  triggerTx.addOutput(P2A_OUTPUT_SCRIPT, triggerAnchorValue);
  assertValidSignature({
    signature: entry.triggerSignature,
    pubkey: entry.ephemeralPubKey,
    hash: triggerTx.hashForWitnessV0(
      0,
      triggerSigningScript,
      vaultOutput.value,
      BACKUP_SIGHASH_TYPE
    ),
    label: 'Trigger'
  });
  triggerTx.setWitness(0, [
    encodeWitnessSignature(entry.triggerSignature),
    entry.ephemeralPubKey
  ]);

  const rescueOutputValue = triggerOutputValue - rescueAnchorValue - rescueFee;
  if (rescueOutputValue <= BigInt(0))
    throw new Error('Invalid rescue output value');

  const rescueTx = new Transaction();
  rescueTx.version = vaultMode === 'P2A_TRUC' ? 3 : 2;
  rescueTx.addInput(triggerTx.getHash(), 0, rescueSequence);
  rescueTx.addOutput(emergencyOutputScript, rescueOutputValue);
  rescueTx.addOutput(P2A_OUTPUT_SCRIPT, rescueAnchorValue);
  const rescueSignatureWithHashType = encodeWitnessSignature(
    entry.rescueSignature
  );
  assertValidSignature({
    signature: entry.rescueSignature,
    pubkey: entry.ephemeralPubKey,
    hash: rescueTx.hashForWitnessV0(
      0,
      witnessScript,
      triggerOutputValue,
      BACKUP_SIGHASH_TYPE
    ),
    label: 'Rescue'
  });
  const { scriptSatisfaction, nSequence } =
    triggerDescriptorOutput.getScriptSatisfaction([
      {
        pubkey: entry.ephemeralPubKey,
        signature: rescueSignatureWithHashType
      }
    ]);
  if (nSequence !== undefined && nSequence !== rescueSequence)
    throw new Error('Unexpected rescue sequence');
  rescueTx.setWitness(0, [
    ...script.toStack(scriptSatisfaction),
    witnessScript
  ]);

  return {
    vaultOutput,
    triggerTx,
    rescueTx,
    triggerDescriptor,
    triggerDescriptorOutput,
    unvaultKeyExpression,
    triggerFee: Number(triggerFee),
    rescueFee: Number(rescueFee),
    vaultTxId
  };
};

// Backup creation.

const getOnChainBackupVaultModeFromTriggerTx = (
  triggerTx: BitcoinTransaction
): OnChainBackupVaultMode => {
  const anchor = findP2AOutputData(triggerTx);
  if (!anchor) throw new Error('On-chain backup expects a P2A trigger tx');
  if (triggerTx.version === 3 && anchor.value === 0) return 'P2A_TRUC';
  return 'P2A_NON_TRUC';
};

const getVaultPresignedTxDataForBackup = (vault: Vault) => {
  const triggerEntries = Object.entries(vault.triggerMap);
  if (triggerEntries.length !== 1)
    throw new Error('On-chain backup expects exactly one trigger tx');
  const [triggerTxHex, rescueTxHexs] = triggerEntries[0] ?? [];
  if (!triggerTxHex || !rescueTxHexs?.length)
    throw new Error('Could not determine trigger/rescue txs for backup');
  if (rescueTxHexs.length !== 1)
    throw new Error('On-chain backup expects exactly one rescue tx');
  const rescueTxHex = rescueTxHexs[0];
  if (!rescueTxHex) throw new Error('Could not determine rescue tx for backup');
  const { tx: triggerTx, txId: triggerTxId } = transactionFromHex(triggerTxHex);
  const { tx: rescueTx } = transactionFromHex(rescueTxHex);
  return {
    triggerTxHex,
    triggerTx,
    triggerTxId,
    rescueTxHex,
    rescueTx,
    vaultMode: getOnChainBackupVaultModeFromTriggerTx(triggerTx)
  };
};

/**
 * Extracts the small set of fields needed for the on-chain backup from the
 * already-created presigned trigger and rescue transactions.
 */
const extractOnChainBackupEntryFromPresignedTxs = async ({
  vault,
  signer
}: {
  vault: Vault;
  signer: Signer;
}): Promise<OnChainBackupEntry> => {
  const network = networkMapping[vault.networkId];
  const { tx: vaultTx, txId: vaultTxId } = transactionFromHex(vault.vaultTxHex);
  const {
    triggerTxHex,
    triggerTx,
    triggerTxId,
    rescueTxHex,
    rescueTx,
    vaultMode
  } = getVaultPresignedTxDataForBackup(vault);
  const triggerInput = getSingleInputSpendingTx({
    tx: triggerTx,
    prevTxId: vaultTxId,
    txName: 'Trigger tx'
  });
  const rescueInput = getSingleInputSpendingTx({
    tx: rescueTx,
    prevTxId: triggerTxId,
    txName: 'Rescue tx'
  });

  const vaultOutput = vaultTx.outs[triggerInput.vout];
  if (!vaultOutput) throw new Error('Vault output not found');
  if (!triggerTx.outs[rescueInput.vout])
    throw new Error('Trigger output not found');
  const rescueRecipientOutput = getOnlyNonP2AOutput(rescueTx, 'rescue tx');
  const triggerWitness = triggerTx.ins[triggerInput.vin]?.witness;
  if (triggerWitness?.length !== 2)
    throw new Error('Trigger tx witness should have signature and pubkey');
  const triggerSignatureWithHashType = triggerWitness[0];
  const ephemeralPubKey = triggerWitness[1];
  if (!triggerSignatureWithHashType || !ephemeralPubKey)
    throw new Error('Trigger tx witness is incomplete');
  if (!script.isCanonicalPubKey(ephemeralPubKey))
    throw new Error('Invalid trigger public key');
  const vaultP2WPKH = payments.p2wpkh({
    output: vaultOutput.script,
    network
  });
  if (!vaultP2WPKH.hash || vaultP2WPKH.hash.length !== PUBLIC_KEY_HASH_BYTES)
    throw new Error('Vault must be P2WPKH');
  const vaultPubKeyHash = vaultP2WPKH.hash;
  if (compare(bitcoinCrypto.hash160(ephemeralPubKey), vaultPubKeyHash) !== 0)
    throw new Error('Trigger public key does not match vault output');

  const rescueWitness = rescueTx.ins[rescueInput.vin]?.witness;
  if (!rescueWitness?.length) throw new Error('Rescue tx witness not found');
  const witnessScript = rescueWitness[rescueWitness.length - 1];
  if (!witnessScript) throw new Error('Trigger witness script not found');
  const { lockBlocks, rescuePubKeyHash } =
    parseTriggerWitnessScript(witnessScript);
  if (lockBlocks !== vault.lockBlocks)
    throw new Error('Backup lockBlocks do not match vault');
  const rescuePubKey = rescueWitness.find(
    witnessItem =>
      script.isCanonicalPubKey(witnessItem) &&
      compare(bitcoinCrypto.hash160(witnessItem), rescuePubKeyHash) === 0
  );
  if (!rescuePubKey) throw new Error('Could not find rescue pubkey');
  if (compare(rescuePubKey, ephemeralPubKey) !== 0)
    throw new Error('Rescue public key does not match trigger public key');
  const emergencyOutput = getEmergencyOutputDataFromScript(
    rescueRecipientOutput.script
  );
  const rescueSignatureWithHashType = rescueWitness.find(witnessItem =>
    script.isCanonicalScriptSignature(witnessItem)
  );
  if (!rescueSignatureWithHashType)
    throw new Error('Rescue signature not found');
  const entry = {
    lockBlocks,
    ephemeralPubKey,
    emergencyOutput,
    triggerSignature: decodeWitnessSignature(triggerSignatureWithHashType),
    rescueSignature: decodeWitnessSignature(rescueSignatureWithHashType)
  };
  const reconstructed = await reconstructPresignedTxsFromOnChainBackup({
    entry,
    signer,
    networkId: vault.networkId,
    vaultMode,
    vaultTxHex: vault.vaultTxHex
  });
  if (reconstructed.triggerTx.toHex() !== triggerTxHex)
    throw new Error('On-chain backup cannot reproduce trigger tx');
  if (reconstructed.rescueTx.toHex() !== rescueTxHex)
    throw new Error('On-chain backup cannot reproduce rescue tx');
  return entry;
};

/**
 * Builds the deterministic wallet descriptor used for backup outputs. A fixed
 * index is used for one vault; `*` is used when scanning during restore.
 */
export const getOnChainBackupDescriptor = ({
  signer,
  network,
  index
}: {
  signer: Signer;
  network: Network;
  index: number | '*';
}) => {
  const mnemonic = signer?.mnemonic;
  if (!mnemonic)
    throw new Error('Could not initialize the on-chain backup descriptor');
  const masterNode = getMasterNode(mnemonic, network);
  const keyPath = index === '*' ? '/*' : `/${index}`;
  const keyExpression = keyExpressionBIP32({
    masterNode,
    originPath: getVaultOriginPath(network),
    keyPath
  });
  return `wpkh(${keyExpression})`;
};

/**
 * Returns the smallest amount that can be funded into the vault tx's backup
 * output while still keeping that output above dust and able to pay for the
 * later backup tx at the selected backup tx fee rate.
 *
 * In the current backup model this funded amount later equals the backup tx
 * fee itself, because the backup tx only creates an OP_RETURN output and does
 * not send spendable value anywhere else.
 */
export const getBackupFunding = (
  backupTxFeeRate: number,
  backupOutput: OutputInstance
): bigint =>
  maxBigInt(
    BigInt(
      Math.ceil(Math.max(...OP_RETURN_BACKUP_TX_VBYTES) * backupTxFeeRate)
    ),
    dustThreshold(backupOutput) + BigInt(1)
  );

/**
 * Verifies that a backup transaction can recreate the exact trigger and rescue
 * transactions stored in the vault before anything is broadcast.
 */
const assertOnChainBackupReconstructsPresignedTxs = async ({
  vault,
  signer,
  backupTxHex
}: {
  vault: Vault;
  signer: Signer;
  backupTxHex: TxHex;
}) => {
  const vaultIndex = parseVaultIndex(vault.vaultPath);
  const network = networkMapping[vault.networkId];
  const payload = extractOpReturnPayload(backupTxHex);
  if (!payload) throw new Error('On-chain backup content not found');

  // This is the last cheap safety check before broadcast. If the encrypted
  // OP_RETURN cannot rebuild the exact presigned transactions now, it will not
  // save the user after the vault is already on-chain.
  const entry = await decryptOnChainBackupEntry({
    payload,
    signer,
    network,
    vaultIndex
  });
  const { triggerTxHex, rescueTxHex, vaultMode } =
    getVaultPresignedTxDataForBackup(vault);
  const reconstructed = await reconstructPresignedTxsFromOnChainBackup({
    entry,
    signer,
    networkId: vault.networkId,
    vaultMode,
    vaultTxHex: vault.vaultTxHex
  });
  if (reconstructed.triggerTx.toHex() !== triggerTxHex)
    throw new Error('On-chain backup sanity check failed for trigger tx');
  if (reconstructed.rescueTx.toHex() !== rescueTxHex)
    throw new Error('On-chain backup sanity check failed for rescue tx');
};

/**
 * Creates the signed backup transaction that spends the vault's backup output
 * and stores the encrypted REW backup payload in OP_RETURN.
 */
export const createOnChainBackupTx = async ({
  vault,
  signer
}: {
  vault: Vault;
  signer: Signer;
}): Promise<TxHex> => {
  const { Output } = ensureDescriptorsFactoryInstance();
  const network = networkMapping[vault.networkId];
  const vaultIndex = parseVaultIndex(vault.vaultPath);
  const { tx: vaultTx } = transactionFromHex(vault.vaultTxHex);
  const entry = await extractOnChainBackupEntryFromPresignedTxs({
    vault,
    signer
  });

  const backupOutput = new Output({
    descriptor: getOnChainBackupDescriptor({
      signer,
      network,
      index: vaultIndex
    }),
    network
  });

  const backupVout = findVoutByScript(vaultTx, backupOutput.getScriptPubKey());
  if (backupVout < 0) throw new Error('Backup output not found in vault tx');

  const psbtBackup = new Psbt({ network });
  if (vaultTx.version !== 2 && vaultTx.version !== 3)
    throw new Error(`Unexpected vault tx version ${vaultTx.version}`);
  psbtBackup.setVersion(vaultTx.version);

  const backupInputFinalizer = backupOutput.updatePsbtAsInput({
    psbt: psbtBackup,
    txHex: vault.vaultTxHex,
    vout: backupVout
  });

  const cipherKey = await getSeedDerivedCipherKey({
    vaultPath: getVaultPath(network, vaultIndex),
    signer,
    network
  });
  const content = concat([
    ONCHAIN_BACKUP_MAGIC,
    xchacha20(
      cipherKey,
      getBackupCipherNonce(vaultIndex),
      serializeOnChainBackupEntry(entry)
    )
  ]);
  if (
    content.length !== getOnChainBackupPayloadBytes(entry.emergencyOutput.type)
  )
    throw new Error('Invalid on-chain backup payload size');
  const embed = payments.embed({ data: [content] });
  if (!embed.output) throw new Error('Could not create backup OP_RETURN');
  psbtBackup.addOutput({ script: embed.output, value: BigInt(0) });

  const mnemonic = signer?.mnemonic;
  if (!mnemonic) throw new Error('Could not initialize signer for backup tx');
  signers.signBIP32({
    psbt: psbtBackup,
    masterNode: getMasterNode(mnemonic, network)
  });
  backupInputFinalizer({ psbt: psbtBackup });

  const backupTx = psbtBackup.extractTransaction();
  if (!OP_RETURN_BACKUP_TX_VBYTES.includes(backupTx.virtualSize()))
    throw new Error(`Unexpected backup vsize: ${backupTx.virtualSize()}`);

  const backupTxHex = backupTx.toHex();
  await assertOnChainBackupReconstructsPresignedTxs({
    vault,
    signer,
    backupTxHex
  });

  return backupTxHex;
};

// Restore scanning.

/**
 * Restores one vault from its vault transaction and matching backup transaction.
 */
const restoreVaultFromOnChainBackupTx = async ({
  signer,
  networkId,
  vaultIndex,
  vaultTxHex,
  backupTxHex,
  explorer,
  vaultTxBlockHeight
}: {
  signer: Signer;
  networkId: NetworkId;
  vaultIndex: number;
  vaultTxHex: TxHex;
  backupTxHex: TxHex;
  explorer: Explorer;
  vaultTxBlockHeight?: number | undefined;
}): Promise<Vault> => {
  const network = networkMapping[networkId];
  const { vaultId, vaultPath } = getVaultIdentity({
    signer,
    networkId,
    index: vaultIndex
  });
  const { tx: vaultTx } = transactionFromHex(vaultTxHex);
  let vaultMode: OnChainBackupVaultMode;
  // Restore has the vault tx and backup tx, but not the trigger tx yet. In the
  // current no-extra-byte format, vault tx version is the mode contract.
  if (vaultTx.version === 3) vaultMode = 'P2A_TRUC';
  else if (vaultTx.version === 2) vaultMode = 'P2A_NON_TRUC';
  else throw new Error(`Unexpected vault tx version ${vaultTx.version}`);
  const payload = extractOpReturnPayload(backupTxHex);
  if (!payload) throw new Error('On-chain backup content not found');

  const entry = await decryptOnChainBackupEntry({
    payload,
    signer,
    network,
    vaultIndex
  });
  const {
    vaultOutput,
    triggerTx,
    rescueTx,
    triggerDescriptor,
    triggerDescriptorOutput,
    unvaultKeyExpression,
    triggerFee,
    rescueFee,
    vaultTxId
  } = await reconstructPresignedTxsFromOnChainBackup({
    entry,
    signer,
    networkId,
    vaultMode,
    vaultTxHex
  });
  const triggerTxHex = triggerTx.toHex();
  const rescueTxHex = rescueTx.toHex();
  const triggerTxId = triggerTx.getId();
  const rescueTxId = rescueTx.getId();
  const rescueRecipientOutput = getOnlyNonP2AOutput(rescueTx, 'rescue tx');

  const vaultFee = await fetchTxFee({ txHex: vaultTxHex, explorer });
  const creationTime =
    vaultTxBlockHeight && vaultTxBlockHeight > 0
      ? (await explorer.fetchBlockStatus(vaultTxBlockHeight))?.blockTime ||
        Math.floor(Date.now() / 1000)
      : Math.floor(Date.now() / 1000);

  return {
    vaultId,
    vaultPath,
    vaultedAmount: Number(vaultOutput.value),
    vaultAddress: address.fromOutputScript(vaultOutput.script, network),
    triggerAddress: triggerDescriptorOutput.getAddress(),
    coldAddress: address.fromOutputScript(
      rescueRecipientOutput.script,
      network
    ),
    lockBlocks: entry.lockBlocks,
    vaultTxHex,
    txMap: {
      [vaultTxHex]: {
        txId: vaultTxId,
        fee: vaultFee,
        feeRate: vaultFee / vaultTx.virtualSize()
      },
      [triggerTxHex]: {
        txId: triggerTxId,
        fee: triggerFee,
        feeRate: triggerFee / triggerTx.virtualSize()
      },
      [rescueTxHex]: {
        txId: rescueTxId,
        fee: rescueFee,
        feeRate: rescueFee / rescueTx.virtualSize()
      }
    },
    triggerMap: { [triggerTxHex]: [rescueTxHex] },
    networkId,
    unvaultKey: unvaultKeyExpression,
    triggerDescriptor,
    creationTime
  };
};

/**
 * Fetches and attempts to restore one vault from one deterministic on-chain
 * backup index.
 *
 * `isIndexUsed` and `vault` are intentionally separate outcomes. A backup
 * descriptor can have blockchain history without containing a restorable Rewind
 * backup: the vault tx may have funded the backup output but the backup child
 * may be missing, someone may have sent unrelated funds to the deterministic
 * address, or the OP_RETURN payload may be absent, corrupt, unsupported or fail
 * validation. Such an index is still considered used, so recovery must continue
 * scanning later indexes instead of stopping at the first non-restorable one.
 */
const fetchOnChainVault = async ({
  discovery,
  signer,
  networkId,
  descriptor,
  index
}: {
  discovery: DiscoveryInstance;
  signer: Signer;
  networkId: NetworkId;
  descriptor: string;
  index: number;
}): Promise<{ isIndexUsed: boolean; vault?: Vault }> => {
  const descriptorWithIndex = { descriptor, index };
  await discovery.fetch(descriptorWithIndex);
  const history = discovery.getHistory(descriptorWithIndex) as Array<{
    blockHeight: number;
    txHex: TxHex;
  }>;
  if (!history.length) return { isIndexUsed: false };

  const explorer = discovery.getExplorer();

  const network = networkMapping[networkId];
  const { Output } = ensureDescriptorsFactoryInstance();
  const backupScript = new Output({
    descriptor,
    index,
    network
  }).getScriptPubKey();

  for (const candidateVaultTxData of history) {
    const { tx: candidateVaultTx, txId: candidateVaultTxId } =
      transactionFromHex(candidateVaultTxData.txHex);
    const backupVout = findVoutByScript(candidateVaultTx, backupScript);

    if (backupVout >= 0) {
      const backupTxHex = history.find(({ txHex }) =>
        txSpendsOutpoint(txHex, candidateVaultTxId, backupVout)
      )?.txHex;

      if (backupTxHex) {
        try {
          return {
            isIndexUsed: true,
            vault: await restoreVaultFromOnChainBackupTx({
              signer,
              networkId,
              vaultIndex: index,
              vaultTxHex: candidateVaultTxData.txHex,
              backupTxHex,
              explorer,
              vaultTxBlockHeight: candidateVaultTxData.blockHeight
            })
          };
        } catch (error) {
          console.warn(
            `Could not restore on-chain backup at index ${index}: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
    }
  }

  return { isIndexUsed: true };
};

/**
 * Scans deterministic backup indexes and returns every vault that can be
 * restored from on-chain backup transactions.
 */
export const fetchOnChainVaults = async ({
  discovery,
  signer,
  networkId,
  firstIndexToCheck = 0
}: {
  discovery: DiscoveryInstance;
  signer: Signer;
  networkId: NetworkId;
  firstIndexToCheck?: number;
}): Promise<Vaults> => {
  const network = networkMapping[networkId];
  const descriptor = getOnChainBackupDescriptor({
    signer,
    network,
    index: '*'
  });
  const restoredVaults: Vaults = {};

  let index = firstIndexToCheck;
  while (true) {
    const { isIndexUsed, vault } = await fetchOnChainVault({
      discovery,
      signer,
      networkId,
      descriptor,
      index
    });
    if (vault) restoredVaults[vault.vaultId] = vault;
    if (!isIndexUsed) break;
    index++;
  }

  return restoredVaults;
};
