/**
 * retrieves feeEstimates and blockchainTip for passed networkId
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { networkMapping, type NetworkId } from '../lib/network';
import { EsploraExplorer } from '@bitcoinerlab/explorer';
import { useSettings } from './useSettings';
import { getAPIs } from '../lib/walletDerivedData';
import { useToast } from '../../common/ui';
import { useTranslation } from 'react-i18next';
import { networks } from 'bitcoinjs-lib';

type BlockchainData = {
  blockchainTip: number;
  feeEstimates: Record<string, number>;
};

const blockchainDataByNetworkId: Record<NetworkId, BlockchainData | undefined> =
  {
    ['BITCOIN']: undefined,
    ['TESTNET']: undefined,
    ['REGTEST']: undefined,
    ['STORM']: undefined
  };
const explorers: Record<NetworkId, EsploraExplorer | undefined> = {
  ['BITCOIN']: undefined,
  ['TESTNET']: undefined,
  ['REGTEST']: undefined,
  ['STORM']: undefined
};
export const useBlockchainData = (initialNetworkId: NetworkId | undefined) => {
  const { settings } = useSettings();
  const [blockchainData, setBlockchainData] = useState<
    BlockchainData | undefined
  >();
  const toast = useToast();
  const { t } = useTranslation();

  const networkId = useRef<NetworkId | undefined>(initialNetworkId);

  const fetchBlockchainData = useCallback(
    async (networkId: NetworkId) => {
      let explorer = explorers[networkId];
      const { esploraAPI } = getAPIs(networkId, settings);
      try {
        // create the explorer if not yet created:
        if (!explorer && esploraAPI && settings?.MAINNET_ESPLORA_API) {
          const network = networkMapping[networkId];
          //Use mainnet feeRates for regtest-type networks
          if (network === networks.regtest) {
            explorer = new EsploraExplorer({
              url: settings.MAINNET_ESPLORA_API
            });
          } else {
            explorer = new EsploraExplorer({ url: esploraAPI });
          }
          await explorer.connect();

          explorers[networkId] = explorer;
        }
        const blockchainData = explorer
          ? {
              feeEstimates: await explorer.fetchFeeEstimates(),
              blockchainTip: await explorer.fetchBlockHeight()
            }
          : undefined;
        return blockchainData;
      } catch (err: unknown) {
        toast.show(t('app.blockchainDataError'), {
          type: 'warning'
        });
        return undefined;
      }
    },
    [settings, toast, t]
  );

  //This creates an interval that will be called every x seconds and will
  //update whatever is set on networkId.current
  useEffect(() => {
    const interval =
      settings?.BLOCKCHAIN_DATA_REFRESH_INTERVAL_MS !== undefined
        ? setInterval(async () => {
            if (networkId.current) {
              const fetchedNetworkId = networkId.current;
              const blockchainData =
                await fetchBlockchainData(fetchedNetworkId);
              blockchainDataByNetworkId[fetchedNetworkId] = blockchainData;
              if (networkId.current === fetchedNetworkId) {
                setBlockchainData(blockchainData);
              }
            }
          }, settings?.BLOCKCHAIN_DATA_REFRESH_INTERVAL_MS)
        : undefined;
    return () => {
      for (const key of Object.keys(explorers) as Array<NetworkId>) {
        const explorer = explorers[key];
        if (explorer) {
          explorer.close();
          explorers[key] = undefined;
        }
      }
      if (interval !== undefined) clearInterval(interval);
      networkId.current = undefined; //Avoid pending setBlockchainData if unmounted
    };
  }, [settings?.BLOCKCHAIN_DATA_REFRESH_INTERVAL_MS, fetchBlockchainData]);

  const setNetworkId = useCallback(
    async (newNetworkId: NetworkId) => {
      networkId.current = newNetworkId;
      setBlockchainData(blockchainDataByNetworkId[newNetworkId]);
      const blockchainData = await fetchBlockchainData(newNetworkId);
      blockchainDataByNetworkId[newNetworkId] = blockchainData;
      //networkId.current may be undefined now if unmounted:
      if (networkId.current === newNetworkId) {
        setBlockchainData(blockchainData);
      }
    },
    [fetchBlockchainData]
  );

  return { blockchainData, setNetworkId };
};
