import type { Network } from 'bitcoinjs-lib';

import { coinTypeFromNetwork } from './network';

export const VAULT_PURPOSE = 1073;
const TRIGGER_RESERVE_BRANCH = 0;
const PANIC_RESERVE_BRANCH = 1;

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
 * Returns the hardened origin path used for deterministic per-vault action
 * reserve outputs.
 *
 * Children below this branch are grouped by vault index:
 * - `/<vaultIndex>/0`: trigger reserve
 * - `/<vaultIndex>/1`: panic/rescue reserve
 */
export const getVaultActionReserveOriginPath = (network: Network) =>
  `/${VAULT_PURPOSE}'/${coinTypeFromNetwork(network)}'/2'`;

/**
 * Returns the deterministic path for the trigger fee-bump reserve of a vault.
 *
 * This is the output reserved to fund the first CPFP child attached to the
 * trigger transaction for the specified vault index.
 */
export const getTriggerReservePath = (network: Network, vaultIndex: number) =>
  `m${getVaultActionReserveOriginPath(network)}/${vaultIndex}/${TRIGGER_RESERVE_BRANCH}`;

/**
 * Returns the deterministic path for the panic/rescue fee-bump reserve of a
 * vault.
 *
 * This is the output reserved to fund the first CPFP child attached to the
 * panic transaction for the specified vault index.
 */
export const getPanicReservePath = (network: Network, vaultIndex: number) =>
  `m${getVaultActionReserveOriginPath(network)}/${vaultIndex}/${PANIC_RESERVE_BRANCH}`;
