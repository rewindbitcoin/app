import { useEffect, useRef, useState, useCallback } from 'react';
import { networkMapping, type NetworkId } from '../lib/network';
import { EsploraExplorer } from '@bitcoinerlab/explorer';
import { useSettings } from './useSettings';
import { getAPIs } from '../lib/walletDerivedData';
import { useToast } from '../../common/ui';
import { useTranslation } from 'react-i18next';
import { networks } from 'bitcoinjs-lib';

type FeeEstimates = Record<string, number>;

const feeEstimatesByNetworkId: Record<NetworkId, FeeEstimates | undefined> = {
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
export const useFeeEstimates = (initialNetworkId: NetworkId | undefined) => {
  const { settings } = useSettings();
  const [feeEstimates, setFeeEstimates] = useState<FeeEstimates | undefined>();
  const toast = useToast();
  const { t } = useTranslation();

  const networkId = useRef<NetworkId | undefined>(initialNetworkId);

  const fetchFeeEstimates = useCallback(
    async (networkId: NetworkId) => {
      let explorer = explorers[networkId];
      const { esploraAPI } = getAPIs(networkId, settings);
      try {
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
        const feeEstimates = explorer
          ? await explorer.fetchFeeEstimates()
          : undefined;
        return feeEstimates;
      } catch (err: unknown) {
        toast.show(t('app.feeEstimatesError'), {
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
      settings?.BTC_FEE_ESTIMATES_REFRESH_INTERVAL_MS !== undefined &&
      networkId.current !== undefined
        ? setInterval(async () => {
            if (networkId.current) {
              const fetchedNetworkId = networkId.current;
              const feeEstimates = await fetchFeeEstimates(fetchedNetworkId);
              feeEstimatesByNetworkId[fetchedNetworkId] = feeEstimates;
              if (networkId.current === fetchedNetworkId)
                setFeeEstimates(feeEstimates);
            }
          }, settings?.BTC_FEE_ESTIMATES_REFRESH_INTERVAL_MS)
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
      networkId.current = undefined; //Avoid pending setFeeEstimates if unmounted
    };
  }, [settings?.BTC_FEE_ESTIMATES_REFRESH_INTERVAL_MS, fetchFeeEstimates]);

  const setNetworkId = useCallback(
    async (newNetworkId: NetworkId) => {
      networkId.current = newNetworkId;
      setFeeEstimates(feeEstimatesByNetworkId[newNetworkId]);
      const feeEstimates = await fetchFeeEstimates(newNetworkId);
      feeEstimatesByNetworkId[newNetworkId] = feeEstimates;
      //networkId.current may be undefined now if unmounted:
      if (networkId.current === newNetworkId) setFeeEstimates(feeEstimates);
    },
    [fetchFeeEstimates]
  );

  return { feeEstimates, setNetworkId };
};
