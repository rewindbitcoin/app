//useFeeEstimates and useTipStatus are very similar. A fix in one file should
//probably imply a fix in the other
import { useState, useCallback, useEffect, useRef } from 'react';
import { ensureConnected } from '../lib/walletDerivedData';
import { useSettings } from './useSettings';
import type { DiscoveryInstance } from '@bitcoinerlab/discovery';
import { shallowEqualObjects } from 'shallow-equal';
import { useToast } from '../../common/ui';
import { useTranslation } from 'react-i18next';
import type { FeeEstimates } from '../lib/fees';
import { EsploraExplorer, Explorer } from '@bitcoinerlab/explorer';
import { Network, networks } from 'bitcoinjs-lib';

export function useFeeEstimates({
  initialDiscovery,
  network
}: {
  initialDiscovery: DiscoveryInstance | undefined;
  network: Network | undefined;
}): {
  feeEstimates: FeeEstimates | undefined;
  updateFeeEstimates: () => Promise<FeeEstimates | undefined>;
} {
  const initialDiscoveryRef = useRef<DiscoveryInstance | undefined>(
    initialDiscovery
  );

  const [feeEstimates, setFeeEstimates] = useState<FeeEstimates>();
  const { settings } = useSettings();
  const mainnetAPI = settings?.MAINNET_ESPLORA_API;
  const intevalTime = settings?.BLOCKCHAIN_DATA_REFRESH_INTERVAL_MS;
  const { t } = useTranslation();
  const toast = useToast();

  const updateFeeEstimates = useCallback(async () => {
    try {
      if (network) {
        let explorer: Explorer | undefined;
        if (network === networks.regtest && mainnetAPI) {
          //On Regtest, use mainnet for Fee Estimates
          explorer = new EsploraExplorer({ url: mainnetAPI });
          await explorer.connect();
        } else {
          const discovery =
            initialDiscovery && (await ensureConnected(initialDiscovery));
          if (discovery) explorer = discovery.getExplorer();
        }
        if (explorer) {
          const feeEstimates = await explorer.fetchFeeEstimates();
          if (initialDiscoveryRef.current === initialDiscovery) {
            setFeeEstimates(prevFeeEstimates => {
              if (shallowEqualObjects(feeEstimates, prevFeeEstimates)) {
                return prevFeeEstimates;
              } else {
                return feeEstimates;
              }
            });
            return feeEstimates;
          }
        }
      }
      return undefined;
    } catch (err) {
      toast.show(t('app.feeEstimatesError'), { type: 'warning' });
    }
    return;
  }, [initialDiscovery, t, toast, mainnetAPI, network]);

  useEffect(() => {
    initialDiscoveryRef.current = initialDiscovery;
  }, [initialDiscovery]);

  useEffect(() => {
    if (initialDiscovery && intevalTime && mainnetAPI && network) {
      const intervalId = setInterval(updateFeeEstimates, intevalTime);
      updateFeeEstimates(); //1st call
      return () => clearInterval(intervalId);
    }
    return;
  }, [updateFeeEstimates, initialDiscovery, mainnetAPI, intevalTime, network]);

  return { feeEstimates, updateFeeEstimates };
}
