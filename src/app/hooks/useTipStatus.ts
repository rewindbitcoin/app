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
  const { explorer, explorerReachable, netRequest, networkId } = useNetStatus();

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
    await netRequest({
      id: 'tipStatus',
      func: async () => {
        if (storageStatus.errorCode) throw new Error(storageStatus.errorCode);
        if (explorer) {
          const tipHeight = await explorer.fetchBlockHeight();
          newTipStatus = await explorer.fetchBlockStatus(tipHeight);

          if (!shallowEqualObjects(newTipStatus, tipStatusRef.current)) {
            setTipStatus(newTipStatus);
            tipStatusRef.current = newTipStatus;
          }
        }
      },
      requirements: { explorerReachable: true },
      errorMessage: t('app.tipStatusError')
    });
    return newTipStatus;
  }, [setTipStatus, storageStatus.errorCode, explorer, netRequest, t]);

  useEffect(() => {
    if (explorerReachable && intervalTime) {
      const intervalId = setInterval(updateTipStatus, intervalTime);
      return () => clearInterval(intervalId);
    }
    return;
  }, [explorerReachable, updateTipStatus, intervalTime]);

  return { tipStatus, updateTipStatus };
}
