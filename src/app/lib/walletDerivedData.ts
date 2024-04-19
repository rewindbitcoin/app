import moize from 'moize';
import type { DiscoveryInstance } from '@bitcoinerlab/discovery';
import { NetworkId, networkMapping } from './network';
import { Vaults, getUtxosData as extractUtxosData } from '../lib/vaults';
import type { Descriptor } from '@bitcoinerlab/discovery/dist/types';
import type { Settings } from './settings';

export const getAPIs = moize(
  (networkId: NetworkId | undefined, settings: Settings | undefined) => {
    let esploraAPI: string | undefined;
    let serviceAddressAPI: string | undefined;
    let vaultsAPI: string | undefined;
    let vaultsSecondaryAPI: string | undefined;
    if (networkId && settings)
      switch (networkId) {
        case 'BITCOIN':
          esploraAPI = settings.MAINNET_ESPLORA_API;
          serviceAddressAPI = settings.MAINNET_SERVICE_ADDRESS_API;
          vaultsAPI = settings.MAINNET_VAULTS_API;
          vaultsSecondaryAPI = settings.MAINNET_VAULTS_SECONDARY_API;
          break;
        case 'TESTNET':
          esploraAPI = settings.TESTNET_ESPLORA_API;
          serviceAddressAPI = settings.TESTNET_SERVICE_ADDRESS_API;
          vaultsAPI = settings.TESTNET_VAULTS_API;
          vaultsSecondaryAPI = settings.TESTNET_VAULTS_SECONDARY_API;
          break;
        case 'STORM':
          esploraAPI = settings.STORM_ESPLORA_API;
          serviceAddressAPI = settings.STORM_SERVICE_ADDRESS_API;
          vaultsAPI = settings.STORM_VAULTS_API;
          vaultsSecondaryAPI = settings.STORM_VAULTS_SECONDARY_API;
          break;
        case 'REGTEST':
          esploraAPI = settings.REGTEST_ESPLORA_API;
          serviceAddressAPI = settings.REGTEST_SERVICE_ADDRESS_API;
          vaultsAPI = settings.REGTEST_VAULTS_API;
          vaultsSecondaryAPI = settings.REGTEST_VAULTS_SECONDARY_API;
          break;
        default:
          throw new Error(`networkId ${networkId} not supported.`);
      }
    return {
      esploraAPI,
      serviceAddressAPI,
      vaultsAPI,
      vaultsSecondaryAPI
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
