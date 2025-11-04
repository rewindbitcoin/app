import memoize from 'lodash.memoize';
import { type SubUnit, type Currency } from './settings';

const intlCurrencyFormatter = memoize(
  (locale: string, currency: string) =>
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
  locale: string;
  currency: Currency;
}) => {
  try {
    const formatter = intlCurrencyFormatter(locale, currency);
    return formatter.format(amount);
  } catch (error) {
    void error;
    throw new Error(`Invalid currency or locale configuration: ${currency}`);
  }
};

const formatBtcFactory = memoize(
  ({
    amount,
    subUnit,
    btcFiat,
    locale,
    currency
  }: {
    amount: number;
    subUnit: SubUnit;
    btcFiat?: number | undefined;
    locale: string;
    currency: Currency;
  }) => {
    const ONE_BTC_IN_SATS = 100000000;
    const THRESHOLD_FOR_BTC = ONE_BTC_IN_SATS * 0.1; // 0.1 BTC

    let formattedValue;

    if (amount >= THRESHOLD_FOR_BTC) {
      formattedValue = `${(amount / ONE_BTC_IN_SATS).toLocaleString(locale, {
        minimumFractionDigits: 8
      })}\u00A0₿`;
    } else {
      switch (subUnit) {
        case 'sat':
          formattedValue =
            amount === 1
              ? `${amount.toLocaleString(locale)}\u00A0sat`
              : `${amount.toLocaleString(locale)}\u00A0sats`;
          break;
        case 'mbit':
          formattedValue = `${(amount / 100000).toLocaleString(locale)}\u00A0mBTC`;
          break;
        case 'bit': {
          const bits = amount / 100;
          formattedValue =
            bits === 1
              ? `${bits.toLocaleString(locale)}\u00A0bit`
              : `${bits.toLocaleString(locale)}\u00A0bits`;
          break;
        }
        case 'btc':
          formattedValue = `${(amount / ONE_BTC_IN_SATS).toLocaleString(
            locale,
            {
              minimumFractionDigits: 8
            }
          )}\u00A0₿`;
          break;
        default:
          throw new Error(`Invalid subunit: ${subUnit}`);
      }
    }

    if (typeof btcFiat === 'number') {
      // Use non-breaking spaces and a more compact format to prevent awkward line breaks
      const fiatValue = formatFiat({
        amount: (amount * btcFiat) / 1e8,
        locale,
        currency
      });
      formattedValue += `\u00A0≈ ${fiatValue}`;
    }

    return formattedValue;
  },
  args => JSON.stringify(args)
);

/**
 * This functions tries to express a bitcoin amount in a natural way. So even
 * if the user prefers "sats", for large quantities this function will return
 * Bitcoin amounts.
   See: const THRESHOLD_FOR_BTC = ONE_BTC_IN_SATS * 0.1; // 0.1 BTC

 * Also, this function will pad zeros at the end of the amount to meet the
 * bitcion precision: 0.1 BTC -> 0.10000000 ₿
 */
export const formatBtc = (btcArgs: {
  amount: number;
  subUnit: SubUnit;
  btcFiat?: number | undefined;
  locale: string;
  currency: Currency;
}) => formatBtcFactory(btcArgs);

const FIAT_DECIMALS = 2;
export const fromSats = (
  amount: number,
  mode: 'Fiat' | SubUnit,
  btcFiat: number | undefined
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
  btcFiat: number | undefined,
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
