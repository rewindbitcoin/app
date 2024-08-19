//useFeeEstimates and useTipStatus are very similar. A fix in one file should
//probably imply a fix in the other
import { useCallback, useEffect, useRef } from 'react';
import { useSettings } from './useSettings';
import type { BlockStatus } from '@bitcoinerlab/explorer/dist/interface';
import { shallowEqualObjects } from 'shallow-equal';
import { useTranslation } from 'react-i18next';
import { useNetStatus } from './useNetStatus';
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
  const tipStatusRef = useRef<BlockStatus | undefined>();
  useEffect(() => {
    tipStatusRef.current = undefined;
  }, [setTipStatus]);

  const { settings } = useSettings();
  const intervalTime = settings?.BLOCKCHAIN_DATA_REFRESH_INTERVAL_MS;
  const { t } = useTranslation();

  const updateTipStatus = useCallback(async () => {
    let newTipStatus: undefined | BlockStatus = undefined;
    try {
      if (storageStatus.errorCode) throw new Error(storageStatus.errorCode);
      if (explorer && explorerReachable) {
        const tipHeight = await explorer.fetchBlockHeight();
        newTipStatus = await explorer.fetchBlockStatus(tipHeight);

        if (!shallowEqualObjects(newTipStatus, tipStatusRef.current)) {
          setTipStatus(newTipStatus);
          tipStatusRef.current = newTipStatus;
        }
      }
      await notifyNetErrorAsync({
        errorType: 'tipStatus',
        error: false
      });
      return newTipStatus;
    } catch (err) {
      console.warn(err);
      await notifyNetErrorAsync({
        errorType: 'tipStatus',
        error: t('app.tipStatusError')
      });
      return;
    }
  }, [
    setTipStatus,
    storageStatus.errorCode,
    explorer,
    explorerReachable,
    notifyNetErrorAsync,
    t
  ]);
  useEffect(() => {
    if (!explorerReachable)
      notifyNetErrorAsync({ errorType: 'tipStatus', error: false });
  }, [explorerReachable, notifyNetErrorAsync]);

  useEffect(() => {
    if (explorerReachable && intervalTime) {
      const intervalId = setInterval(updateTipStatus, intervalTime);
      return () => clearInterval(intervalId);
    }
    return;
  }, [explorerReachable, updateTipStatus, intervalTime]);

  return { tipStatus, updateTipStatus };
}
