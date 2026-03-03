// Copyright (C) 2025 Jose-Luis Landabaso - https://rewindbitcoin.com
// Licensed under the GNU GPL v3 or later. See the LICENSE file for details.

import { networks, type Network } from 'bitcoinjs-lib';
export type NetworkId = 'BITCOIN' | 'TESTNET' | 'REGTEST' | 'TAPE';
export const networkMapping: { [key in NetworkId]: Network } = {
  BITCOIN: networks.bitcoin,
  TESTNET: networks.testnet,
  REGTEST: networks.regtest,
  TAPE: networks.regtest
};

export function isBitcoinMainnet(network: Network): boolean {
  return (
    network.bech32 === networks.bitcoin.bech32 &&
    network.bip32.public === networks.bitcoin.bip32.public &&
    network.bip32.private === networks.bitcoin.bip32.private &&
    network.pubKeyHash === networks.bitcoin.pubKeyHash &&
    network.scriptHash === networks.bitcoin.scriptHash &&
    network.wif === networks.bitcoin.wif
  );
}

export function coinTypeFromNetwork(network: Network): 0 | 1 {
  return isBitcoinMainnet(network) ? 0 : 1;
}
