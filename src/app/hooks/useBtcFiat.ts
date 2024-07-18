import { useEffect, useState, useRef } from 'react';
import { useSettings } from './useSettings';
import { useToast } from '../../common/ui';
import { useTranslation } from 'react-i18next';
import { fetchBtcFiat } from '../lib/btcRates';
import type { Currency } from '../lib/settings';

export const useBtcFiat = () => {
  const toast = useToast();
  const { t } = useTranslation();
  const { settings } = useSettings();

  const [btcFiat, setBtcFiat] = useState<number | undefined>();
  const currency = useRef<Currency | undefined>(settings?.CURRENCY);
  const latestOk = useRef<Currency | undefined>(undefined);

  useEffect(() => {
    currency.current = settings?.CURRENCY;
    if (
      settings?.CURRENCY !== undefined &&
      settings?.BTC_FIAT_REFRESH_INTERVAL_MS !== undefined
    ) {
      const updateBtcFiat = async () => {
        try {
          const btcFiat = await fetchBtcFiat(settings.CURRENCY);
          if (currency.current === settings.CURRENCY) {
            latestOk.current = settings.CURRENCY;
            setBtcFiat(btcFiat);
          }
        } catch (err) {
          toast.show(t('app.btcRatesError', { currency: settings.CURRENCY }), {
            type: 'warning'
          });
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
  }, [t, toast, settings?.CURRENCY, settings?.BTC_FIAT_REFRESH_INTERVAL_MS]);

  return btcFiat;
};
