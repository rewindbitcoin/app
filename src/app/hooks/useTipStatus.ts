//useFeeEstimates and useTipStatus are very similar. A fix in one file should
//probably imply a fix in the other
import { useCallback, useEffect, useRef } from 'react';
import { useSettings } from './useSettings';
import type { BlockStatus } from '@bitcoinerlab/explorer/dist/interface';
import { shallowEqualObjects } from 'shallow-equal';
import { useTranslation } from 'react-i18next';
import { useNetStatus } from './useNetStatus';
import type { NetworkId } from '../lib/network';
import { useStorage } from '../../common/hooks/useStorage';
import { SERIALIZABLE } from '../../common/lib/storage';

export function useTipStatus(): {
  tipStatus: BlockStatus | undefined;
  updateTipStatus: () => Promise<BlockStatus | undefined>;
} {
  const { explorer, explorerReachable, notifyNetErrorAsync, networkId } =
    useNetStatus();

  const [tipStatus, setTipStatus, , , storageStatus] = useStorage<
    BlockStatus | undefined
  >(networkId && `TIP_${networkId}`, SERIALIZABLE);

  //tipStatusRef keeps track of as tipStatus. It will be used
  //to compare in shallowEqualObjects. shallowEqualObjects won't use tipStatus
  //to avoid re-renders (infinite loop)
  const tipStatusRef = useRef<BlockStatus>();
  const { settings } = useSettings();
  const intervalTime = settings?.BLOCKCHAIN_DATA_REFRESH_INTERVAL_MS;
  const { t } = useTranslation();
  const networkIdRef = useRef<NetworkId | undefined>(networkId);

  const updateTipStatus = useCallback(async () => {
    let newTipStatus: undefined | BlockStatus = undefined;
    try {
      if (storageStatus.errorCode) throw new Error(storageStatus.errorCode);
      if (explorer && explorerReachable !== false) {
        const tipHeight = await explorer.fetchBlockHeight();
        newTipStatus = await explorer.fetchBlockStatus(tipHeight);

        if (
          networkIdRef.current === networkId &&
          !shallowEqualObjects(newTipStatus, tipStatusRef.current)
        ) {
          setTipStatus(newTipStatus);
          tipStatusRef.current = newTipStatus;
        }
      }
      notifyNetErrorAsync({
        errorType: 'tipStatus',
        error: false
      });
      return newTipStatus;
    } catch (err) {
      console.warn(err);
      if (explorerReachable === true)
        //only notify error if reachable is true, otherwise wait netStatus
        //to get proper reachability status to notify errors (netStatus is
        //still checking but we proceeded anyway to improve UX)...
        notifyNetErrorAsync({
          errorType: 'tipStatus',
          error: t('app.tipStatusError')
        });
      return;
    }
  }, [
    networkId,
    setTipStatus,
    storageStatus.errorCode,
    explorer,
    explorerReachable,
    notifyNetErrorAsync,
    t
  ]);

  useEffect(() => {
    if (explorerReachable !== false && intervalTime) {
      const intervalId = setInterval(updateTipStatus, intervalTime);
      return () => clearInterval(intervalId);
    }
    return;
  }, [networkId, explorerReachable, updateTipStatus, intervalTime]);

  return { tipStatus, updateTipStatus };
}
