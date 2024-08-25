import { useEffect, useCallback } from 'react';
import { useSettings } from './useSettings';
import { useTranslation } from 'react-i18next';
import { fetchBtcFiat } from '../lib/btcRates';
import { useNetStatus } from './useNetStatus';
import { useStorage } from '../../common/hooks/useStorage';
import { NUMBER } from '../../common/lib/storage';

export const useBtcFiat = () => {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const intervalTime = settings?.BTC_FIAT_REFRESH_INTERVAL_MS;
  const currency = settings?.CURRENCY;

  const { apiReachable, netRequest } = useNetStatus();

  const [btcFiat, setBtcFiat, , , storageStatus] = useStorage<number>(
    currency && `RATES_BTC${currency}`,
    NUMBER
  );

  const updateBtcFiat = useCallback(async () => {
    let btcFiat: number | undefined = undefined;
    await netRequest({
      id: 'btcFiat',
      func: async () => {
        if (storageStatus.errorCode) throw new Error(storageStatus.errorCode);
        if (currency) {
          btcFiat = await fetchBtcFiat(currency);
          setBtcFiat(btcFiat);
        }
      },
      requirements: { apiReachable: true },
      errorMessage: t('app.btcRatesError', { currency })
    });
    return btcFiat;
  }, [setBtcFiat, storageStatus.errorCode, currency, netRequest, t]);

  useEffect(() => {
    if (intervalTime && apiReachable) {
      const intervalId = setInterval(updateBtcFiat, intervalTime);
      updateBtcFiat(); //1st call
      return () => clearInterval(intervalId);
    }
    return;
  }, [apiReachable, updateBtcFiat, intervalTime]);

  return { updateBtcFiat, btcFiat };
};
