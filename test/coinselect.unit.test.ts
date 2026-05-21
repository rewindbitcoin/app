// Copyright (C) 2026 Jose-Luis Landabaso - https://rewindbitcoin.com
// Licensed under the GNU GPL v3 or later. See the LICENSE file for details.

import { coinselect as baseCoinselect } from '@bitcoinerlab/coinselect';
import { coinselect, maxFunds } from '../dist/src/app/lib/coinselect';
import { DUMMY_PKH_OUTPUT } from '../dist/src/app/lib/vaultDescriptors';

const output = DUMMY_PKH_OUTPUT();
const utxo = (value: number) => ({ output, value: BigInt(value) });
const target = (value: number) => ({ output, value: BigInt(value) });

describe('coinselect wrapper', () => {
  test('delegates to package coinselect when coin control is disabled', () => {
    const params = {
      utxos: [utxo(2000), utxo(10000)],
      targets: [target(1000)],
      remainder: output,
      feeRate: 1
    };

    expect(coinselect({ ...params, coinControl: false })).toEqual(
      baseCoinselect(params)
    );
  });

  test('spends every provided utxo when coin control is enabled', () => {
    const utxos = [utxo(3000), utxo(4000)];
    const result = coinselect({
      utxos,
      targets: [target(1000)],
      remainder: output,
      feeRate: 1,
      coinControl: true
    });

    expect(result?.utxos).toBe(utxos);
    expect(result?.targets.length).toBe(2);
  });

  test('returns undefined when exact utxos cannot fund the targets', () => {
    const result = coinselect({
      utxos: [utxo(1000)],
      targets: [target(1000)],
      remainder: output,
      feeRate: 1,
      coinControl: true
    });

    expect(result).toBeUndefined();
  });

  test('omits dusty change and leaves it as fee', () => {
    const result = coinselect({
      utxos: [utxo(1220)],
      targets: [target(1000)],
      remainder: output,
      feeRate: 1,
      coinControl: true
    });

    expect(result?.targets).toEqual([target(1000)]);
    expect(result?.fee).toBe(BigInt(220));
  });

  test('maxFunds spends every provided utxo when coin control is enabled', () => {
    const utxos = [utxo(3000), utxo(4000)];
    const result = maxFunds({
      utxos,
      targets: [],
      remainder: output,
      feeRate: 1,
      coinControl: true
    });

    expect(result?.utxos).toBe(utxos);
    expect(result?.targets.length).toBe(1);
    expect(result?.targets[0]?.value).toBeGreaterThan(BigInt(0));
  });
});
