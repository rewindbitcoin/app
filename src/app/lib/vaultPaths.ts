import type { Network } from 'bitcoinjs-lib';

import { coinTypeFromNetwork } from './network';

export const VAULT_PURPOSE = 1073;

export const getVaultOriginPath = (network: Network) =>
  `/${VAULT_PURPOSE}'/${coinTypeFromNetwork(network)}'/0'`;

export const getVaultPath = (network: Network, index: number) =>
  `m${getVaultOriginPath(network)}/${index}`;

export const getDataPath = (network: Network) =>
  `m/${VAULT_PURPOSE}'/${coinTypeFromNetwork(network)}'/1'/0`;
