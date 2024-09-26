const RETRIES = 5;
import memoize from 'lodash.memoize';
import type { TFunction } from 'i18next';
import { type SubUnit, type Currency, defaultSettings } from './settings';
import type { Locale } from '../../i18n-locales/init';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function fetchBtcFiat(
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

const intlCurrencyFormatter = memoize(
  (locale: Locale, currency: string) =>
    // Undefined will use the system's locale
    new Intl.NumberFormat(locale, {
      style: 'currency',
      currency
    }),
  (locale: string, currency: string) => JSON.stringify({ locale, currency })
);

export const formatFiat = ({
  amount,
  locale,
  currency
}: {
  amount: number;
  locale: Locale;
  currency: Currency;
}) => {
  try {
    const formatter = intlCurrencyFormatter(locale, currency);
    return formatter.format(amount);
  } catch (error) {
    throw new Error(`Invalid currency or locale configuration: ${currency}`);
  }
};

const formatBtcFactory = memoize((t: TFunction) =>
  memoize(
    ({
      amount,
      subUnit,
      btcFiat,
      locale,
      currency
    }: {
      amount: number;
      subUnit: SubUnit;
      btcFiat?: number | null | undefined;
      locale: Locale;
      currency: Currency;
    }) => {
      const ONE_BTC_IN_SATS = 100000000;
      const THRESHOLD_FOR_BTC = ONE_BTC_IN_SATS * 0.1; // 0.1 BTC

      let formattedValue;

      if (amount >= THRESHOLD_FOR_BTC) {
        formattedValue = t('btcFormat.btc', {
          value: (amount / ONE_BTC_IN_SATS).toLocaleString(locale)
        });
      } else {
        switch (subUnit) {
          case 'sat':
            formattedValue = t('btcFormat.sats', {
              value: amount.toLocaleString(locale),
              count: amount
            });
            break;
          case 'mbit':
            formattedValue = t('btcFormat.mbtc', {
              value: (amount / 100000).toLocaleString(locale)
            });
            break;
          case 'bit':
            formattedValue = t('btcFormat.bits', {
              value: (amount / 100).toLocaleString(locale),
              count: amount / 100
            });
            break;
          case 'btc':
            formattedValue = t('btcFormat.btc', {
              value: (amount / 100000000).toLocaleString(locale, {
                minimumFractionDigits: 8
              })
            });
            break;
          default:
            throw new Error(t('btcFormat.invalidSubunit', { subUnit }));
        }
      }

      if (typeof btcFiat === 'number') {
        formattedValue +=
          ' / ' +
          formatFiat({ amount: (amount * btcFiat) / 1e8, locale, currency });
      }

      return formattedValue;
    },
    args => JSON.stringify(args)
  )
);

export const formatBtc = (
  btcArgs: {
    amount: number;
    subUnit: SubUnit;
    btcFiat?: number | null | undefined;
    locale: Locale;
    currency: Currency;
  },
  t: TFunction
) => formatBtcFactory(t)(btcArgs);

const FIAT_DECIMALS = 2;
export const fromSats = (
  amount: number,
  mode: 'Fiat' | SubUnit,
  btcFiat: number | null | undefined
) => {
  if (mode === 'sat') return amount;
  else if (mode === 'Fiat') {
    if (typeof btcFiat !== 'number')
      throw new Error(`Currency mode not valid if rates not available`);
    const fiatAmount =
      Math.round((amount * btcFiat * Math.pow(10, FIAT_DECIMALS)) / 1e8) /
      Math.pow(10, FIAT_DECIMALS);
    return fiatAmount;
  } else if (mode === 'btc') {
    return amount / 1e8;
  } else if (mode === 'mbit') {
    return amount / 1e5;
  } else if (mode === 'bit') {
    return amount / 1e2;
  } else throw new Error(`Unsupported mode: ${mode} computing fromSats`);
};
export const toSats = (
  value: number,
  mode: 'Fiat' | SubUnit,
  btcFiat: number | null | undefined,
  /** pass known values, when available so that precission
   * is not loosed*/
  knownSatsValueMap?: {
    [value: number]: number;
  }
) => {
  if (mode === 'sat') {
    return value;
  } else {
    const knownSatsValue = knownSatsValueMap?.[value];
    if (knownSatsValue !== undefined) return knownSatsValue;
    else if (mode === 'Fiat') {
      if (typeof btcFiat !== 'number')
        throw new Error(`Currency mode not valid if rates not available`);
      return Math.round((1e8 * value) / btcFiat);
    } else if (mode === 'btc') {
      return Math.round(value * 1e8);
    } else if (mode === 'mbit') {
      return Math.round(value * 1e5);
    } else if (mode === 'bit') {
      return Math.round(value * 1e2);
    } else throw new Error(`Unsupported mode: ${mode} computing toSats`);
  }
};
export const getAmountModeStep = (amountMode: 'Fiat' | SubUnit) => {
  if (amountMode === 'Fiat') {
    return 1 / Math.pow(10, FIAT_DECIMALS);
  } else if (amountMode === 'btc') {
    return 1e-8;
  } else if (amountMode === 'mbit') {
    return 1e-5;
  } else if (amountMode === 'sat') {
    return 1;
  } else if (amountMode === 'bit') {
    return 1e-2;
  } else throw new Error(`Unsupported mode: ${amountMode} computing step`);
};
