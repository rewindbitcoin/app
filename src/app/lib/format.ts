import type { Locale } from '../../i18n-locales/init';
import type { Currency, SubUnit } from '../lib/settings';
import { numberToLocalizedString } from '../../common/lib/numbers';
import { formatFiat, fromSats } from '../lib/btcRates';
import type { TFunction } from 'i18next';
import memoize from 'lodash.memoize';
import moize from 'moize';
import type { FeeEstimates } from './fees';
export const formatBalance = ({
  satsBalance,
  btcFiat,
  currency,
  locale,
  mode,
  appendSubunit = false
}: {
  satsBalance: number;
  btcFiat?: number | undefined;
  currency: Currency;
  locale: Locale;
  mode: SubUnit | 'Fiat';
  appendSubunit?: boolean;
}) => {
  if (mode === 'Fiat') {
    if (btcFiat === undefined)
      throw new Error(
        'formatBalance cannot format Fiat values without a proper btcRate'
      );
    const balance = fromSats(satsBalance, mode, btcFiat);
    return formatFiat({ amount: balance, locale, currency });
  } else {
    const balance = fromSats(satsBalance, mode, undefined);
    return (
      numberToLocalizedString(balance, locale) +
      (appendSubunit ? ` ${mode}` : '')
    );
  }
};

/**
 * Formats block time estimates into human-readable strings.
 *
 * @param {number} blocks - The number of blocks to be converted into time estimates.
 * @param {TFunction} t - The translation function used for internationalization.
 * @param {boolean} [naturalFormatting=false] - A flag that determines if the formatted time should use natural formatting (e.g., removing trailing '.0').
 *
 * @returns {string} The formatted time estimate.
 *
 * @example
 * const t = (key, options) => `${options.formattedCount} ${key}`; // Example translation function
 *
 * formatBlocks(6, t); // Returns "1.0 hours"
 * formatBlocks(6, t, true); // Returns "1 hour"
 */
export const formatBlocks = moize(
  (blocks: number, t: TFunction, naturalFormatting: boolean = false) => {
    const averageBlockTimeInMinutes = 10;
    const timeInMinutes = blocks * averageBlockTimeInMinutes;
    const rawTimeInHours = timeInMinutes / 60;
    const rawTimeInDays = timeInMinutes / 1440;

    const formatNumber = (num: number) => {
      if (naturalFormatting) {
        const fixed = num.toFixed(1);
        return fixed.endsWith('.0') ? parseInt(fixed, 10) : fixed;
      } else {
        return num.toFixed(1);
      }
    };

    if (timeInMinutes < 60) {
      return t('timeEstimate.minutes', {
        count: timeInMinutes,
        formattedCount: formatNumber(timeInMinutes)
      });
    } else if (timeInMinutes < 1440) {
      return t('timeEstimate.hours', {
        count: rawTimeInHours,
        formattedCount: formatNumber(rawTimeInHours)
      });
    } else {
      return t('timeEstimate.days', {
        count: rawTimeInDays,
        formattedCount: formatNumber(rawTimeInDays)
      });
    }
  }
);

const formatFeeRateFactory = memoize((t: TFunction) =>
  memoize(
    ({
      feeRate,
      txSize,
      btcFiat,
      locale,
      currency,
      feeEstimates
    }: {
      feeRate: number;
      /**
       * Pass null to txSize in case you only want to show speed time.
       * Pass the txSize if you also want to compute the fees
       */
      txSize: number | null;
      btcFiat: number | null | undefined;
      locale: Locale;
      currency: Currency;
      feeEstimates: FeeEstimates | null;
    }) => {
      let strBtcFiat =
        txSize === null ? null : t('feeRate.waitingForRates', { currency });
      let strTime = t('feeRate.waitingForEstimates');

      if (typeof btcFiat === 'number' && txSize !== null) {
        const amount = (feeRate * txSize * btcFiat) / 1e8;
        strBtcFiat = t('feeRate.fee', {
          amount: formatFiat({ amount, locale, currency })
        });
      }

      //Find the lowest target time which feeRate <= input feeRate
      if (feeEstimates && Object.keys(feeEstimates).length) {
        let optimalRate: number | null = null;
        let lowestTargetTime: string | null = null;

        // First, find the largest rate that is <= feeRate
        for (const rate of Object.values(feeEstimates)) {
          if (rate <= feeRate && (optimalRate === null || rate > optimalRate)) {
            optimalRate = rate;
          }
        }

        // Then, find the lowest target time for this rate
        if (optimalRate !== null) {
          for (const [targetTime, rate] of Object.entries(feeEstimates)) {
            if (rate === optimalRate) {
              if (
                lowestTargetTime === null ||
                parseInt(targetTime) < parseInt(lowestTargetTime)
              ) {
                lowestTargetTime = targetTime;
              }
            }
          }
        }

        if (optimalRate === null) {
          strTime = t('feeRate.mayNotConfirm');
        } else {
          if (lowestTargetTime === null)
            throw new Error('lowestTargetTime cannot be null');
          const target = Number(lowestTargetTime);
          if (target === 1) strTime = t('feeRate.expressConfirmation');
          //Txs over 2 week in the mempool may be purged:
          //https://bitcoin.stackexchange.com/a/46162/89665
          else if (target >= 2 * 7 * 24 * 6)
            strTime = t('feeRate.mayNotConfirm');
          else
            strTime = t('feeRate.confirmationTime', {
              blocks: formatBlocks(target, t)
            });
        }
      }

      return strBtcFiat === null ? strTime : `${strTime} / ${strBtcFiat}`;
    },
    args => JSON.stringify(args)
  )
);

export const formatFeeRate = (
  feeRateArgs: {
    feeRate: number;
    txSize: number | null;
    btcFiat: number | null | undefined;
    locale: Locale;
    currency: Currency;
    feeEstimates: FeeEstimates | null;
  },
  t: TFunction
) => formatFeeRateFactory(t)(feeRateArgs);
