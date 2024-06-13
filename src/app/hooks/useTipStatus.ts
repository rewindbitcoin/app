//useFeeEstimates and useTipStatus are very similar. A fix in one file should
//probably imply a fix in the other
import { useState, useCallback, useEffect, useRef } from 'react';
import { ensureConnected } from '../lib/walletDerivedData';
import { useSettings } from './useSettings';
import type { DiscoveryInstance } from '@bitcoinerlab/discovery';
import type { BlockStatus } from '@bitcoinerlab/explorer/dist/interface';
import { shallowEqualObjects } from 'shallow-equal';
import { useToast } from '../../common/ui';
import { useTranslation } from 'react-i18next';

export function useTipStatus({
  initialDiscovery
}: {
  initialDiscovery: DiscoveryInstance | undefined;
}): {
  tipStatus: BlockStatus | undefined;
  updateTipStatus: () => Promise<BlockStatus | undefined>;
} {
  const initialDiscoveryRef = useRef<DiscoveryInstance | undefined>(
    initialDiscovery
  );

  const [tipStatus, setTipStatus] = useState<BlockStatus>();
  const { settings } = useSettings();
  const { t } = useTranslation();
  const toast = useToast();

  const updateTipStatus = useCallback(async () => {
    try {
      const discovery =
        initialDiscovery && (await ensureConnected(initialDiscovery));
      if (discovery) {
        const explorer = discovery.getExplorer();
        const tipHeight = await explorer.fetchBlockHeight();
        const tipStatus = await explorer.fetchBlockStatus(tipHeight);
        if (initialDiscoveryRef.current === initialDiscovery) {
          setTipStatus(prevTipStatus => {
            if (shallowEqualObjects(tipStatus, prevTipStatus)) {
              return prevTipStatus;
            } else {
              return tipStatus;
            }
          });
          return tipStatus;
        }
      }
      return undefined;
    } catch (err) {
      toast.show(t('app.tipStatusError'), { type: 'warning' });
    }
    return;
  }, [initialDiscovery, t, toast]);

  useEffect(() => {
    initialDiscoveryRef.current = initialDiscovery;
  }, [initialDiscovery]);

  useEffect(() => {
    if (initialDiscovery && settings?.BLOCKCHAIN_DATA_REFRESH_INTERVAL_MS) {
      const intervalId = setInterval(
        updateTipStatus,
        settings.BLOCKCHAIN_DATA_REFRESH_INTERVAL_MS
      );
      updateTipStatus(); //1st call
      return () => clearInterval(intervalId);
    }
    return;
  }, [
    updateTipStatus,
    initialDiscovery,
    settings?.BLOCKCHAIN_DATA_REFRESH_INTERVAL_MS
  ]);

  return { tipStatus, updateTipStatus };
}
