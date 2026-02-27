// Copyright (C) 2025 Jose-Luis Landabaso - https://rewindbitcoin.com
// Licensed under the GNU GPL v3 or later. See the LICENSE file for details.

//useFeeEstimates and useTipStatus are very similar. A fix in one file should
//probably imply a fix in the other
import { useCallback, useEffect, useRef } from 'react';
import { useSettings } from './useSettings';
import type { BlockStatus } from '@bitcoinerlab/explorer';
import { shallowEqualObjects } from 'shallow-equal';
import { useTranslation } from 'react-i18next';
import { useNetStatus } from './useNetStatus';
import { useStorage } from '../../common/hooks/useStorage';
import { SERIALIZABLE } from '../../common/lib/storage';

//Only report an error if tip cannot be obtained for 5 minutes trying it
const ERROR_REPORT_MAX_TIME = 5 * 60 * 1000;

export function useTipStatus(): {
  tipStatus: BlockStatus | undefined;
  updateTipStatus: ({
    whenToastErrors
  }: {
    whenToastErrors: 'ON_NEW_ERROR' | 'ON_ANY_ERROR';
  }) => Promise<BlockStatus | undefined>;
  isSynchd: boolean;
} {
  const { explorer, explorerReachable, netRequest, networkId } = useNetStatus();

  const [tipStatus, setTipStatus, , , storageStatus] = useStorage<
    BlockStatus | undefined
  >(networkId && `TIP_${networkId}`, SERIALIZABLE);

  //tipStatusRef keeps track of as tipStatus. It will be used
  //to compare in shallowEqualObjects. shallowEqualObjects won't use tipStatus
  //to avoid re-renders (infinite loop)
  //Also used to detect if this comes from storage or from network (storage == undefined)
  const tipStatusRef = useRef<BlockStatus | undefined>(tipStatus);
  const lastTipStatusRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    tipStatusRef.current = undefined;
    lastTipStatusRef.current = undefined;
  }, [explorer]);

  const { settings } = useSettings();
  const intervalTime = settings?.BLOCKCHAIN_DATA_REFRESH_INTERVAL_MS;
  const { t } = useTranslation();

  const updateTipStatus = useCallback(
    async ({
      whenToastErrors
    }: {
      whenToastErrors: 'ON_NEW_ERROR' | 'ON_ANY_ERROR';
    }) => {
      let newTipStatus: undefined | BlockStatus = undefined;
      await netRequest({
        id: 'tipStatus',
        whenToastErrors,
        requirements: { explorerReachable: true },
        errorMessage: t('app.tipStatusError'),
        func: async () => {
          if (storageStatus.errorCode) throw new Error(storageStatus.errorCode);
          if (explorer && !explorer.isClosed()) {
            try {
              const tipHeight = await explorer.fetchBlockHeight();
              lastTipStatusRef.current = Date.now();
              newTipStatus = await explorer.fetchBlockStatus(tipHeight);

              if (!shallowEqualObjects(newTipStatus, tipStatusRef.current)) {
                setTipStatus(newTipStatus);
                tipStatusRef.current = newTipStatus;
              }
            } catch (error) {
              if (
                lastTipStatusRef.current === undefined ||
                Date.now() - lastTipStatusRef.current > ERROR_REPORT_MAX_TIME
              )
                throw error;
              else {
                newTipStatus = tipStatusRef.current;
                console.warn(
                  'Could not obtain fresh tip status, but not throwing yet',
                  error
                );
              }
            }
          }
        }
      });
      return newTipStatus;
    },
    [setTipStatus, storageStatus.errorCode, explorer, netRequest, t]
  );

  useEffect(() => {
    if (explorerReachable && intervalTime) {
      const intervalId = setInterval(
        () => updateTipStatus({ whenToastErrors: 'ON_NEW_ERROR' }),
        intervalTime
      );
      return () => clearInterval(intervalId);
    }
    return;
  }, [explorerReachable, updateTipStatus, intervalTime]);

  return {
    tipStatus,
    updateTipStatus,
    // Safe: this ref tracks the latest fetched tip status cache; using it keeps
    // existing sync behavior without adding state-driven refresh cycles.
    // eslint-disable-next-line react-hooks/refs
    isSynchd: !!tipStatusRef.current
  };
}
