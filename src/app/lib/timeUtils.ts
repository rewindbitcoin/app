// Copyright (C) 2025 Jose-Luis Landabaso - https://rewindbitcoin.com
// Licensed under the GNU GPL v3 or later. See the LICENSE file for details.

const DAYS_DECIMALS = 0;
export const fromBlocks = (blocks: number, mode: 'days' | 'blocks') => {
  if (mode === 'blocks') return blocks;
  const days =
    Math.round((blocks * Math.pow(10, DAYS_DECIMALS)) / (6 * 24)) /
    Math.pow(10, DAYS_DECIMALS);
  return days;
};
export const toBlocks = (
  value: number,
  fromMode: 'days' | 'blocks',
  /** pass known values, when available so that precission
   * is not loosed*/
  knownBlocksValueMap: {
    [value: number]: number;
  }
) => {
  if (fromMode === 'blocks') return value;
  else {
    const knownBlocksValue = knownBlocksValueMap[value];
    if (knownBlocksValue !== undefined) return knownBlocksValue;
    else return value * 6 * 24;
  }
};
export const getBlocksModeStep = (mode: 'days' | 'blocks') =>
  mode === 'blocks' ? 1 : 1 / Math.pow(10, DAYS_DECIMALS);
