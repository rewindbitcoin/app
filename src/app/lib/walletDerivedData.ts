import moize from 'moize';
import { NetworkId, networkMapping } from './network';
import { Vaults, getUtxosData as extractUtxosData } from '../lib/vaults';
import type { Descriptor } from '@bitcoinerlab/discovery/dist/types';
import type { Settings } from './settings';
import type { DiscoveryInstance } from '@bitcoinerlab/discovery';

export const getAPIs = moize(
  (networkId: NetworkId | undefined, settings: Settings | undefined) => {
    const mainnetEsploraApi = settings?.MAINNET_ESPLORA_API;
    const mainnetElectrumApi = settings?.MAINNET_ELECTRUM_API;
    let esploraAPI: string | undefined;
    let electrumAPI: string | undefined;
    let serviceAddressAPI: string | undefined;
    let vaultsAPI: string | undefined;
    let vaultsSecondaryAPI: string | undefined;
    let faucetAPI: string | undefined;
    let faucetURL: string | undefined;
    let generate204API: string | undefined;
    let generate204API2: string | undefined;
    let blockExplorerURL: string | undefined;
    if (networkId && settings)
      switch (networkId) {
        case 'BITCOIN':
          esploraAPI = settings.MAINNET_ESPLORA_API;
          electrumAPI = settings.MAINNET_ELECTRUM_API;
          serviceAddressAPI = settings.MAINNET_SERVICE_ADDRESS_API;
          vaultsAPI = settings.MAINNET_VAULTS_API;
          vaultsSecondaryAPI = settings.MAINNET_VAULTS_SECONDARY_API;
          generate204API = settings.PUBLIC_GENERATE_204_API;
          generate204API2 = settings.PUBLIC_GENERATE_204_SECONDARY_API;
          blockExplorerURL = settings.MAINNET_BLOCK_EXPLORER;
          break;
        case 'TESTNET':
          esploraAPI = settings.TESTNET_ESPLORA_API;
          electrumAPI = settings.TESTNET_ELECTRUM_API;
          serviceAddressAPI = settings.TESTNET_SERVICE_ADDRESS_API;
          vaultsAPI = settings.TESTNET_VAULTS_API;
          vaultsSecondaryAPI = settings.TESTNET_VAULTS_SECONDARY_API;
          generate204API = settings.PUBLIC_GENERATE_204_API;
          generate204API2 = settings.PUBLIC_GENERATE_204_SECONDARY_API;
          blockExplorerURL = settings.TESTNET_BLOCK_EXPLORER;
          break;
        case 'TAPE':
          esploraAPI = settings.TAPE_ESPLORA_API;
          electrumAPI = settings.TAPE_ELECTRUM_API;
          serviceAddressAPI = settings.TAPE_SERVICE_ADDRESS_API;
          vaultsAPI = settings.TAPE_VAULTS_API;
          vaultsSecondaryAPI = settings.TAPE_VAULTS_SECONDARY_API;
          faucetAPI = `${settings.TAPE_WEB_SERVER}/faucet`;
          faucetURL = `${settings.TAPE_WEB_SERVER}`;
          generate204API = settings.PUBLIC_GENERATE_204_API;
          generate204API2 = settings.PUBLIC_GENERATE_204_SECONDARY_API;
          blockExplorerURL = settings.TAPE_BLOCK_EXPLORER;
          break;
        case 'REGTEST':
          esploraAPI = settings.REGTEST_ESPLORA_API;
          electrumAPI = settings.REGTEST_ELECTRUM_API;
          serviceAddressAPI = settings.REGTEST_SERVICE_ADDRESS_API;
          vaultsAPI = settings.REGTEST_VAULTS_API;
          vaultsSecondaryAPI = settings.REGTEST_VAULTS_SECONDARY_API;
          faucetAPI = `${settings.REGTEST_WEB_SERVER}/faucet`;
          faucetURL = `${settings.REGTEST_WEB_SERVER}`;
          generate204API = settings.REGTEST_GENERATE_204_API;
          generate204API2 = settings.REGTEST_GENERATE_204_SECONDARY_API;
          blockExplorerURL = settings.REGTEST_BLOCK_EXPLORER;
          break;
        default:
          throw new Error(`networkId ${networkId} not supported.`);
      }
    return {
      generate204APIExternal: settings?.EXTERNAL_GENERATE_204,
      faucetAPI,
      faucetURL,
      mainnetEsploraApi,
      mainnetElectrumApi,
      esploraAPI,
      electrumAPI,
      serviceAddressAPI,
      vaultsAPI,
      vaultsSecondaryAPI,
      generate204API,
      generate204API2,
      blockExplorerURL
    };
  }
);

//TODO: Fix and pass descriptors instead.
//in fact descriptors should be state, not utxos data
//TODO: here the prov is discovery may contain new info, then the memoized
//function will not update the utxosData. In fact therefore getUtxosData
//is not really derived data
//This should retunr a function that can be called?!?!?
export const getUtxosData = moize(
  (
    discovery: DiscoveryInstance | undefined,
    descriptors: Array<Descriptor> | undefined,
    vaults: Vaults | undefined,
    networkId: NetworkId
  ) => {
    if (!discovery || !descriptors || !vaults) return undefined;
    const network = networkId && networkMapping[networkId];
    const { utxos } = discovery.getUtxosAndBalance({ descriptors });
    return extractUtxosData(utxos, vaults, network, discovery);
  }
);

export const electrumParams = (
  electrumAPI: string
): { protocol: 'ssl' | 'tcp'; host: string; port: number } => {
  const regex = /^(.*):\/\/([^:/]+)(?::(\d+))?/;
  const matches = electrumAPI.match(regex);

  // Throw if matches are not exactly 3 (protocol, host, and optionally port)
  if (!matches || matches.length < 3) {
    throw new Error(`Invalid electrumAPI ${electrumAPI}`);
  }

  const protocol = matches[1];
  const host = matches[2];
  const port = matches[3];

  if (!host) {
    throw new Error(`Invalid host: ${host}.`);
  }

  // Validate protocol (must be 'ssl' or 'tcp')
  if (protocol !== 'ssl' && protocol !== 'tcp') {
    throw new Error(`Invalid protocol: ${protocol}. Expected 'ssl' or 'tcp'.`);
  }

  // Validate port (must be a number)
  if (!port || isNaN(Number(port))) {
    throw new Error(`Invalid or missing port: ${port}. Port must be a number.`);
  }

  return {
    protocol: protocol as 'ssl' | 'tcp', // Type assertion for strict typing
    host,
    port: Number(port) // Convert port to a number
  };
};
