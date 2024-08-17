//useFeeEstimates and useTipStatus are very similar. A fix in one file should
//probably imply a fix in the other
import { useCallback, useEffect, useRef } from 'react';
import { useSettings } from './useSettings';
import { shallowEqualObjects } from 'shallow-equal';
import { useTranslation } from 'react-i18next';
import type { FeeEstimates } from '../lib/fees';

import { useNetStatus } from './useNetStatus';
import type { NetworkId } from '../lib/network';
import { useStorage } from '../../common/hooks/useStorage';
import { SERIALIZABLE } from '../../common/lib/storage';

export function useFeeEstimates(): FeeEstimates | undefined {
  //feeEstimatesRef keeps track of as feeEstimates. It will be used
  //to compare in shallowEqualObjects. shallowEqualObjects won't use feeEstimates
  //to avoid re-renders (infinite loop)
  const feeEstimatesRef = useRef<FeeEstimates>();
  const networkIdRef = useRef<NetworkId | undefined>(undefined);
  const isInitRef = useRef<boolean>(false);
  const { settings } = useSettings();
  const intervalTime = settings?.BLOCKCHAIN_DATA_REFRESH_INTERVAL_MS;
  const { t } = useTranslation();

  const {
    explorer,
    explorerReachable,
    explorerMainnet,
    explorerMainnetReachable,
    notifyNetErrorAsync,
    networkId
  } = useNetStatus();
  const [feeEstimates, setFeeEstimates, , , storageStatus] =
    useStorage<FeeEstimates>(networkId && `FEES_${networkId}`, SERIALIZABLE);

  const feesExplorer = networkId === 'TAPE' ? explorerMainnet : explorer;
  const feesExplorerReachable =
    networkId === 'TAPE' ? explorerMainnetReachable : explorerReachable;

  const updateFeeEstimates = useCallback(async () => {
    try {
      if (storageStatus.errorCode) throw new Error(storageStatus.errorCode);
      if (feesExplorer && feesExplorerReachable !== false) {
        const newFeeEstimates = await feesExplorer.fetchFeeEstimates();
        if (
          networkIdRef.current === networkId &&
          !shallowEqualObjects(newFeeEstimates, feeEstimatesRef.current)
        ) {
          setFeeEstimates(newFeeEstimates);
          feeEstimatesRef.current = newFeeEstimates;
        }
      }
      notifyNetErrorAsync({ errorType: 'feeEstimates', error: false });
    } catch (err) {
      console.warn(err);
      if (feesExplorerReachable === true)
        //only notify error if reachable is true, otherwise wait netStatus
        //to get proper reachability status to notify errors (netStatus is
        //still checking but we proceeded anyway to improve UX)...
        notifyNetErrorAsync({
          errorType: 'feeEstimates',
          error: t('app.feeEstimatesError')
        });
    }
  }, [
    setFeeEstimates,
    storageStatus.errorCode,
    networkId,
    notifyNetErrorAsync,
    feesExplorer,
    feesExplorerReachable,
    t
  ]);

  useEffect(() => {
    console.log('TRACE useFeeEstimates', {
      init: isInitRef.current,
      networkId,
      currN: networkIdRef.current,
      feesExplorerReachable
    });
    if (feesExplorerReachable !== false && intervalTime) {
      const intervalId = setInterval(updateFeeEstimates, intervalTime);
      updateFeeEstimates(); //1st call
      return () => clearInterval(intervalId);
    }
    return;
  }, [networkId, feesExplorerReachable, updateFeeEstimates, intervalTime]);

  return feeEstimates;
}
