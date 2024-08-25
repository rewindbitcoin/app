//useFeeEstimates and useTipStatus are very similar. A fix in one file should
//probably imply a fix in the other
import { useCallback, useEffect, useRef } from 'react';
import { useSettings } from './useSettings';
import { shallowEqualObjects } from 'shallow-equal';
import { useTranslation } from 'react-i18next';
import type { FeeEstimates } from '../lib/fees';

import { useNetStatus } from './useNetStatus';
import { useStorage } from '../../common/hooks/useStorage';
import { SERIALIZABLE } from '../../common/lib/storage';

export function useFeeEstimates(): {
  feeEstimates: FeeEstimates | undefined;
  updateFeeEstimates: () => Promise<FeeEstimates | undefined>;
} {
  const { settings } = useSettings();
  const intervalTime = settings?.BLOCKCHAIN_DATA_REFRESH_INTERVAL_MS;
  const { t } = useTranslation();

  const {
    explorer,
    explorerReachable,
    explorerMainnet,
    explorerMainnetReachable,
    netRequest,
    networkId
  } = useNetStatus();

  const [feeEstimates, setFeeEstimates, , , storageStatus] =
    useStorage<FeeEstimates>(networkId && `FEES_${networkId}`, SERIALIZABLE);

  //feeEstimatesRef keeps track of as feeEstimates. It will be used
  //to compare in shallowEqualObjects. shallowEqualObjects won't use feeEstimates
  //to avoid re-renders (infinite loop)
  const feeEstimatesRef = useRef<FeeEstimates | undefined>();
  useEffect(() => {
    feeEstimatesRef.current = undefined;
  }, [setFeeEstimates]);

  const feesExplorer = networkId === 'TAPE' ? explorerMainnet : explorer;
  const feesExplorerReachable =
    networkId === 'TAPE' ? explorerMainnetReachable : explorerReachable;

  const updateFeeEstimates = useCallback(async () => {
    let newFeeEstimates: undefined | FeeEstimates = undefined;
    await netRequest({
      id: 'feeEstimates',
      func: async () => {
        if (storageStatus.errorCode) throw new Error(storageStatus.errorCode);
        if (feesExplorer) {
          newFeeEstimates = await feesExplorer.fetchFeeEstimates();
          if (!shallowEqualObjects(newFeeEstimates, feeEstimatesRef.current)) {
            setFeeEstimates(newFeeEstimates);
            feeEstimatesRef.current = newFeeEstimates;
          }
        }
      },
      requirements: {
        ...(networkId === 'TAPE'
          ? { explorerMainnetReachable: true }
          : { explorerReachable: true })
      },
      errorMessage: t('app.feeEstimatesError')
    });
    return newFeeEstimates;
  }, [
    networkId,
    setFeeEstimates,
    storageStatus.errorCode,
    netRequest,
    feesExplorer,
    t
  ]);

  useEffect(() => {
    if (feesExplorerReachable && intervalTime) {
      const intervalId = setInterval(updateFeeEstimates, intervalTime);
      updateFeeEstimates(); //1st call
      return () => clearInterval(intervalId);
    }
    return;
  }, [feesExplorerReachable, updateFeeEstimates, intervalTime]);

  return { updateFeeEstimates, feeEstimates };
}
