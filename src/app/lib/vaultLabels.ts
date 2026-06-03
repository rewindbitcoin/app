// Copyright (C) 2026 Jose-Luis Landabaso - https://rewindbitcoin.com
// Licensed under the GNU GPL v3 or later. See the LICENSE file for details.

import { getOnChainBackupDescriptor } from './backup/onchain';
import { findVoutByScript, transactionFromHex } from './bitcoin';
import { ensureDescriptorsFactoryInstance } from './descriptorsFactory';
import { getWalletLabelText, type WalletLabels } from './labels';
import { networkMapping } from './network';
import {
  findTriggerReserveVout,
  getTriggerReserveDescriptor
} from './p2aReserve';
import { parseVaultIndex } from './rewindPaths';
import type { Vault } from './vaults';
import type { Signer } from './wallets';
import type { OutputInstance } from '@bitcoinerlab/descriptors';
import { toHex } from 'uint8array-tools';

const VAULT_NOUN_PREFIX_RE = /^(?:vault|boveda|b\u00f3veda)\s+/i;

const getVaultOutputVout = (vault: Vault): number => {
  const { tx: vaultTx, txId: vaultTxId } = transactionFromHex(vault.vaultTxHex);
  for (const triggerTxHex of Object.keys(vault.triggerMap)) {
    const { tx: triggerTx } = transactionFromHex(triggerTxHex);
    const vaultInput = triggerTx.ins.find(
      input => toHex(Uint8Array.from(input.hash).reverse()) === vaultTxId
    );
    if (!vaultInput) continue;
    if (!vaultTx.outs[vaultInput.index])
      throw new Error('Vault trigger input points to a missing vault output');
    return vaultInput.index;
  }
  throw new Error('Vault trigger transaction does not spend vault transaction');
};

/**
 * Returns the BIP-329 `output` reference used as this vault's name anchor.
 *
 * BIP-329 has no dedicated `vault` label type, so Rewind names a vault by
 * labeling the locked vault output itself. The output is found through the
 * presigned trigger tx input, so this does not depend on vault tx output order.
 */
export const getVaultOutputRef = (vault: Vault): string => {
  const { txId } = transactionFromHex(vault.vaultTxHex);
  return `${txId}:${getVaultOutputVout(vault)}`;
};

const getVaultTriggerReserveVout = ({
  vault,
  signer
}: {
  vault: Vault;
  signer: Signer;
}): number => {
  const network = networkMapping[vault.networkId];
  return findTriggerReserveVout({
    vaultTxHex: vault.vaultTxHex,
    descriptor: getTriggerReserveDescriptor({ vault, signer, network }),
    network,
    addressIndex: 0
  });
};

/**
 * Returns the BIP-329 `output` reference for the vault-created fee reserve.
 *
 * This is the dedicated UTXO Rewind funds during vault creation so a later
 * unfreeze can pay network fees. It should be labeled because other wallets
 * would otherwise show it as a normal receive/change output after export.
 */
export const getVaultTriggerReserveOutputRef = ({
  vault,
  signer
}: {
  vault: Vault;
  signer: Signer;
}): string | undefined => {
  const { txId } = transactionFromHex(vault.vaultTxHex);
  const triggerReserveVout = getVaultTriggerReserveVout({ vault, signer });
  if (triggerReserveVout < 0) return;
  return `${txId}:${triggerReserveVout}`;
};

/**
 * Returns the BIP-329 `output` reference for normal vault-creation change.
 *
 * The vault transaction can return leftover wallet funds to normal wallet
 * change. That output is not part of the vault security state, but labeling it
 * preserves useful source context. To avoid noisy or wrong labels, this returns
 * a ref only when exactly one non-vault/non-backup/non-reserve output remains.
 */
export const getVaultCreationChangeOutputRef = ({
  vault,
  signer
}: {
  vault: Vault;
  signer: Signer;
}): string | undefined => {
  const { Output } = ensureDescriptorsFactoryInstance();
  const network = networkMapping[vault.networkId];
  const { tx, txId } = transactionFromHex(vault.vaultTxHex);
  const excludedVouts = new Set<number>([getVaultOutputVout(vault)]);
  const backupOutput = new Output({
    descriptor: getOnChainBackupDescriptor({
      signer,
      network,
      index: parseVaultIndex(vault.vaultPath)
    }),
    network
  });
  const backupVout = findVoutByScript(tx, backupOutput.getScriptPubKey());
  if (backupVout < 0) return;
  excludedVouts.add(backupVout);

  const triggerReserveVout = getVaultTriggerReserveVout({ vault, signer });
  if (triggerReserveVout >= 0) excludedVouts.add(triggerReserveVout);

  const changeVouts = tx.outs
    .map((_, vout) => vout)
    .filter(vout => !excludedVouts.has(vout));
  if (changeVouts.length !== 1) return;
  return `${txId}:${changeVouts[0]}`;
};

export const getTriggerOutputRef = ({
  vault,
  txHex
}: {
  vault: Vault;
  txHex: string;
}): string | undefined => {
  const { Output } = ensureDescriptorsFactoryInstance();
  const network = networkMapping[vault.networkId];
  const output = new Output({
    descriptor: vault.triggerDescriptor,
    network
  });
  const { tx, txId } = transactionFromHex(txHex);
  const vout = findVoutByScript(tx, output.getScriptPubKey());
  if (vout < 0) return;
  return `${txId}:${vout}`;
};

export const getCpfpChangeOutputRef = ({
  txHex,
  changeOutput
}: {
  txHex: string;
  changeOutput: OutputInstance;
}): string | undefined => {
  const { tx, txId } = transactionFromHex(txHex);
  const changeVout = findVoutByScript(tx, changeOutput.getScriptPubKey());
  if (changeVout < 0) return;
  return `${txId}:${changeVout}`;
};

/**
 * Normalizes the text users type into the dedicated vault-name field.
 *
 * The stored label is only the name fragment (`1`, `Savings`, etc.). UI copy
 * adds the localized noun (`Vault`/`Bóveda`) where needed, so this removes that
 * noun if the user types it into the field anyway.
 */
export const normalizeVaultNameText = (name: string): string =>
  name.trim().replace(VAULT_NOUN_PREFIX_RE, '').trim();

/**
 * Resolves the user-facing vault name fragment from wallet labels.
 *
 * If the vault output has a BIP-329 label, that label is the source of truth.
 * Otherwise callers provide the generated fallback fragment, usually the vault
 * number. Callers then decide how to render it, such as `Vault {{vaultName}}`.
 */
export const getVaultName = ({
  vault,
  labels,
  defaultName
}: {
  vault: Vault;
  labels: WalletLabels | undefined;
  defaultName: string;
}): string =>
  getWalletLabelText(labels, 'output', getVaultOutputRef(vault)) || defaultName;
