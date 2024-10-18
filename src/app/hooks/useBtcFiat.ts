import { useEffect, useCallback } from 'react';
import { useSettings } from './useSettings';
import { useTranslation } from 'react-i18next';
import { useNetStatus } from './useNetStatus';
import { useStorage } from '../../common/hooks/useStorage';
import { NUMBER } from '../../common/lib/storage';
import { type Currency, defaultSettings } from '../lib/settings';
import { useLocalization } from './useLocalization';

const RETRIES = 5;
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function fetchBtcFiat(
  currency: Currency,
  api: 'COINGECKO' | 'REWINDBITCOIN' = 'REWINDBITCOIN'
): Promise<number> {
  if (api === 'COINGECKO') {
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=${currency.toLowerCase()}`;

    let response;
    for (let retries = 0; retries < RETRIES; retries++) {
      response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        return data.bitcoin[currency.toLowerCase()];
      }
      await sleep(100);
    }
    if (response?.status !== undefined)
      throw new Error(`CoinGecko Status: ${response.status}`);
    else throw new Error(`Uknown Error from CoinGecko `);
  } else if (api === 'REWINDBITCOIN') {
    const apiUrl = `${defaultSettings.BTC_RATES_API}/get?currency=${currency.toLowerCase()}`;

    let response;
    for (let retries = 0; retries < RETRIES; retries++) {
      response = await fetch(apiUrl);
      if (response.ok) {
        const data = await response.json();
        return data.rate;
      }
      await sleep(100);
    }
    if (response?.status !== undefined)
      throw new Error(`RewindBitcoin BtcRates Status: ${response.status}`);
    else throw new Error(`Uknown BtcRates Error from RewindBitcoin`);
  } else throw new Error(`Invalid API`);
}

export const useBtcFiat = () => {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const { currency } = useLocalization();
  const intervalTime = settings?.BTC_FIAT_REFRESH_INTERVAL_MS;

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
