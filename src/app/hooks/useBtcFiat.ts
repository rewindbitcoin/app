import { useEffect, useCallback, useRef } from 'react';
import { useSettings } from './useSettings';
import { useTranslation } from 'react-i18next';
import { useNetStatus } from './useNetStatus';
import { useStorage } from '../../common/hooks/useStorage';
import { NUMBER } from '../../common/lib/storage';
import { type Currency, defaultSettings } from '../lib/settings';
import { useLocalization } from './useLocalization';

const RETRIES = 2;
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

//Only report an error if tip cannot be obtained for 30 minutes trying it
const ERROR_REPORT_MAX_TIME = 30 * 60 * 1000;

async function fetchBtcFiat(
  currency: Currency,
  api: 'COINGECKO' | 'REWINDBITCOIN' = 'REWINDBITCOIN',
  networkTimeout: number
): Promise<number> {
  if (api === 'COINGECKO') {
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=${currency.toLowerCase()}`;

    let response;
    for (let retries = 0; retries < RETRIES; retries++) {
      response = await fetch(url, {
        signal: AbortSignal.timeout(networkTimeout)
      });
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
      response = await fetch(apiUrl, {
        signal: AbortSignal.timeout(networkTimeout)
      });
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
  const networkTimeout = settings?.NETWORK_TIMEOUT;

  const { apiReachable, netRequest } = useNetStatus();

  const [btcFiat, setBtcFiat, , , storageStatus] = useStorage<number>(
    currency && `RATES_BTC${currency}`,
    NUMBER
  );

  const btcFiatRef = useRef<number | undefined>(btcFiat);
  const lastBtcFiatRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    btcFiatRef.current = undefined;
    lastBtcFiatRef.current = undefined;
  }, [currency]);

  const updateBtcFiat = useCallback(
    async ({
      networkTimeout,
      whenToastErrors
    }: {
      networkTimeout: number;
      whenToastErrors: 'ON_NEW_ERROR' | 'ON_ANY_ERROR';
    }) => {
      let newBtcFiat: number | undefined = undefined;
      await netRequest({
        id: 'btcFiat',
        whenToastErrors,
        requirements: { apiReachable: true },
        errorMessage: t('app.btcRatesError', { currency }),
        func: async () => {
          if (storageStatus.errorCode) throw new Error(storageStatus.errorCode);
          if (currency) {
            try {
              newBtcFiat = await fetchBtcFiat(
                currency,
                'REWINDBITCOIN',
                networkTimeout
              );
              lastBtcFiatRef.current = Date.now();

              setBtcFiat(newBtcFiat);
              btcFiatRef.current = newBtcFiat;
            } catch (error) {
              if (
                lastBtcFiatRef.current === undefined ||
                Date.now() - lastBtcFiatRef.current > ERROR_REPORT_MAX_TIME
              )
                throw error;
              else {
                newBtcFiat = btcFiatRef.current;
                console.warn(
                  'Could not obtain fresh btc rates, but not throwing yet',
                  error
                );
              }
            }
          }
        }
      });
      return newBtcFiat;
    },
    [setBtcFiat, storageStatus.errorCode, currency, netRequest, t]
  );

  useEffect(() => {
    if (intervalTime && apiReachable && networkTimeout) {
      const intervalId = setInterval(
        () =>
          updateBtcFiat({ whenToastErrors: 'ON_NEW_ERROR', networkTimeout }),
        intervalTime
      );
      updateBtcFiat({ whenToastErrors: 'ON_NEW_ERROR', networkTimeout }); //1st call
      return () => clearInterval(intervalId);
    }
    return;
  }, [apiReachable, updateBtcFiat, intervalTime, networkTimeout]);

  return { updateBtcFiat, btcFiat };
};
