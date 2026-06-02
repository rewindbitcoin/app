// Copyright (C) 2026 Jose-Luis Landabaso - https://rewindbitcoin.com
// Licensed under the GNU GPL v3 or later. See the LICENSE file for details.

import { transactionFromHex } from './bitcoin';
import { getWalletLabelText, type WalletLabels } from './labels';
import type { Vault } from './vaults';

const VAULT_NOUN_PREFIX_RE = /^(?:vault|boveda|b\u00f3veda)\s+/i;

/**
 * Returns the BIP-329 `output` reference used as this vault's name anchor.
 *
 * BIP-329 has no dedicated `vault` label type, so Rewind names a vault by
 * labeling the locked vault output itself. Vault creation keeps that locked
 * output at `vout 0`, making `<vault txid>:0` the stable label target.
 */
export const getVaultOutputRef = (vault: Vault): string => {
  const { txId } = transactionFromHex(vault.vaultTxHex);
  // Vault creation enforces the locked vault output as vout 0.
  return `${txId}:0`;
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
