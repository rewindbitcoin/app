import moize from 'moize';
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
export const pickFeeEstimate = moize(
  (
    /** A record of fee estimates per number of blocks. */
    feeEstimates: FeeEstimates,
    /** The target time in seconds for the transaction to be mined. */
    targetTime: number
  ) => {
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
);

/**
 * Prevents users selecting fees too large
 */
export const computeMaxAllowedFeeRate = (feeEstimates: FeeEstimates) =>
  2 * Math.max(...Object.values(feeEstimates));
