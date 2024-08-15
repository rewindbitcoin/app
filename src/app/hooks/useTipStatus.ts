//useFeeEstimates and useTipStatus are very similar. A fix in one file should
//probably imply a fix in the other
import { useState, useCallback, useEffect } from 'react';
import { useSettings } from './useSettings';
import type { BlockStatus } from '@bitcoinerlab/explorer/dist/interface';
import { shallowEqualObjects } from 'shallow-equal';
import { useTranslation } from 'react-i18next';
import { useNetStatus } from './useNetStatus';

export function useTipStatus(): {
  tipStatus: BlockStatus | undefined;
  updateTipStatus: () => Promise<BlockStatus | undefined>;
} {
  const { explorer, explorerReachable, notifyNetErrorAsync } = useNetStatus();

  const [tipStatus, setTipStatus] = useState<BlockStatus>();
  const { settings } = useSettings();
  const { t } = useTranslation();

  const updateTipStatus = useCallback(async () => {
    let tipStatus: undefined | BlockStatus = undefined;
    try {
      if (explorer && explorerReachable) {
        const tipHeight = await explorer.fetchBlockHeight();
        tipStatus = await explorer.fetchBlockStatus(tipHeight);
        setTipStatus(prevTipStatus => {
          if (shallowEqualObjects(tipStatus, prevTipStatus)) {
            return prevTipStatus;
          } else {
            return tipStatus;
          }
        });
      }
      notifyNetErrorAsync({
        errorType: 'tipStatus',
        error: false
      });
      return tipStatus;
    } catch (err) {
      console.warn(err);
      notifyNetErrorAsync({
        errorType: 'tipStatus',
        error: t('app.tipStatusError')
      });
      return;
    }
  }, [explorer, explorerReachable, notifyNetErrorAsync, t]);

  useEffect(() => {
    if (explorer && settings?.BLOCKCHAIN_DATA_REFRESH_INTERVAL_MS) {
      const intervalId = setInterval(
        updateTipStatus,
        settings.BLOCKCHAIN_DATA_REFRESH_INTERVAL_MS
      );
      updateTipStatus(); //1st call
      return () => clearInterval(intervalId);
    }
    return;
  }, [
    explorer,
    updateTipStatus,
    settings?.BLOCKCHAIN_DATA_REFRESH_INTERVAL_MS
  ]);

  return { tipStatus, updateTipStatus };
}
