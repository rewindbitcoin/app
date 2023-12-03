import memoize from 'lodash.memoize';
import type { SubUnit, Currency, Locale } from '../contexts/SettingsContext';

//TODO: Do not depend on external APIs
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

export const formatBtc = ({
  amount, // Amount in satoshis
  subUnit, // Preferred subunit for small amounts
  btcFiat,
  locale,
  currency
}: {
  amount: number;
  subUnit: SubUnit;
  btcFiat?: number | null | undefined;
  locale?: Locale | null | undefined;
  currency?: Currency | null | undefined;
}) => {
  const ONE_BTC_IN_SATS = 100000000;
  const THRESHOLD_FOR_BTC = ONE_BTC_IN_SATS * 0.1; // 0.1 BTC

  let formattedValue;

  if (amount >= THRESHOLD_FOR_BTC) {
    // Format in BTC for amounts 0.1 BTC and above
    return `${(amount / ONE_BTC_IN_SATS).toLocaleString()} BTC`;
  } else {
    // Format in the preferred subunit for smaller amounts
    switch (subUnit) {
      case 'sat':
        formattedValue = `${amount.toLocaleString()} sats`;
        break;
      case 'mbit':
        // 1 mBTC = 100,000 satoshis
        formattedValue = `${(amount / 100000).toLocaleString()} mBTC`;
        break;
      case 'bit':
        // 1 bit = 100 satoshis
        formattedValue = `${(amount / 100).toLocaleString()} bits`;
        break;
      default:
        throw new Error(`Invalid subunit ${subUnit}`);
    }
  }
  if (
    typeof btcFiat === 'number' &&
    typeof locale === 'string' &&
    typeof currency === 'string'
  ) {
    formattedValue +=
      ' / ' +
      formatFiat({ amount: (amount * btcFiat) / 1e8, locale, currency });
  }
  return formattedValue;
};
