import { formatFiat } from './btcRates';
import type { Locale, Currency } from '../contexts/SettingsContext';

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
      if (!prevResult) throw new Error(`Error: invalid result`);
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

export const formatBlocks = (blocks: number): string => {
  const averageBlockTimeInMinutes = 10;

  const timeInMinutes = blocks * averageBlockTimeInMinutes;
  let timeEstimate = '';

  if (timeInMinutes < 60) {
    timeEstimate = `~${timeInMinutes} min${timeInMinutes > 1 ? 's' : ''}`;
  } else if (timeInMinutes < 1440) {
    // Less than a day
    const timeInHours = (timeInMinutes / 60).toFixed(1);
    timeEstimate = `~${timeInHours} hour${timeInHours === '1.0' ? '' : 's'}`;
  } else {
    const timeInDays = (timeInMinutes / 1440).toFixed(1);
    timeEstimate = `~${timeInDays} day${timeInDays === '1.0' ? '' : 's'}`;
  }
  return timeEstimate;
};

export const formatFeeRate = ({
  feeRate,
  txSize,
  btcFiat,
  locale,
  currency,
  feeEstimates
}: {
  feeRate: number;
  txSize: number;
  btcFiat: number | null;
  locale: Locale;
  currency: Currency;
  feeEstimates: FeeEstimates | null;
}) => {
  let strBtcFiat = `Waiting for BTC/${currency} rates...`;
  let strTime = `Waiting for fee estimates...`;
  if (btcFiat !== null) {
    const amount = (feeRate * txSize * btcFiat) / 1e8;
    strBtcFiat = `Fee: ${formatFiat({ amount, locale, currency })}`;
  }
  if (feeEstimates && Object.keys(feeEstimates).length) {
    // Convert the feeEstimates object keys to numbers and sort them
    const sortedEstimates = Object.keys(feeEstimates)
      .map(Number)
      .sort((a, b) => feeEstimates[a]! - feeEstimates[b]!);

    //Find confirmation target with closest higher fee rate than given feeRate
    const target = sortedEstimates.find(
      estimate => feeEstimates[estimate]! >= feeRate
    );

    if (target !== undefined) strTime = `Confirms in ${formatBlocks(target)}`;
    // If the provided fee rate is lower than any estimate,
    // it's not possible to estimate the time
    else strTime = `Express confirmation`;
  }
  return `${strTime} / ${strBtcFiat}`;
};
