//useFeeEstimates and useTipStatus are very similar. A fix in one file should
//probably imply a fix in the other
import { useState, useCallback, useEffect } from 'react';
import { useSettings } from './useSettings';
import { shallowEqualObjects } from 'shallow-equal';
import { useTranslation } from 'react-i18next';
import type { FeeEstimates } from '../lib/fees';

import { useNetStatus } from './useNetStatus';
import type { NetworkId } from '../lib/network';

export function useFeeEstimates(): {
  feeEstimates: FeeEstimates | undefined;
  setNetworkId: (networkId: NetworkId | undefined) => void;
} {
  const [networkId, setNetworkId] = useState<NetworkId | undefined>();

  const [feeEstimates, setFeeEstimates] = useState<FeeEstimates>();
  const { settings } = useSettings();
  const intervalTime = settings?.BLOCKCHAIN_DATA_REFRESH_INTERVAL_MS;
  const { t } = useTranslation();

  const {
    explorer,
    explorerReachable,
    explorerMainnet,
    explorerMainnetReachable,
    notifyNetErrorAsync
  } = useNetStatus();

  const updateFeeEstimates = useCallback(async () => {
    const feesExplorer = networkId === 'TAPE' ? explorerMainnet : explorer;
    try {
      if (
        feesExplorer &&
        (networkId === 'TAPE' ? explorerMainnetReachable : explorerReachable)
      ) {
        const feeEstimates = await feesExplorer.fetchFeeEstimates();
        setFeeEstimates(prevFeeEstimates => {
          if (shallowEqualObjects(feeEstimates, prevFeeEstimates)) {
            return prevFeeEstimates;
          } else {
            return feeEstimates;
          }
        });
      }
      notifyNetErrorAsync({ errorType: 'feeEstimates', error: false });
    } catch (err) {
      console.warn(err);
      notifyNetErrorAsync({
        errorType: 'feeEstimates',
        error: t('app.feeEstimatesError')
      });
    }
  }, [
    networkId,
    notifyNetErrorAsync,
    explorer,
    explorerMainnet,
    explorerReachable,
    explorerMainnetReachable,
    t
  ]);

  useEffect(() => {
    if (intervalTime) {
      const intervalId = setInterval(updateFeeEstimates, intervalTime);
      updateFeeEstimates(); //1st call
      return () => clearInterval(intervalId);
    }
    return;
  }, [updateFeeEstimates, intervalTime]);

  return {
    feeEstimates,
    setNetworkId
  };
}
