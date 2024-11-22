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
 * Picks a fee rate in satoshis per virtual byte (vbyte) based on:
 * - A record object mapping fee rates to their respective block confirmation targets.
 * - The desired wait time in seconds for the transaction to be confirmed.
 *
 * The method selects the fee rate corresponding to the block target that matches
 * the desired wait time (`targetTime`) or, if unavailable, the next fastest
 * available target. If no valid fee rate can be found for the `targetTime`, the
 * method defaults to the fastest available target defined in `feeEstimates`, even
 * if this corresponds to a slower confirmation time than the requested `targetTime`.
 *
 * Example:
 * - If the `targetTime` is set to 19 minutes, the fee rate for the next block
 *   (10 minutes) is returned instead of the second block (20 minutes).
 * - If no fee estimates are available for a 1-block confirmation target, the method
 *   will return the fee rate for the fastest available block target in `feeEstimates`.
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
  ): { block: number; feeEstimate: number } => {
    if (!Number.isSafeInteger(targetTime) || targetTime < 0)
      throw new Error(`Invalid targetTime: ${targetTime}!`);

    const targetBlock = Math.max(targetTime / 600 + Number.EPSILON, 1);

    // Sort block targets in descending order (slower targets first)
    const sortedBlocks = Object.keys(feeEstimates)
      .map(block => Number(block))
      .sort((a, b) => b - a);

    // Find the largest block target less than or equal to targetBlock
    const block =
      sortedBlocks.find(block => block <= targetBlock) ||
      sortedBlocks[sortedBlocks.length - 1]; // Fallback: fastest block target (smallest block number)

    if (typeof block === 'undefined') {
      throw new Error(
        `Could not find a block for targetTime ${targetTime} amongst ${Object.keys(feeEstimates).length} fees: ${JSON.stringify(feeEstimates)}`
      );
    }
    const feeEstimate = feeEstimates[block];
    if (feeEstimate === undefined)
      throw new Error(
        `Error in pickFeeEstimate: feeEstimate undefined for block ${block}`
      );

    return { block, feeEstimate };
  }
);

/**
 * Prevents users selecting fees too large
 */
export const computeMaxAllowedFeeRate = (feeEstimates: FeeEstimates) =>
  2 * Math.max(...Object.values(feeEstimates));
