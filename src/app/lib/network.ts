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
