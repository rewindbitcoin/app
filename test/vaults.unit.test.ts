// Copyright (C) 2025 Jose-Luis Landabaso - https://rewindbitcoin.com
// Licensed under the GNU GPL v3 or later. See the LICENSE file for details.

import { fixtures } from './fixtutres';
import {
  getHotDescriptors,
  getVaultMode,
  type Vault,
  type Vaults,
  type VaultsStatuses
} from '../dist/src/app/lib/vaults';
import { type Accounts } from '../dist/src/app/lib/wallets';

describe('vaults unit tests', () => {
  const { expected } = fixtures.edge2edge;

  test('getHotDescriptors with no vaults', () => {
    const vaults: Vaults = {};
    const vaultsStatuses: VaultsStatuses = {};
    const defaultAccount = expected.defaultAccount;
    const accounts: Accounts = { [defaultAccount]: { discard: false } };
    const tipHeight = 100;

    const descriptors = getHotDescriptors(
      vaults,
      vaultsStatuses,
      accounts,
      tipHeight
    );
    expect(descriptors).toEqual(expected.descriptors);
  });

  test('getVaultMode respects legacy and rewind2 tags', () => {
    const rewind2Vault = {
      networkId: 'BITCOIN',
      vaultMode: 'NON_TRUC'
    } as unknown as Vault;
    expect(getVaultMode(rewind2Vault)).toBe('NON_TRUC');

    const rewind2LegacyRecordNoMode = {
      networkId: 'BITCOIN'
    } as unknown as Vault;
    expect(getVaultMode(rewind2LegacyRecordNoMode)).toBe('LEGACY');

    const legacyVault = {
      networkId: 'BITCOIN'
    } as unknown as Vault;
    expect(getVaultMode(legacyVault)).toBe('LEGACY');
  });
});
