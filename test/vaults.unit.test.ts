// Copyright (C) 2025 Jose-Luis Landabaso - https://rewindbitcoin.com
// Licensed under the GNU GPL v3 or later. See the LICENSE file for details.

import { fixtures } from './fixtutres';
import {
  getHotDescriptors,
  getPanicAnchorOutputIndex,
  getTriggerAnchorOutputIndex,
  getVaultMode,
  type Vault,
  type Vaults,
  type VaultsStatuses
} from '../dist/src/app/lib/vaults';
import { type Accounts } from '../dist/src/app/lib/wallets';
import { Transaction } from 'bitcoinjs-lib';
import { fromHex } from 'uint8array-tools';

/** Builds a tiny synthetic tx for vault mode inference tests. */
const createSyntheticTxHex = ({
  version,
  mainOutputValue,
  p2aValue
}: {
  version: number;
  mainOutputValue: number;
  p2aValue?: number;
}) => {
  const tx = new Transaction();
  tx.version = version;
  tx.addInput(new Uint8Array(32), 0);
  tx.addOutput(fromHex(`0014${'00'.repeat(20)}`), BigInt(mainOutputValue));
  if (p2aValue !== undefined)
    tx.addOutput(fromHex('51024e73'), BigInt(p2aValue));
  return tx.toHex();
};

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

  test('getVaultMode infers TRUC from version 3 + 0-sat P2A', () => {
    const triggerTxHex = createSyntheticTxHex({
      version: 3,
      mainOutputValue: 10000,
      p2aValue: 0
    });
    const vault = {
      triggerMap: { [triggerTxHex]: [] }
    } as unknown as Vault;
    expect(getVaultMode(vault)).toBe('TRUC');
    expect(getTriggerAnchorOutputIndex(triggerTxHex)).toBe(1);
  });

  test('getVaultMode infers NON_TRUC from non-zero P2A anchor', () => {
    const triggerTxHex = createSyntheticTxHex({
      version: 2,
      mainOutputValue: 10000,
      p2aValue: 330
    });
    const panicTxHex = createSyntheticTxHex({
      version: 2,
      mainOutputValue: 9000,
      p2aValue: 330
    });
    const vault = {
      triggerMap: { [triggerTxHex]: [panicTxHex] }
    } as unknown as Vault;
    expect(getVaultMode(vault)).toBe('NON_TRUC');
    expect(getTriggerAnchorOutputIndex(triggerTxHex)).toBe(1);
    expect(getPanicAnchorOutputIndex(panicTxHex)).toBe(1);
  });

  test('getVaultMode falls back to LEGACY when no P2A output exists', () => {
    const legacyTriggerTxHex = createSyntheticTxHex({
      version: 2,
      mainOutputValue: 10000
    });
    const legacyVault = {
      triggerMap: { [legacyTriggerTxHex]: [] }
    } as unknown as Vault;
    expect(getVaultMode(legacyVault)).toBe('LEGACY');
    expect(getTriggerAnchorOutputIndex(legacyTriggerTxHex)).toBeUndefined();
  });
});
