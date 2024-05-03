import moize from 'moize';
export type DiscoveryDataExport = ReturnType<DiscoveryInstance['export']>;
import { EsploraExplorer } from '@bitcoinerlab/explorer';
import { DiscoveryFactory, DiscoveryInstance } from '@bitcoinerlab/discovery';
import { NetworkId, networkMapping } from './network';
import { Vaults, getUtxosData as extractUtxosData } from '../lib/vaults';
import type { Descriptor } from '@bitcoinerlab/discovery/dist/types';
import type { Settings } from './settings';
import memoize from 'lodash.memoize';

/**
 * This does not memoize based on discoveryDataExport since we only care
 * about this one initially (and then it will change constantly)
 */
export const getDisconnectedDiscovery = memoize(
  (
    walletId: number | undefined,
    esploraAPI: string | undefined,
    networkId: NetworkId | undefined,
    discoveryDataExport: DiscoveryDataExport | undefined,
    isDiscoveryDataExportSynchd: boolean
  ) => {
    if (
      !isDiscoveryDataExportSynchd ||
      !esploraAPI ||
      walletId === undefined ||
      !networkId
    ) {
      return undefined;
    }
    const explorer = new EsploraExplorer({ url: esploraAPI });
    const network = networkId && networkMapping[networkId];
    const { Discovery } = DiscoveryFactory(explorer, network);
    let discovery: DiscoveryInstance;
    if (discoveryDataExport) {
      discovery = new Discovery({ imported: discoveryDataExport });
    } else {
      discovery = new Discovery();
    }
    return discovery;
  },
  (
    walletId,
    esploraAPI,
    networkId,
    _discoveryDataExport,
    isDiscoveryDataExportSynchd
  ) => `${walletId}-${esploraAPI}-${networkId}-${isDiscoveryDataExportSynchd}`
);

/**
 * Attempts to establish a connection using a DiscoveryInstance's explorer.
 * This function is designed to safely ensure that the explorer is connected
 * without throwing errors related to already established connections.
 *
 * If the `connect` method throws an error stating that the client is already
 * connected, this error is silently ignored to allow the application to proceed
 * as if the connection were successfully established. This is useful in scenarios
 * where multiple parts of an application may attempt to connect simultaneously
 * without coordination.
 *
 * Other types of errors, such as network issues or configuration problems, are
 * considered critical and are re-thrown to be handled by the calling function.
 */
export const ensureConnected = async (
  discovery: DiscoveryInstance
): Promise<DiscoveryInstance> => {
  try {
    // Attempt to connect the explorer
    await discovery.getExplorer().connect();
    return discovery;
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      error.message === 'Client already connected.'
    ) {
      // Ignore the error if the client is already connected
      return discovery;
    } else {
      // Re-throw all other errors
      throw error;
    }
  }
};

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
