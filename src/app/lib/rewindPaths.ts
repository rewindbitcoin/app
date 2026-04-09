import type { Network } from 'bitcoinjs-lib';

import { coinTypeFromNetwork } from './network';

export const VAULT_PURPOSE = 1073;

/**
 * Returns the hardened origin path used for deterministic Rewind vault ids.
 *
 * Children under this branch are indexed one-per-vault. The child public key at
 * each derived path identifies the vault and also keys its per-vault backup
 * material.
 */
export const getVaultOriginPath = (network: Network) =>
  `/${VAULT_PURPOSE}'/${coinTypeFromNetwork(network)}'/0'`;

/**
 * Returns the full deterministic path for a specific vault index.
 */
export const getVaultPath = (network: Network, index: number) =>
  `m${getVaultOriginPath(network)}/${index}`;

/**
 * Returns the wallet-level path used to derive the app-data encryption key.
 *
 * Rewind signs the fixed message `"Satoshi Nakamoto"` with the private key at
 * this path and hashes the signature to obtain a deterministic cipher key.
 *
 * This is intentionally a single wallet-wide key path, not a per-vault path,
 * because it protects wallet storage rather than one specific vault.
 */
export const getWalletDataKeyPath = (network: Network) =>
  `m/${VAULT_PURPOSE}'/${coinTypeFromNetwork(network)}'/1'/0`;

/**
 * Returns the deterministic path for the trigger fee-bump reserve of a vault.
 *
 * This is the funded reserve UTXO created in the vault tx itself. Replacements
 * keep spending this same outpoint while the fee-bump child is still only in
 * the mempool.
 */
export const getTriggerReserveInputPath = (
  network: Network,
  vaultIndex: number
) => `m/${VAULT_PURPOSE}'/${coinTypeFromNetwork(network)}'/2'/${vaultIndex}/0`;

/**
 * Returns the deterministic path for the trigger fee-bump child output of a
 * vault.
 *
 * This is not a normal hot-wallet change path. It is the dedicated per-vault
 * rollover output that receives any value left after paying the trigger CPFP
 * child fee.
 */
export const getTriggerReserveChangePath = (
  network: Network,
  vaultIndex: number
) => `m/${VAULT_PURPOSE}'/${coinTypeFromNetwork(network)}'/2'/${vaultIndex}/1`;

/** Returns the non-hardened vault index encoded in a deterministic vault path. */
export const parseVaultIndex = (vaultPath: string) => {
  const pathParts = vaultPath.split('/');
  const index = Number(pathParts[pathParts.length - 1]);
  if (!Number.isInteger(index) || index < 0)
    throw new Error(`Invalid vaultPath index: ${vaultPath}`);
  return index;
};
