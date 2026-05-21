//FIXME: review this produced code
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
  type Network,
  type Transaction
} from 'bitcoinjs-lib';
import { compare, concat, fromUtf8, toHex } from 'uint8array-tools';
import {
  decode as decodeVarInt,
  encode as encodeVarInt,
  encodingLength
} from 'varuint-bitcoin';
import type { DiscoveryInstance } from '@bitcoinerlab/discovery';
import type { Explorer } from '@bitcoinerlab/explorer';

import { getManagedChacha } from '../../../common/lib/cipher';
import {
  findVoutByScript,
  fetchTxFee,
  transactionFromHex,
  txSpendsOutpoint
} from '../bitcoin';
import { getSeedDerivedCipherKey } from './shared';
import { ensureDescriptorsFactoryInstance } from '../descriptorsFactory';
import { networkMapping, type NetworkId } from '../network';
import { isP2AOutputScript } from '../p2aPolicy';
import { maxBigInt } from '../sats';
import { OP_RETURN_BACKUP_TX_VBYTES } from '../vaultSizes';
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
import type { Signer } from '../wallets';
import type { TxHex, Vault, Vaults } from '../vaults';
import { getVaultIdentity } from './vaultIdentity';

const REW_MAGIC = fromUtf8('REW');
const BACKUP_ENTRY_VERSION = 1;

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

const decodeVaultEntry = (serialized: Uint8Array) => {
  let offset = 0;
  const version = serialized[offset];
  if (version !== BACKUP_ENTRY_VERSION)
    throw new Error('Unsupported on-chain backup entry version');
  offset += 1;

  const triggerTxLenInfo = decodeVarInt(serialized, offset);
  const triggerTxLength = triggerTxLenInfo.numberValue;
  if (triggerTxLength === null) throw new Error('Invalid trigger tx length');
  offset += triggerTxLenInfo.bytes;
  const triggerTx = serialized.subarray(offset, offset + triggerTxLength);
  if (triggerTx.length !== triggerTxLength)
    throw new Error('Truncated trigger tx');
  offset += triggerTxLength;

  const panicTxLenInfo = decodeVarInt(serialized, offset);
  const panicTxLength = panicTxLenInfo.numberValue;
  if (panicTxLength === null) throw new Error('Invalid panic tx length');
  offset += panicTxLenInfo.bytes;
  const panicTx = serialized.subarray(offset, offset + panicTxLength);
  if (panicTx.length !== panicTxLength) throw new Error('Truncated panic tx');
  offset += panicTxLength;

  if (offset !== serialized.length)
    throw new Error('Invalid backup entry length');
  return {
    triggerTxHex: toHex(triggerTx),
    panicTxHex: toHex(panicTx)
  };
};

const extractOpReturnPayload = (backupTxHex: TxHex) => {
  const { tx } = transactionFromHex(backupTxHex);
  for (const output of tx.outs) {
    try {
      const payload = payments.embed({ output: output.script }).data?.[0];
      if (
        payload &&
        compare(payload.subarray(0, REW_MAGIC.length), REW_MAGIC) === 0
      )
        return payload;
    } catch {}
  }
  return undefined;
};

const decryptVaultEntry = async ({
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
  if (compare(payload.subarray(0, REW_MAGIC.length), REW_MAGIC) !== 0)
    throw new Error('Backup payload missing REW header');
  const cipherKey = await getSeedDerivedCipherKey({
    vaultPath: getVaultPath(network, vaultIndex),
    signer,
    network
  });
  const cipher = await getManagedChacha(cipherKey);
  return decodeVaultEntry(cipher.decrypt(payload.subarray(REW_MAGIC.length)));
};

/**
 * Extracts the data needed to rebuild the trigger descriptor from the witness
 * script revealed by the panic transaction.
 *
 * The script is produced by `createTriggerDescriptor(...)` as a miniscript
 * `wsh(andor(pk(unvault),older(lockBlocks),pkh(panic)))`. We only extract the
 * CSV timelock and panic pubkey hash here; the caller later rebuilds the full
 * descriptor and verifies its script pubkey matches the trigger tx output.
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

  let panicPubKeyHash: Uint8Array | undefined;
  for (let index = 0; index < chunks.length; index++) {
    const chunk = chunks[index];
    if (
      chunk instanceof Uint8Array &&
      chunk.length === 20 &&
      chunks[index - 1] === opcodes.OP_HASH160 &&
      chunks[index + 1] === opcodes.OP_EQUALVERIFY
    ) {
      if (panicPubKeyHash)
        throw new Error('Found multiple panic pubkey hashes');
      panicPubKeyHash = chunk;
    }
  }
  if (!panicPubKeyHash) throw new Error('Could not find panic pubkey hash');
  return {
    lockBlocks: decodeScriptNumber(lockBlocksChunk),
    panicPubKeyHash
  };
};

const getPanicPubKeyExpression = ({
  panicWitness,
  panicPubKeyHash
}: {
  panicWitness: Array<Uint8Array>;
  panicPubKeyHash: Uint8Array;
}) => {
  const panicPubKey = panicWitness.find(
    witnessItem =>
      script.isCanonicalPubKey(witnessItem) &&
      compare(bitcoinCrypto.hash160(witnessItem), panicPubKeyHash) === 0
  );
  if (!panicPubKey) throw new Error('Could not find panic pubkey');
  return toHex(panicPubKey);
};

const getTriggerWitnessScript = (panicWitness: Array<Uint8Array>) => {
  const witnessScript = panicWitness?.[panicWitness.length - 1];
  if (!witnessScript) throw new Error('Trigger witness script not found');
  return witnessScript;
};

const getSingleInputSpendingTx = ({
  tx,
  prevTxId,
  txName
}: {
  tx: Transaction;
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

const encodeVarIntNumber = (value: number) => {
  const bytes = new Uint8Array(encodingLength(value));
  encodeVarInt(value, bytes);
  return bytes;
};

const serializeVaultEntry = ({
  triggerTx,
  panicTx
}: {
  triggerTx: Uint8Array;
  panicTx: Uint8Array;
}) =>
  concat([
    Uint8Array.of(BACKUP_ENTRY_VERSION),
    encodeVarIntNumber(triggerTx.length),
    triggerTx,
    encodeVarIntNumber(panicTx.length),
    panicTx
  ]);

const buildEncryptedVaultContent = async ({
  signer,
  network,
  vaultIndex,
  triggerTx,
  panicTx
}: {
  signer: Signer;
  network: Network;
  vaultIndex: number;
  triggerTx: Uint8Array;
  panicTx: Uint8Array;
}) => {
  const cipherKey = await getSeedDerivedCipherKey({
    vaultPath: getVaultPath(network, vaultIndex),
    signer,
    network
  });
  const cipher = await getManagedChacha(cipherKey);
  return concat([
    REW_MAGIC,
    cipher.encrypt(serializeVaultEntry({ triggerTx, panicTx }))
  ]);
};

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
  const triggerEntries = Object.entries(vault.triggerMap);
  if (triggerEntries.length !== 1)
    throw new Error('On-chain backup expects exactly one trigger tx');
  const [triggerTxHex, panicTxHexs] = triggerEntries[0] ?? [];
  if (!triggerTxHex || !panicTxHexs?.length)
    throw new Error('Could not determine trigger/panic txs for backup');
  if (panicTxHexs.length !== 1)
    throw new Error('On-chain backup expects exactly one panic tx');
  const panicTxHex = panicTxHexs[0];
  if (!panicTxHex) throw new Error('Could not determine panic tx for backup');
  const { tx: triggerTx } = transactionFromHex(triggerTxHex);
  const { tx: panicTx } = transactionFromHex(panicTxHex);

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

  const content = await buildEncryptedVaultContent({
    signer,
    network,
    vaultIndex,
    triggerTx: triggerTx.toBuffer(),
    panicTx: panicTx.toBuffer()
  });
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

  return backupTx.toHex();
};

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
  const { Output, parseKeyExpression } = ensureDescriptorsFactoryInstance();
  const network = networkMapping[networkId];
  const { vaultId, vaultPath } = getVaultIdentity({
    signer,
    networkId,
    index: vaultIndex
  });
  const { tx: vaultTx, txId: vaultTxId } = transactionFromHex(vaultTxHex);
  const payload = extractOpReturnPayload(backupTxHex);
  if (!payload) throw new Error('On-chain backup content not found');

  const { triggerTxHex, panicTxHex } = await decryptVaultEntry({
    payload,
    signer,
    network,
    vaultIndex
  });
  const { tx: triggerTx, txId: triggerTxId } = transactionFromHex(triggerTxHex);
  const { tx: panicTx, txId: panicTxId } = transactionFromHex(panicTxHex);
  const triggerInput = getSingleInputSpendingTx({
    tx: triggerTx,
    prevTxId: vaultTxId,
    txName: 'Trigger tx'
  });
  const panicInput = getSingleInputSpendingTx({
    tx: panicTx,
    prevTxId: triggerTxId,
    txName: 'Panic tx'
  });

  const vaultOutput = vaultTx.outs[triggerInput.vout];
  if (!vaultOutput) throw new Error('Vault output not found');
  const triggerOutput = triggerTx.outs[panicInput.vout];
  if (!triggerOutput) throw new Error('Trigger output not found');
  const coldOutputCandidates = panicTx.outs.filter(
    output => !isP2AOutputScript(output.script)
  );
  if (coldOutputCandidates.length !== 1)
    throw new Error('Could not determine cold output');
  const coldOutput = coldOutputCandidates[0];
  if (!coldOutput) throw new Error('Cold output not found');
  const panicWitness = panicTx.ins[panicInput.vin]?.witness;
  if (!panicWitness?.length) throw new Error('Panic tx witness not found');

  const unvaultKeyExpression = await createUnvaultKeyExpression({
    signer,
    network
  });
  const { pubkey: unvaultPubKey } = parseKeyExpression({
    keyExpression: unvaultKeyExpression,
    network
  });
  if (!unvaultPubKey) throw new Error('Could not extract unvault pubkey');

  const witnessScript = getTriggerWitnessScript(panicWitness);
  const { lockBlocks, panicPubKeyHash } =
    parseTriggerWitnessScript(witnessScript);
  const panicKeyExpression = getPanicPubKeyExpression({
    panicWitness,
    panicPubKeyHash
  });
  const triggerDescriptor = createTriggerDescriptor({
    unvaultKeyExpression,
    panicKeyExpression,
    lockBlocks
  });
  const triggerDescriptorOutput = new Output({
    descriptor: triggerDescriptor,
    network,
    signersPubKeys: [unvaultPubKey]
  });
  if (
    compare(triggerDescriptorOutput.getScriptPubKey(), triggerOutput.script) !==
    0
  )
    throw new Error('Restored trigger descriptor does not match trigger tx');

  const vaultFee = await fetchTxFee({ txHex: vaultTxHex, explorer });
  const triggerFee = await fetchTxFee({ txHex: triggerTxHex, explorer });
  const panicFee = await fetchTxFee({ txHex: panicTxHex, explorer });
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
    coldAddress: address.fromOutputScript(coldOutput.script, network),
    lockBlocks,
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
      [panicTxHex]: {
        txId: panicTxId,
        fee: panicFee,
        feeRate: panicFee / panicTx.virtualSize()
      }
    },
    triggerMap: { [triggerTxHex]: [panicTxHex] },
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
