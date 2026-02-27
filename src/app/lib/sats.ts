// Copyright (C) 2025 Jose-Luis Landabaso - https://rewindbitcoin.com
// Licensed under the GNU GPL v3 or later. See the LICENSE file for details.

const MAX_SAFE_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);
const MIN_SAFE_BIGINT = BigInt(Number.MIN_SAFE_INTEGER);

export const toNumber = (value: bigint): number => {
  if (value > MAX_SAFE_BIGINT || value < MIN_SAFE_BIGINT)
    throw new Error(`BigInt value is out of Number safe range: ${value}`);
  return Number(value);
};

export const toNumberOrUndefined = (
  value: bigint | undefined
): number | undefined => {
  if (value === undefined) return undefined;
  return toNumber(value);
};

export const toBigInt = (value: number): bigint => {
  if (!Number.isSafeInteger(value))
    throw new Error(`Expected a safe integer number, received: ${value}`);
  return BigInt(value);
};
