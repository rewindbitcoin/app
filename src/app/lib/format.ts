import type { Currency, SubUnit } from '../lib/settings';
import {
  numberToFormattedFixed,
  numberToLocalizedString
} from '../../common/lib/numbers';
import { formatFiat, fromSats, formatBtc } from '../lib/btcRates';
import type { TFunction } from 'i18next';
import memoize from 'lodash.memoize';
import moize from 'moize';
import type { FeeEstimates } from './fees';
/**
 * this one will format fiat and also btc amounts
 * When formatting btc amounts (sats, bits or whatever) it won't add zeros
 * at the end of the amount to show the Bitcoin precision. Use formatBtc
 * if you want this other behaviourt
 */
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
  locale: string;
  mode: SubUnit | 'Fiat';
  appendSubunit?: boolean;
}) => {
  if (mode === 'Fiat') {
    if (typeof btcFiat !== 'number')
      throw new Error(
        'formatBalance cannot format Fiat values without a proper btcFiat'
      );
    const balance = fromSats(satsBalance, mode, btcFiat);
    return formatFiat({ amount: balance, locale, currency });
  } else {
    const balance = fromSats(satsBalance, mode, undefined);
    return (
      numberToLocalizedString(balance, locale) +
      (appendSubunit ? ` ${mode === 'btc' ? '₿' : mode}` : '')
    );
  }
};

/**
 * Formats block time estimates into human-readable strings.
 *
 * @param {number} blocks - The number of blocks to be converted into time estimates.
 * @param {TFunction} t - The translation function used for internationalization.
 * @param {boolean} [naturalFormatting=false] - A flag that determines if the formatted time should use natural formatting (e.g., removing trailing '.0'). Minutes are always natural-formatted.
 *
 * @returns {string} The formatted time estimate.
 *
 * @example
 * const t = (key, options) => `${options.formattedCount} ${key}`; // Example translation function
 *
 * formatBlocks(6, t, locale); // Returns "1.0 hours"
 * formatBlocks(6, t, locale, true); // Returns "1 hour"
 */
export const formatBlocks = moize(
  (
    blocks: number,
    t: TFunction,
    locale: string,
    naturalFormatting: boolean = false
  ) => {
    const averageBlockTimeInMinutes = 10;
    const timeInMinutes = blocks * averageBlockTimeInMinutes;
    const rawTimeInHours = timeInMinutes / 60;
    const rawTimeInDays = timeInMinutes / 1440;

    if (timeInMinutes < 60) {
      return t('timeEstimate.minutes', {
        count: timeInMinutes,
        formattedCount: numberToFormattedFixed(timeInMinutes, 1, locale, true)
      });
    } else if (timeInMinutes < 1440) {
      return t('timeEstimate.hours', {
        count: rawTimeInHours,
        formattedCount: numberToFormattedFixed(
          rawTimeInHours,
          1,
          locale,
          naturalFormatting
        )
      });
    } else {
      return t('timeEstimate.days', {
        count: rawTimeInDays,
        formattedCount: numberToFormattedFixed(
          rawTimeInDays,
          1,
          locale,
          naturalFormatting
        )
      });
    }
  }
);

const formatFeeRateFactory = memoize((t: TFunction) =>
  memoize(
    ({
      fee,
      feeRate,
      btcFiat,
      subUnit,
      locale,
      currency,
      feeEstimates
    }: {
      /**
       * Pass undefined to fee in case you only want to show speed time.
       * Pass the fee if you also want to display the fees
       */
      fee: number | undefined;
      feeRate: number;
      btcFiat: number | undefined;
      subUnit: SubUnit;
      locale: string;
      currency: Currency;
      feeEstimates: FeeEstimates | undefined;
    }) => {
      let strBtcFiat =
        fee === undefined ? undefined : t('loading', { currency });
      let strTime = t('feeRate.waitingForEstimates');

      if (btcFiat !== undefined && fee !== undefined) {
        //const amount = (feeRate * txSize * btcFiat) / 1e8;
        const amount = fee;
        strBtcFiat = t('feeRate.fee', {
          amount: formatBtc({ amount, subUnit, btcFiat, locale, currency })
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
              blocks: formatBlocks(target, t, locale)
            });
        }
      }

      return strBtcFiat === undefined
        ? strTime
        : `${strBtcFiat}
${strTime}`;
    },
    args => JSON.stringify(args)
  )
);

export const formatFeeRate = (
  feeRateArgs: {
    fee: number | undefined;
    feeRate: number;
    btcFiat: number | undefined;
    subUnit: SubUnit;
    locale: string;
    currency: Currency;
    feeEstimates: FeeEstimates | undefined;
  },
  t: TFunction
) => formatFeeRateFactory(t)(feeRateArgs);
