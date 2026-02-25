// Copyright (C) 2025 Jose-Luis Landabaso - https://rewindbitcoin.com
// Licensed under the GNU GPL v3 or later. See the LICENSE file for details.

const MAX_SAFE_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);
const MIN_SAFE_BIGINT = BigInt(Number.MIN_SAFE_INTEGER);
const DECIMAL_SATS_REGEX = /^-?\d+$/;

export const satsFromNumber = (value: number, label = 'sats'): bigint => {
  if (!Number.isSafeInteger(value))
    throw new Error(`${label} must be a safe integer: ${value}`);
  return BigInt(value);
};

export const satsFromString = (value: string, label = 'sats'): bigint => {
  if (!DECIMAL_SATS_REGEX.test(value))
    throw new Error(`${label} must be a base-10 integer string: ${value}`);
  return BigInt(value);
};

export const toSats = (
  value: bigint | number | string,
  label = 'sats'
): bigint => {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') return satsFromNumber(value, label);
  return satsFromString(value, label);
};

export const satsToString = (value: bigint | number, label = 'sats'): string =>
  toSats(value, label).toString();

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

export const numberToSats = satsFromNumber;
