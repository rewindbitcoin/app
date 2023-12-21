import { networks, Network } from 'bitcoinjs-lib';
export type NetworkId = 'BITCOIN' | 'TESTNET' | 'REGTEST';
export const networkMapping: { [key in NetworkId]: Network } = {
  BITCOIN: networks.bitcoin,
  TESTNET: networks.testnet,
  REGTEST: networks.regtest
};
export function getNetworkId(network: Network): NetworkId {
  for (const key in networkMapping) {
    if (network === networkMapping[key as NetworkId]) {
      return key as NetworkId;
    }
  }
  throw new Error('Unknown network');
}
