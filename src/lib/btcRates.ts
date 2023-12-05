import memoize from 'lodash.memoize';
import type { TFunction } from 'i18next';
import type { SubUnit, Currency, Locale } from '../contexts/SettingsContext';

//TODO: Do not depend on external APIs - or show a couple of options coingecko +
//other APIs and allow users cahnge that on settings context
export async function getBtcFiat(currency: Currency): Promise<number> {
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=${currency.toLowerCase()}`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Error: ${response.status}`);
    }
    const data = await response.json();
    return data.bitcoin.usd;
  } catch (error) {
    console.error(`Failed to fetch BTC/${currency} rate:`, error);
    throw error; // Rethrow the error for further handling if necessary
  }
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
  let formatter;

  switch (currency) {
    case 'USD':
      formatter = intlCurrencyFormatter(locale, 'USD');
      break;
    case 'EUR':
      formatter = intlCurrencyFormatter(locale, 'EUR');
      break;
    case 'GBP':
      formatter = intlCurrencyFormatter(locale, 'GBP');
      break;
    default:
      throw new Error(`Invalid currency ${currency}`);
  }

  return formatter.format(amount);
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
              count: amount
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
