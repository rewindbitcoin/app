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
  updateTipStatus: undefined | (() => Promise<BlockStatus | undefined>);
} {
  const { explorer, explorerReachable, notifyNetErrorAsync, networkId } =
    useNetStatus();

  const explorerReachableTrue = explorerReachable === true;

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
  const isInitRef = useRef<boolean>(false);

  const updateTipStatus = useCallback(async () => {
    let newTipStatus: undefined | BlockStatus = undefined;
    try {
      if (storageStatus.errorCode) throw new Error(storageStatus.errorCode);
      if (explorer && explorerReachableTrue) {
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
      if (explorerReachableTrue)
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
    explorerReachableTrue,
    notifyNetErrorAsync,
    t
  ]);

  useEffect(() => {
    if (networkId !== networkIdRef.current) {
      isInitRef.current = false;
    }
    networkIdRef.current = networkId;
    if (explorer && explorerReachableTrue && intervalTime) {
      if (isInitRef.current === false) {
        isInitRef.current = true;
        const intervalId = setInterval(updateTipStatus, intervalTime);
        //1st call - no need for this, since all wallets sync immediatelly on open anyway
        // updateTipStatus();
        return () => clearInterval(intervalId);
      }
    }
    return;
  }, [
    networkId,
    explorer,
    explorerReachableTrue,
    updateTipStatus,
    intervalTime
  ]);

  return {
    tipStatus,
    updateTipStatus: explorerReachableTrue ? updateTipStatus : undefined
  };
}
