// Copyright (C) 2025 Jose-Luis Landabaso - https://rewindbitcoin.com
// Licensed under the GNU GPL v3 or later. See the LICENSE file for details.

import { fixtures } from './fixtutres';
import {
  getHotDescriptors,
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
});
