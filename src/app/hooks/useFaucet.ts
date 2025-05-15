const DETECTION_INTERVAL = 4000;
const DETECT_RETRY_MAX = 5;

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useToast } from '../../common/ui';
import { networkMapping } from '../lib/network';
import { faucetFirstReceive } from '../lib/faucet';
import { useWallet } from './useWallet';
import { useSettings } from './useSettings';

//FIXME: on android the notice appears quite late...
export function useFaucet() {
  const {
    historyData,
    wallet,
    accounts,
    fetchOutputHistory,
    isFirstLogin,
    isGenerated,
    faucetAPI
  } = useWallet();
  const { settings } = useSettings();
  const { t } = useTranslation();
  const networkTimeout = settings?.NETWORK_TIMEOUT;

  const toast = useToast();
  const faucetRequestedRef = useRef<boolean>(false);
  const requestToastId = useRef<string>();
  //When the user is notified about having either:
  //  - detected some faucet funds
  //  - faucet failed
  const faucetNotifiedRef = useRef<boolean>(false);
  const faucetDetectedRef = useRef<boolean>(false);
  const [faucetFailed, setFaucetFailed] = useState<boolean>(false);
  const faucetPending: boolean =
    faucetRequestedRef.current && !historyData?.length && !faucetFailed;

  //Serves to keep a ref version of walletId so that in async functions we can
  //check after the await if the activeWallet.walletId changed
  const walletIdRef = useRef<number | undefined>(wallet?.walletId);
  useEffect(() => {
    walletIdRef.current = wallet?.walletId;
    return () => {
      walletIdRef.current = undefined;
    };
  }, [wallet?.walletId]);

  //Check history length so that when a faucet was requested, we can
  //confirm it when it receives and funds and we can notify it.
  useEffect(() => {
    faucetDetectedRef.current =
      faucetRequestedRef.current && !!historyData?.length;
    if (
      walletIdRef.current !== undefined &&
      wallet?.walletId === walletIdRef.current &&
      faucetNotifiedRef.current === false &&
      faucetDetectedRef.current &&
      historyData?.length
    ) {
      faucetNotifiedRef.current = true;
      if (
        requestToastId.current !== undefined &&
        toast.isOpen(requestToastId.current)
      )
        toast.hide(requestToastId.current);
      toast.show(t('walletHome.faucetDetectedMsg'), {
        type: 'success'
      });
    }
  }, [wallet?.walletId, historyData?.length, toast, t]);

  useEffect(() => {
    if (wallet?.networkId === 'TAPE' || wallet?.networkId === 'REGTEST') {
      if (isFirstLogin && isGenerated && !requestToastId.current)
        setTimeout(() => {
          if (
            walletIdRef.current !== undefined &&
            wallet?.walletId === walletIdRef.current &&
            !requestToastId.current
          )
            requestToastId.current = toast.show(t('walletHome.faucetStartMsg'));
        }, 1000); //Let's show the Screen in it's full glory for a sec before displaying the toast
      if (
        historyData?.length === 0 &&
        faucetAPI &&
        networkTimeout &&
        faucetRequestedRef.current === false &&
        accounts &&
        Object.keys(accounts).length &&
        isFirstLogin &&
        isGenerated
      ) {
        faucetRequestedRef.current = true;
        const network = wallet.networkId && networkMapping[wallet.networkId];
        (async () => {
          let descriptor: string | undefined;
          let index: number | undefined;
          try {
            ({ descriptor, index } = await faucetFirstReceive(
              accounts,
              network,
              faucetAPI,
              networkTimeout
            ));
            if (wallet?.walletId !== walletIdRef.current) return; //do after each await
          } catch (error: unknown) {
            console.warn(error);
            if (wallet?.walletId !== walletIdRef.current) return; //do after each await
            setFaucetFailed(true);
            if (
              requestToastId.current !== undefined &&
              toast.isOpen(requestToastId.current)
            )
              toast.hide(requestToastId.current);
            toast.show(t('walletHome.faucetErrorMsg'), { type: 'warning' });
            return;
          }
          if (!descriptor || index === undefined)
            throw new Error('faucetFirstReceive did not set a descriptor');
          //wait a few secs until esplora catches up...
          for (let i = 0; i < DETECT_RETRY_MAX; i++) {
            let txHistory = undefined;
            try {
              txHistory = await fetchOutputHistory({ descriptor, index });
              if (wallet?.walletId !== walletIdRef.current) return; //do after each await
            } catch (error) {
              console.warn(error);
              if (wallet?.walletId !== walletIdRef.current) return; //do after each await
            }
            if (!txHistory) {
              setFaucetFailed(true);
              if (
                requestToastId.current !== undefined &&
                toast.isOpen(requestToastId.current)
              )
                toast.hide(requestToastId.current);
              toast.show(t('walletHome.faucetErrorMsg'), { type: 'warning' });
              break;
            } else if (txHistory.length === 0) {
              await new Promise(resolve =>
                setTimeout(resolve, DETECTION_INTERVAL)
              );
              if (wallet?.walletId !== walletIdRef.current) return; //do after each await
            } else {
              faucetDetectedRef.current = true;
              break;
            }
          }
          if (!faucetDetectedRef.current) {
            setFaucetFailed(true);
            if (
              requestToastId.current !== undefined &&
              toast.isOpen(requestToastId.current)
            )
              toast.hide(requestToastId.current);
            toast.show(t('walletHome.faucetErrorMsg'), { type: 'warning' });
          }
        })();
      }
    }
  }, [
    networkTimeout,
    faucetAPI,
    toast,
    wallet,
    isFirstLogin,
    isGenerated,
    accounts,
    fetchOutputHistory,
    t,
    historyData?.length
  ]);

  return faucetPending;
}
