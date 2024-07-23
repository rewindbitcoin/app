//useFeeEstimates and useTipStatus are very similar. A fix in one file should
//probably imply a fix in the other
import { useState, useCallback, useEffect } from 'react';
import { useSettings } from './useSettings';
import { shallowEqualObjects } from 'shallow-equal';
import { useToast } from '../../common/ui';
import { useTranslation } from 'react-i18next';
import type { FeeEstimates } from '../lib/fees';
import type { Explorer } from '@bitcoinerlab/explorer';

import { useNetStatus } from './useNetStatus';

export function useFeeEstimates(): {
  feeEstimates: FeeEstimates | undefined;
  setExplorer: (explorer: Explorer | undefined) => void;
  setUsingMainnetFeesForRealism: (usingMainnetFeesForRealism: boolean) => void;
} {
  const [explorer, setExplorer] = useState<Explorer | undefined>(undefined);
  const [usingMainnetFeesForRealism, setUsingMainnetFeesForRealism] =
    useState<boolean>(false);

  const [feeEstimates, setFeeEstimates] = useState<FeeEstimates>();
  const { settings } = useSettings();
  const intervalTime = settings?.BLOCKCHAIN_DATA_REFRESH_INTERVAL_MS;
  const { t } = useTranslation();
  const toast = useToast();

  const { explorerMainnetReachable, explorerReachable, checkStatus } =
    useNetStatus();

  const updateFeeEstimates = useCallback(async () => {
    try {
      if (
        explorer &&
        (usingMainnetFeesForRealism
          ? explorerMainnetReachable
          : explorerReachable)
      ) {
        const feeEstimates = await explorer.fetchFeeEstimates();
        setFeeEstimates(prevFeeEstimates => {
          if (shallowEqualObjects(feeEstimates, prevFeeEstimates)) {
            return prevFeeEstimates;
          } else {
            return feeEstimates;
          }
        });
      }
    } catch (err) {
      console.warn(err);
      const currStatus = await checkStatus();
      //If the explorer is reachable then this means the error is due to
      //some weird error. toast it. Otherwise, it will have been toasted in
      //NetStatus
      if (
        usingMainnetFeesForRealism
          ? currStatus?.explorerMainnetReachable
          : currStatus?.explorerReachable
      )
        toast.show(t('app.feeEstimatesError'), { type: 'warning' });
    }
  }, [
    checkStatus,
    explorer,
    explorerReachable,
    explorerMainnetReachable,
    usingMainnetFeesForRealism,
    t,
    toast
  ]);

  useEffect(() => {
    if (intervalTime) {
      const intervalId = setInterval(updateFeeEstimates, intervalTime);
      updateFeeEstimates(); //1st call
      return () => clearInterval(intervalId);
    }
    return;
  }, [updateFeeEstimates, intervalTime]);

  return { feeEstimates, setExplorer, setUsingMainnetFeesForRealism };
}
