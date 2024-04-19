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
        return {
          feeEstimates,
          fetchedNetworkId: networkId
        };
      } catch (err: unknown) {
        toast.show(t('app.feeEstimatesError'), {
          type: 'warning'
        });
        return {
          feeEstimates: undefined,
          fetchedNetworkId: networkId
        };
      }
    },
    [settings, toast, t]
  );

  useEffect(() => {
    const interval =
      typeof settings?.BTC_FEE_ESTIMATES_REFRESH_INTERVAL_MS === 'number' &&
      networkId.current !== undefined
        ? setInterval(async () => {
            if (networkId.current) {
              const { feeEstimates, fetchedNetworkId } =
                await fetchFeeEstimates(networkId.current);
              feeEstimatesByNetworkId[fetchedNetworkId] = feeEstimates;
              if (networkId.current === fetchedNetworkId)
                setFeeEstimates(feeEstimates);
            }
          }, settings?.BTC_FEE_ESTIMATES_REFRESH_INTERVAL_MS)
        : undefined;
    return () => {
      for (const explorer of Object.values(explorers))
        if (explorer) explorer.close();
      if (interval !== undefined) clearInterval(interval);
    };
  }, [settings?.BTC_FEE_ESTIMATES_REFRESH_INTERVAL_MS, fetchFeeEstimates]);

  const setNetworkId = useCallback(
    async (newNetworkId: NetworkId) => {
      networkId.current = newNetworkId;
      setFeeEstimates(feeEstimatesByNetworkId[newNetworkId]);
      const { feeEstimates, fetchedNetworkId } =
        await fetchFeeEstimates(newNetworkId);
      feeEstimatesByNetworkId[fetchedNetworkId] = feeEstimates;
      if (networkId.current === fetchedNetworkId) setFeeEstimates(feeEstimates);
    },
    [fetchFeeEstimates]
  );

  return { feeEstimates, setNetworkId };
};
