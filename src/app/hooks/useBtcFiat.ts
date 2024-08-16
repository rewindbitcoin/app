import { useEffect, useRef } from 'react';
import { useSettings } from './useSettings';
import { useTranslation } from 'react-i18next';
import { fetchBtcFiat } from '../lib/btcRates';
import type { Currency } from '../lib/settings';
import { useNetStatus } from './useNetStatus';
import { useStorage } from '../../common/hooks/useStorage';
import { NUMBER } from '../../common/lib/storage';

export const useBtcFiat = () => {
  const { t } = useTranslation();
  const { settings } = useSettings();

  const { apiReachable, notifyNetErrorAsync } = useNetStatus();

  const currencyRef = useRef<Currency | undefined>(settings?.CURRENCY);
  const [btcFiat, setBtcFiat, , , storageStatus] = useStorage<number>(
    settings?.CURRENCY && `BTC${settings.CURRENCY}`,
    NUMBER
  );

  useEffect(() => {
    if (
      t &&
      settings?.CURRENCY !== undefined &&
      settings?.BTC_FIAT_REFRESH_INTERVAL_MS !== undefined &&
      (apiReachable === true || apiReachable === undefined)
    ) {
      const updateBtcFiat = async () => {
        try {
          if (storageStatus.errorCode) throw new Error(storageStatus.errorCode);
          const btcFiat = await fetchBtcFiat(settings.CURRENCY);
          if (currencyRef.current === settings.CURRENCY) setBtcFiat(btcFiat);
          notifyNetErrorAsync({ errorType: 'btcFiat', error: false });
        } catch (err) {
          console.warn(err);
          if (apiReachable === true)
            //only notify error if reachable is true, otherwise wait netStatus
            //to get proper reachability status to notify errors (netStatus is
            //still checking but we proceeded anyway to improve UX)...
            notifyNetErrorAsync({
              errorType: 'btcFiat',
              error: t('app.btcRatesError', { currency: settings.CURRENCY })
            });
        }
      };

      if (currencyRef.current !== settings?.CURRENCY) updateBtcFiat(); //Initial call
      currencyRef.current = settings?.CURRENCY;

      const interval = setInterval(() => {
        updateBtcFiat();
      }, settings.BTC_FIAT_REFRESH_INTERVAL_MS);

      return () => {
        clearInterval(interval);
      };
    }
    return;
  }, [
    t,
    storageStatus.errorCode,
    setBtcFiat,
    settings?.CURRENCY,
    settings?.BTC_FIAT_REFRESH_INTERVAL_MS,
    apiReachable,
    notifyNetErrorAsync
  ]);

  return btcFiat;
};
