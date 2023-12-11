import { formatFiat } from './btcRates';
import type { Locale, Currency } from '../contexts/SettingsContext';

import type { TFunction } from 'i18next';
import memoize from 'lodash.memoize';

/**
 * Returns an array of precomputed `feeRates` within a range.
 *
 * @returns An array of numbers containing the sampled fee rates.
 */
export type FeeEstimates = Record<string, number>;
export function feeRateSampling(
  {
    minSatsPerByte = 1,
    maxSatsPerByte = 10000,
    samples = 100,
    logScale = true
  }: {
    /**
     * The minimum fee rate in satoshis per byte.
     * Must be >= 1 and <= 1E6.
     * @defaultValue 1
     */
    minSatsPerByte?: number;
    /**
     * The maximum fee rate in satoshis per byte.
     * Must be >= minSatsPerByte and <= 1E6.
     * @defaultValue 10000, which is 10 times larger than 22-dec-2017 fee rates
     */
    maxSatsPerByte?: number;
    /**
     * The number of fee rate samples to generate.
     * Must be an integer, 2 <= samples <= 1E5.
     * @defaultValue 100
     */
    samples?: number;
    /**
     * Whether to use logarithmic (`true`) or linear scale (`false`).
     * Default is `true`, which allows more granularity for lower fee rates.
     * @defaultValue true
     */
    logScale?: boolean;
  } = {
    minSatsPerByte: 1,
    maxSatsPerByte: 10000,
    samples: 100,
    logScale: true
  }
) {
  const result: Array<number> = [];

  if (minSatsPerByte < 1 || minSatsPerByte > 1e6)
    throw new Error('Invalid minSatsPerByte');
  if (maxSatsPerByte < minSatsPerByte || maxSatsPerByte > 1e6)
    throw new Error('Invalid maxSatsPerByte');
  if (!Number.isSafeInteger(samples) || samples < 2 || samples > 1e5)
    throw new Error('Invalid samples');

  if (logScale) {
    result.push(minSatsPerByte);
    const f = Math.pow(maxSatsPerByte / minSatsPerByte, 1 / --samples);
    while (--samples) {
      const prevResult = result[result.length - 1];
      if (!prevResult) throw new Error('Invalid result');
      result.push(prevResult * f);
    }
    result.push(maxSatsPerByte);
  } else {
    for (
      let i = minSatsPerByte;
      i <= maxSatsPerByte;
      i += (maxSatsPerByte - minSatsPerByte) / (samples - 1)
    )
      result.push(i);
  }

  return result;
}

/**
 *  Picks a fee rate in satoshis per virtual byte (vbyte), given:
 * - A record object mapping different fee rates to their respective block
 *   confirmations.
 * - The desired wait time in seconds for the transaction to be confirmed.
 *
 * The method selects the fee rate for the earliest possible block, rather than
 * the closest one, to conservatively estimate higher fees. For instance, if the
 * target time is set to 19 minutes, the fee rate for the next block is returned
 * instead of the second block.
 *
 * If the user enters a targetTime below 10 minutes this method returns the
 * fee for 1 block confirmation, even if 10 > targetTime.
 *
 * Assumes an average block time of 10 minutes.
 * This method assumes 10 minute blocks.
 * @returns The fee rate in sats per vbyte.
 */
export function pickFeeEstimate(
  /** A record of fee estimates per number of blocks. */
  feeEstimates: Record<string, number>,
  /** The target time in seconds for the transaction to be mined. */
  targetTime: number
): number {
  if (!Number.isSafeInteger(targetTime) || targetTime < 0)
    throw new Error('Invalid targetTime!');

  const block = Object.keys(feeEstimates)
    .map(block => Number(block))
    .sort((a, b) => b - a) // sort in descending order
    .find(block => block <= Math.max(targetTime / 600 + Number.EPSILON, 1));
  if (typeof block === 'undefined') {
    throw new Error('Invalid targetTime!');
  }
  const feeEstimate = feeEstimates[block];
  if (feeEstimate === undefined) throw new Error('Error in pickFeeEstimate');

  return feeEstimate;
}

const formatLockTimeFactory = memoize((t: TFunction) =>
  memoize((blocks: number) =>
    t('vaultSetup.securityLockTimeDescription', {
      blocks: formatBlocks(blocks, t)
    })
  )
);
export const formatLockTime = (blocks: number, t: TFunction) =>
  formatLockTimeFactory(t)(blocks);

const formatBlocksFactory = memoize((t: TFunction) =>
  memoize((blocks: number) => {
    const averageBlockTimeInMinutes = 10;
    const timeInMinutes = blocks * averageBlockTimeInMinutes;
    const rawTimeInHours = timeInMinutes / 60;
    const rawTimeInDays = timeInMinutes / 1440;

    if (timeInMinutes < 60) {
      return t('timeEstimate.minutes', {
        count: timeInMinutes,
        formattedCount: timeInMinutes.toFixed(1)
      });
    } else if (timeInMinutes < 1440) {
      return t('timeEstimate.hours', {
        count: rawTimeInHours,
        formattedCount: rawTimeInHours.toFixed(1)
      });
    } else {
      return t('timeEstimate.days', {
        count: rawTimeInDays,
        formattedCount: rawTimeInDays.toFixed(1)
      });
    }
  })
);

export const formatBlocks = (blocks: number, t: TFunction) =>
  formatBlocksFactory(t)(blocks);

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
      btcFiat: number | null;
      locale: Locale;
      currency: Currency;
      feeEstimates: FeeEstimates | null;
    }) => {
      let strBtcFiat =
        txSize === null ? null : t('feeRate.waitingForRates', { currency });
      let strTime = t('feeRate.waitingForEstimates');

      if (btcFiat !== null && txSize !== null) {
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
    btcFiat: number | null;
    locale: Locale;
    currency: Currency;
    feeEstimates: FeeEstimates | null;
  },
  t: TFunction
) => formatFeeRateFactory(t)(feeRateArgs);
