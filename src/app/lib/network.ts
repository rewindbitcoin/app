import { networks, type Network } from 'bitcoinjs-lib';
export type NetworkId = 'BITCOIN' | 'TESTNET' | 'REGTEST' | 'TAPE';
export const networkMapping: { [key in NetworkId]: Network } = {
  BITCOIN: networks.bitcoin,
  TESTNET: networks.testnet,
  REGTEST: networks.regtest,
  TAPE: networks.regtest
};
