import moize from 'moize';
export type DiscoveryDataExport = ReturnType<DiscoveryInstance['export']>;
import { EsploraExplorer } from '@bitcoinerlab/explorer';
import { DiscoveryFactory, DiscoveryInstance } from '@bitcoinerlab/discovery';
import { NetworkId, networkMapping } from './network';
import {
  Vaults,
  VaultsStatuses,
  getUtxosData as extractUtxosData
} from '../lib/vaults';
import { Descriptor } from '@bitcoinerlab/discovery/dist/types';

export const getDiscovery = moize(
  (
    walletId: number | undefined,
    esploraAPI: string, //TODO: this in fact derives from networkId ????
    networkId: NetworkId,
    discoveryDataExport: DiscoveryDataExport | undefined,
    isDiscoveryDataExportSynchd: boolean
  ) => {
    if (!isDiscoveryDataExportSynchd) return undefined;
    if (walletId === undefined) return undefined;
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
  }
);

export const getApis = () => {};

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
