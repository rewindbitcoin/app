// Copyright (C) 2025 Jose-Luis Landabaso - https://rewindbitcoin.com
// Licensed under the GNU GPL v3 or later. See the LICENSE file for details.

const MAX_SAFE_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);
const MIN_SAFE_BIGINT = BigInt(Number.MIN_SAFE_INTEGER);

export const satsToNumber = (
  value: bigint | number,
  label = 'sats'
): number => {
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value))
      throw new Error(`${label} must be a safe integer: ${value}`);
    return value;
  }
  if (value > MAX_SAFE_BIGINT || value < MIN_SAFE_BIGINT)
    throw new Error(`${label} is out of Number safe range: ${value}`);
  return Number(value);
};

export const satsToNumberOrUndefined = (
  value: bigint | number | undefined,
  label = 'sats'
): number | undefined => {
  if (value === undefined) return undefined;
  return satsToNumber(value, label);
};

export const numberToSats = (value: number, label = 'sats'): bigint => {
  if (!Number.isSafeInteger(value))
    throw new Error(`${label} must be a safe integer: ${value}`);
  return BigInt(value);
};
