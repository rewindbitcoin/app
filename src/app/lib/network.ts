import { networks, Network } from 'bitcoinjs-lib';
export type NetworkId = 'BITCOIN' | 'TESTNET' | 'REGTEST' | 'STORM';
export const networkMapping: { [key in NetworkId]: Network } = {
  BITCOIN: networks.bitcoin,
  TESTNET: networks.testnet,
  REGTEST: networks.regtest,
  STORM: networks.regtest
};
