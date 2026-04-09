//FIXME: review this produced code
import { dustThreshold } from '@bitcoinerlab/coinselect';
import {
  keyExpressionBIP32,
  signers,
  type OutputInstance
} from '@bitcoinerlab/descriptors';
import { payments, Psbt, type Network } from 'bitcoinjs-lib';
import { concat, fromUtf8, toHex } from 'uint8array-tools';
import { encode as encodeVarInt, encodingLength } from 'varuint-bitcoin';

import { getManagedChacha } from '../../common/lib/cipher';
import { transactionFromHex } from './bitcoin';
import { getSeedDerivedCipherKey } from './backup';
import { ensureDescriptorsFactoryInstance } from './descriptorsFactory';
import { networkMapping } from './network';
import { maxBigInt } from './sats';
import { OP_RETURN_BACKUP_TX_VBYTES } from './vaultSizes';
import { getMasterNode } from './vaultDescriptors';
import { getVaultOriginPath, getVaultPath, parseVaultIndex } from './rewindPaths';
import type { Signer } from './wallets';
import type { TxHex, Vault } from './vaults';

const REW_MAGIC = fromUtf8('REW');
const BACKUP_ENTRY_VERSION = 1;

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

export const getOnChainBackupDescriptor = async ({
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

export const getMinBackupFeeBudget = (
  effectiveFeeRate: number,
  backupOutput: OutputInstance
): bigint =>
  maxBigInt(
    BigInt(
      Math.ceil(Math.max(...OP_RETURN_BACKUP_TX_VBYTES) * effectiveFeeRate)
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
    descriptor: await getOnChainBackupDescriptor({
      signer,
      network,
      index: vaultIndex
    }),
    network
  });

  //FIXME: tjere is already a helper for this
  const backupScript = backupOutput.getScriptPubKey();
  const backupVout = vaultTx.outs.findIndex(
    out => toHex(out.script) === toHex(backupScript)
  );
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
