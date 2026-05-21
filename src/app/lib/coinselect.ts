// Copyright (C) 2026 Jose-Luis Landabaso - https://rewindbitcoin.com
// Licensed under the GNU GPL v3 or later. See the LICENSE file for details.

import {
  coinselect as baseCoinselect,
  DUST_RELAY_FEE_RATE,
  dustThreshold,
  maxFunds as baseMaxFunds,
  MAX_FEE_RATE,
  MIN_FEE_RATE,
  type OutputWithValue,
  vsize
} from '@bitcoinerlab/coinselect';
import type { OutputInstance } from '@bitcoinerlab/descriptors';

export { dustThreshold, vsize };
export type { OutputWithValue };

type CoinselectParams = {
  /** Candidate inputs. If `coinControl` is true, every input here is mandatory. */
  utxos: Array<OutputWithValue>;
  /** Fixed outputs that must be funded before optional change/remainder. */
  targets: Array<OutputWithValue>;
  /** Change output for `coinselect`; recipient output for `maxFunds`. */
  remainder: OutputInstance;
  /** Target fee rate in sat/vB. */
  feeRate: number;
  /** Minimum accepted final fee rate. Defaults to the package relay floor. */
  minimumFeeRate?: number;
  /** Dust relay fee rate used for fixed target and change dust checks. */
  dustRelayFeeRate?: number;
  /**
   * When true, `utxos` is the exact manual UTXO selection from the user.
   * Coin selection must spend every provided UTXO and no others.
   */
  coinControl: boolean;
};

const sumValues = (items: Array<OutputWithValue>) =>
  items.reduce((sum, item) => sum + item.value, BigInt(0));

const validateOutputWithValues = (
  outputWithValues: Array<OutputWithValue>,
  label: string
) => {
  if (outputWithValues.length === 0)
    throw new Error(`${label} cannot be empty`);
  for (const { value } of outputWithValues) {
    if (
      typeof value !== 'bigint' ||
      value < BigInt(0) ||
      value > BigInt(100000000000000)
    )
      throw new Error(`${label} value ${value} not supported`);
  }
};

const validateFeeRate = (feeRate: number, minimumFeeRate = MIN_FEE_RATE) => {
  if (
    !Number.isFinite(minimumFeeRate) ||
    minimumFeeRate < 0 ||
    minimumFeeRate > MAX_FEE_RATE
  )
    throw new Error(`Minimum fee rate ${minimumFeeRate} not supported`);
  if (
    !Number.isFinite(feeRate) ||
    feeRate < minimumFeeRate ||
    feeRate > MAX_FEE_RATE
  )
    throw new Error(`Fee rate ${feeRate} not supported`);
};

const validateTargets = (
  targets: Array<OutputWithValue>,
  dustRelayFeeRate: number
) => {
  validateOutputWithValues(targets, 'targets');
  for (const [index, target] of targets.entries()) {
    if (target.value < dustThreshold(target.output, dustRelayFeeRate))
      throw new Error(`Target #${index} is dusty`);
  }
};

const getValidatedFeeAndVSize = ({
  utxos,
  targets,
  feeRate,
  minimumFeeRate
}: {
  utxos: Array<OutputWithValue>;
  targets: Array<OutputWithValue>;
  feeRate: number;
  minimumFeeRate: number;
}) => {
  const fee = sumValues(utxos) - sumValues(targets);
  if (fee < BigInt(0)) return;
  const selectedVSize = vsize(
    utxos.map(utxo => utxo.output),
    targets.map(target => target.output)
  );
  const requiredFee = BigInt(Math.ceil(selectedVSize * feeRate));
  if (fee < requiredFee) return;
  validateFeeRate(Number(fee) / selectedVSize, minimumFeeRate);
  return { fee, vsize: selectedVSize };
};

const manualCoinselect = ({
  utxos,
  targets,
  remainder,
  feeRate,
  minimumFeeRate = MIN_FEE_RATE,
  dustRelayFeeRate = DUST_RELAY_FEE_RATE
}: Omit<CoinselectParams, 'coinControl'>): ReturnType<
  typeof baseCoinselect
> => {
  validateOutputWithValues(utxos, 'utxos');
  validateTargets(targets, dustRelayFeeRate);
  validateFeeRate(feeRate, minimumFeeRate);
  validateFeeRate(dustRelayFeeRate);

  const selectedValue = sumValues(utxos);
  const fixedTargetValue = sumValues(targets);
  const changeVSize = vsize(
    utxos.map(utxo => utxo.output),
    [...targets.map(target => target.output), remainder]
  );
  const changeFee = BigInt(Math.ceil(changeVSize * feeRate));
  const changeValue = selectedValue - fixedTargetValue - changeFee;

  if (changeValue >= dustThreshold(remainder, dustRelayFeeRate)) {
    const targetsWithChange = [
      ...targets,
      { output: remainder, value: changeValue }
    ];
    const feeAndVSize = getValidatedFeeAndVSize({
      utxos,
      targets: targetsWithChange,
      feeRate,
      minimumFeeRate
    });
    if (feeAndVSize)
      return { utxos, targets: targetsWithChange, ...feeAndVSize };
  }

  const feeAndVSize = getValidatedFeeAndVSize({
    utxos,
    targets,
    feeRate,
    minimumFeeRate
  });
  if (!feeAndVSize) return;
  return { utxos, targets, ...feeAndVSize };
};

const manualMaxFunds = ({
  utxos,
  targets,
  remainder,
  feeRate,
  minimumFeeRate = MIN_FEE_RATE,
  dustRelayFeeRate = DUST_RELAY_FEE_RATE
}: Omit<CoinselectParams, 'coinControl'>): ReturnType<typeof baseMaxFunds> => {
  validateOutputWithValues(utxos, 'utxos');
  if (targets.length) validateOutputWithValues(targets, 'targets');
  for (const [index, target] of targets.entries()) {
    if (target.value < dustThreshold(target.output, dustRelayFeeRate))
      throw new Error(`Target #${index} is dusty`);
  }
  validateFeeRate(feeRate, minimumFeeRate);
  validateFeeRate(dustRelayFeeRate);

  const fixedTargetValue = sumValues(targets);
  const selectedValue = sumValues(utxos);
  const outputVSize = vsize(
    utxos.map(utxo => utxo.output),
    [...targets.map(target => target.output), remainder]
  );
  const fee = BigInt(Math.ceil(outputVSize * feeRate));
  const remainderValue = selectedValue - fixedTargetValue - fee;
  if (remainderValue < dustThreshold(remainder, dustRelayFeeRate)) return;

  const finalTargets = [
    ...targets,
    { output: remainder, value: remainderValue }
  ];
  const feeAndVSize = getValidatedFeeAndVSize({
    utxos,
    targets: finalTargets,
    feeRate,
    minimumFeeRate
  });
  if (!feeAndVSize) return;
  return { utxos, targets: finalTargets, ...feeAndVSize };
};

export const coinselect = (params: CoinselectParams) => {
  const { coinControl, ...baseParams } = params;
  if (!coinControl) return baseCoinselect(baseParams);
  return manualCoinselect(baseParams);
};

export const maxFunds = (params: CoinselectParams) => {
  const { coinControl, ...baseParams } = params;
  if (!coinControl) return baseMaxFunds(baseParams);
  return manualMaxFunds(baseParams);
};
