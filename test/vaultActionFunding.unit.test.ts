// Copyright (C) 2026 Jose-Luis Landabaso - https://rewindbitcoin.com
// Licensed under the GNU GPL v3 or later. See the LICENSE file for details.

import { getVaultActionFunding } from '../dist/src/app/lib/vaultActionFunding';

const base = {
  role: 'TRIGGER' as const,
  selectedFeeRate: 0.1,
  recommendedFeeRate: 1000,
  canBuildSelected: true,
  canBuildRecommended: false,
  canBuildRecommendedWithAutomaticCoins: false,
  manualSelectionNeedsRecovery: false,
  hasUsableWalletFunds: false,
  canBuildSelectedAfterConfirmation: false,
  walletSupplementRequested: false
};

test('a fundable low fee only shows an advisory, not a request for more funds', () => {
  expect(getVaultActionFunding(base)).toEqual({
    notice: 'belowRecommended',
    action: null,
    targetFeeRate: null
  });
});

test('offers wallet permission only when the selected fee needs it and usable funds exist', () => {
  expect(
    getVaultActionFunding({ ...base, hasUsableWalletFunds: true }).action
  ).toBeNull();
  expect(
    getVaultActionFunding({
      ...base,
      canBuildSelected: false,
      hasUsableWalletFunds: true
    }).action
  ).toBe('wallet');
  expect(
    getVaultActionFunding({
      ...base,
      canBuildSelected: false,
      hasUsableWalletFunds: true,
      walletSupplementRequested: true
    }).action
  ).toBe('receive');
});

test('pending funds needed for the selected fee ask the user to wait, not deposit again', () => {
  expect(
    getVaultActionFunding({
      ...base,
      canBuildSelected: false,
      canBuildSelectedAfterConfirmation: true
    }).action
  ).toBe('wait');
  expect(
    getVaultActionFunding({
      ...base,
      canBuildSelected: false,
      hasUsableWalletFunds: true,
      walletSupplementRequested: true,
      canBuildSelectedAfterConfirmation: true
    }).action
  ).toBe('wait');
  expect(
    getVaultActionFunding({
      ...base,
      canBuildSelected: false,
      hasUsableWalletFunds: true,
      walletSupplementRequested: true,
      canBuildSelectedAfterConfirmation: false
    }).action
  ).toBe('receive');
});

test('an unbuildable choice funds the selected target, not another recommendation', () => {
  expect(
    getVaultActionFunding({
      ...base,
      selectedFeeRate: 150,
      recommendedFeeRate: 100,
      canBuildSelected: false
    }).targetFeeRate
  ).toBe(150);
});

test('manual coin recovery takes precedence over asking for a deposit', () => {
  expect(
    getVaultActionFunding({
      ...base,
      canBuildSelected: false,
      manualSelectionNeedsRecovery: true
    }).action
  ).toBe('coins');
});

test('manual coins can optionally be expanded to fund the recommendation', () => {
  expect(
    getVaultActionFunding({
      ...base,
      canBuildRecommendedWithAutomaticCoins: true
    })
  ).toEqual({
    notice: 'belowRecommended',
    action: 'coins',
    targetFeeRate: 1000
  });
});

test('rescue never offers ordinary wallet funds', () => {
  expect(
    getVaultActionFunding({
      ...base,
      role: 'RESCUE',
      hasUsableWalletFunds: true,
      canBuildRecommendedWithAutomaticCoins: true
    }).action
  ).toBe('reserve');
});

test('invalid input does not silently become a funding recommendation', () => {
  expect(
    getVaultActionFunding({ ...base, selectedFeeRate: null }).notice
  ).toBeNull();
});

test('a fully fundable recommendation needs no funding prompt', () => {
  expect(
    getVaultActionFunding({ ...base, canBuildRecommended: true }).notice
  ).toBeNull();
});
