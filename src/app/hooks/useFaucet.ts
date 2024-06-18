const DETECTION_INTERVAL = 4000;
const DETECT_RETRY_MAX = 5;

import { useContext, useEffect, useRef, useState } from 'react';
import { WalletContext, WalletContextType } from '../contexts/WalletContext';
import { useTranslation } from 'react-i18next';
import { useToast } from '../../common/ui';
import { networkMapping } from '../lib/network';
import { faucetFirstReceive } from '../lib/faucet';

export function useFaucet() {
  const context = useContext<WalletContextType | null>(WalletContext);
  if (context === null) throw new Error('Context was not set');
  const {
    historyData,
    wallet,
    accounts,
    syncBlockchain,
    isFirstLogin,
    faucetAPI
  } = context;
  const { t } = useTranslation();

  const toast = useToast();
  const faucetRequestedRef = useRef<boolean>(false);
  //When the user is notified about having either:
  //  - detected some faucet funds
  //  - faucet failed
  const faucetNotifiedRef = useRef<boolean>(false);
  const faucetDetectedRef = useRef<boolean>(false);
  const [faucetFailed, setFaucetFailed] = useState<boolean>(false);
  const faucetPending: boolean =
    faucetRequestedRef.current && !historyData?.length && !faucetFailed;

  //Check history length so that when a faucet was requested, we can
  //confirm it when it receives and funds and we can notify it.
  useEffect(() => {
    faucetDetectedRef.current =
      faucetRequestedRef.current && !!historyData?.length;
    if (
      faucetNotifiedRef.current === false &&
      faucetDetectedRef.current &&
      historyData?.length
    ) {
      faucetNotifiedRef.current = true;
      toast.show(t('walletHome.faucetDetectedMsg'), { type: 'success' });
    }
  }, [historyData?.length, toast, t]);

  useEffect(() => {
    if (
      historyData?.length === 0 &&
      wallet &&
      faucetAPI &&
      faucetRequestedRef.current === false &&
      accounts &&
      Object.keys(accounts).length &&
      isFirstLogin
    ) {
      faucetRequestedRef.current = true;
      const network = wallet.networkId && networkMapping[wallet.networkId];
      (async () => {
        try {
          toast.show(t('walletHome.faucetStartMsg'));
          await faucetFirstReceive(accounts, network, faucetAPI, 'es-ES');
          //wait a few secs until esplora catches up...
          for (let i = 0; i < DETECT_RETRY_MAX; i++) {
            syncBlockchain();
            await new Promise(resolve =>
              setTimeout(resolve, DETECTION_INTERVAL)
            );
          }
          if (!faucetDetectedRef.current) {
            setFaucetFailed(true);
            toast.show(t('walletHome.faucetErrorMsg'), { type: 'warning' });
          }
        } catch (error: unknown) {
          setFaucetFailed(true);
          toast.show(t('walletHome.faucetErrorMsg'), { type: 'warning' });
        }
      })();
    }
  }, [
    faucetAPI,
    toast,
    wallet,
    isFirstLogin,
    accounts,
    syncBlockchain,
    t,
    historyData?.length
  ]);

  return faucetPending;
}
