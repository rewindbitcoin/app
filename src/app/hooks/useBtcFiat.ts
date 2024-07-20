import { useEffect, useState, useRef } from 'react';
import { useSettings } from './useSettings';
import { useToast } from '../../common/ui';
import { useTranslation } from 'react-i18next';
import { fetchBtcFiat } from '../lib/btcRates';
import type { Currency } from '../lib/settings';
import type { TFunction } from 'i18next';
import { useNetStatus } from './useNetStatus';

export const useBtcFiat = () => {
  const toast = useToast();
  const { t } = useTranslation();
  const { settings } = useSettings();

  const netStatus = useNetStatus();
  const checkStatus = netStatus.checkStatus;

  const [btcFiat, setBtcFiat] = useState<number | undefined>();
  const currency = useRef<Currency | undefined>(settings?.CURRENCY);
  const latestOk = useRef<Currency | undefined>(undefined);

  // Tracks the latest translation function to avoid redundant toasts. This approach
  // mitigates unnecessary updates caused by `initI18n` in `App.tsx`, which could lead
  // to double notifications during app initialization. The issue typically arises
  // when there's no internet connection at start-up. Since `App.tsx` initializes
  // i18n twice: once with the default language and once with the user's language—
  // this approach prevents a second toast triggered by the initial `updateBtcFiat` call.
  const tRef = useRef<TFunction | undefined>(undefined);
  useEffect(() => {
    tRef.current = t;
  }, [t]);

  useEffect(() => {
    currency.current = settings?.CURRENCY;
    const t = tRef.current;
    if (
      t &&
      settings?.CURRENCY !== undefined &&
      settings?.BTC_FIAT_REFRESH_INTERVAL_MS !== undefined &&
      netStatus.apiReachable
    ) {
      const updateBtcFiat = async () => {
        try {
          const btcFiat = await fetchBtcFiat(settings.CURRENCY);
          if (currency.current === settings.CURRENCY) {
            latestOk.current = settings.CURRENCY;
            setBtcFiat(btcFiat);
          }
        } catch (err) {
          console.warn(err);
          if (!(await checkStatus())?.apiReachable)
            //check it again
            toast.show(
              t('app.btcRatesError', { currency: settings.CURRENCY }),
              {
                type: 'warning'
              }
            );
          if (currency.current !== latestOk.current) setBtcFiat(undefined); //otherwise simply keep last one
        }
      };

      updateBtcFiat(); //Initial call

      const interval = setInterval(() => {
        updateBtcFiat();
      }, settings.BTC_FIAT_REFRESH_INTERVAL_MS);

      return () => {
        clearInterval(interval);
        latestOk.current = undefined;
        currency.current = undefined; //Avoid pending setBtcFiat if unmounted
      };
    }
    return;
  }, [
    toast,
    settings?.CURRENCY,
    settings?.BTC_FIAT_REFRESH_INTERVAL_MS,
    netStatus.apiReachable,
    checkStatus
  ]);

  return btcFiat;
};
