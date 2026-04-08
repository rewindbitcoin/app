import type { Network } from 'bitcoinjs-lib';

import { coinTypeFromNetwork } from './network';

export const VAULT_PURPOSE = 1073;

/**
 * Returns the hardened origin path used for Rewind vault identities.
 *
 * Branch layout under purpose `1073'`:
 * - `/0'`: per-vault identities and backup material
 * - `/1'`: wallet-level data-encryption key material
 */
export const getVaultOriginPath = (network: Network) =>
  `/${VAULT_PURPOSE}'/${coinTypeFromNetwork(network)}'/0'`;

/**
 * Returns the full deterministic path for a specific vault index.
 *
 * The child public key at this path is used to derive the vault identifier and
 * to key per-vault backup material.
 */
export const getVaultPath = (network: Network, index: number) =>
  `m${getVaultOriginPath(network)}/${index}`;

/**
 * Returns the wallet-level path used to derive the app-data encryption key.
 *
 * Rewind signs the fixed message `"Satoshi Nakamoto"` with the private key at
 * this path and hashes the signature to obtain a deterministic cipher key.
 *
 * This is intentionally a single wallet-wide key path, not a per-vault path.
 */
export const getWalletDataKeyPath = (network: Network) =>
  `m/${VAULT_PURPOSE}'/${coinTypeFromNetwork(network)}'/1'/0`;
