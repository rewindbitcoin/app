// Copyright (C) 2025 Jose-Luis Landabaso - https://rewindbitcoin.com
// Licensed under the GNU GPL v3 or later. See the LICENSE file for details.

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

//Only report an error if fee estimates cannot be obtained after 10 minutes
const ERROR_REPORT_MAX_TIME = 10 * 60 * 1000;

export function useFeeEstimates(): {
  feeEstimates: FeeEstimates | undefined;
  updateFeeEstimates: ({
    whenToastErrors
  }: {
    whenToastErrors: 'ON_NEW_ERROR' | 'ON_ANY_ERROR';
  }) => Promise<FeeEstimates | undefined>;
  isSynchd: boolean;
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

  const feesExplorer = networkId === 'TAPE' ? explorerMainnet : explorer;

  const [feeEstimates, setFeeEstimates, , , storageStatus] =
    useStorage<FeeEstimates>(networkId && `FEES_${networkId}`, SERIALIZABLE);

  //feeEstimatesRef keeps track of as feeEstimates. It will be used
  //to compare in shallowEqualObjects. shallowEqualObjects won't use feeEstimates
  //to avoid re-renders (infinite loop)
  //Also used to detect if this comes from storage or from network (storage == undefined)
  const feeEstimatesRef = useRef<FeeEstimates | undefined>(feeEstimates);
  const lastFeeEstimatesRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    feeEstimatesRef.current = undefined;
    lastFeeEstimatesRef.current = undefined;
  }, [feesExplorer]);

  const feesExplorerReachable =
    networkId === 'TAPE' ? explorerMainnetReachable : explorerReachable;

  const updateFeeEstimates = useCallback(
    async ({
      whenToastErrors
    }: {
      whenToastErrors: 'ON_NEW_ERROR' | 'ON_ANY_ERROR';
    }) => {
      let newFeeEstimates: undefined | FeeEstimates = undefined;
      await netRequest({
        id: 'feeEstimates',
        whenToastErrors,
        requirements: {
          ...(networkId === 'TAPE'
            ? { explorerMainnetReachable: true }
            : { explorerReachable: true })
        },
        errorMessage: t('app.feeEstimatesError'),
        func: async () => {
          if (storageStatus.errorCode) throw new Error(storageStatus.errorCode);
          if (feesExplorer) {
            try {
              newFeeEstimates = await feesExplorer.fetchFeeEstimates();
              //console.log(
              //  `[${new Date().toISOString()}] [FeeEstimates]: ${JSON.stringify(newFeeEstimates)} | network: ${networkId}`
              //);
              lastFeeEstimatesRef.current = Date.now();
              if (
                !shallowEqualObjects(newFeeEstimates, feeEstimatesRef.current)
              ) {
                setFeeEstimates(newFeeEstimates);
                feeEstimatesRef.current = newFeeEstimates;
              }
            } catch (error) {
              if (
                lastFeeEstimatesRef.current === undefined ||
                Date.now() - lastFeeEstimatesRef.current > ERROR_REPORT_MAX_TIME
              )
                throw error;
              else {
                newFeeEstimates = feeEstimatesRef.current;
                console.warn(
                  'Could not obtain fresh fee estimates, but not throwing yet',
                  error
                );
              }
            }
          }
        }
      });
      return newFeeEstimates;
    },
    [
      networkId,
      setFeeEstimates,
      storageStatus.errorCode,
      netRequest,
      feesExplorer,
      t
    ]
  );

  useEffect(() => {
    if (feesExplorerReachable && intervalTime) {
      const intervalId = setInterval(
        () => updateFeeEstimates({ whenToastErrors: 'ON_NEW_ERROR' }),
        intervalTime
      );
      updateFeeEstimates({ whenToastErrors: 'ON_NEW_ERROR' }); //1st call
      return () => clearInterval(intervalId);
    }
    return;
  }, [feesExplorerReachable, updateFeeEstimates, intervalTime]);

  return {
    updateFeeEstimates,
    feeEstimates,
    isSynchd: !!feeEstimatesRef.current
  };
}
