// Copyright (C) 2025 Jose-Luis Landabaso - https://rewindbitcoin.com
// Licensed under the GNU GPL v3 or later. See the LICENSE file for details.

import { fixtures } from './fixtutres';
import {
  estimateCpfpPackage,
  estimateMinimumRequiredVaultedAmount,
  getHotDescriptors,
  getPanicAnchorOutputIndex,
  getTriggerAnchorOutputIndex,
  getVaultMode,
  type UtxosData,
  type Vault,
  type Vaults,
  type VaultsStatuses
} from '../dist/src/app/lib/vaults';
import { type Accounts } from '../dist/src/app/lib/wallets';
import { networks, Transaction } from 'bitcoinjs-lib';
import { fromHex } from 'uint8array-tools';
import {
  createServiceOutput,
  DUMMY_SERVICE_ADDRESS
} from '../dist/src/app/lib/vaultDescriptors';

const NON_TRUC_P2A_ANCHOR_VALUE = 330; //FIXME: verify this is ok - better make this dynamic?

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

const createSyntheticUtxoData = (value: number): UtxosData[number] => {
  const network = networks.regtest;
  const output = createServiceOutput(DUMMY_SERVICE_ADDRESS(network), network);
  const tx = new Transaction();
  tx.version = 2;
  tx.addInput(new Uint8Array(32), 0);
  tx.addOutput(fromHex(`0014${'00'.repeat(20)}`), BigInt(value));
  return {
    tx,
    txHex: tx.toHex(),
    vout: 0,
    output
  };
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
      p2aValue: NON_TRUC_P2A_ANCHOR_VALUE
    });
    const panicTxHex = createSyntheticTxHex({
      version: 2,
      mainOutputValue: 9000,
      p2aValue: NON_TRUC_P2A_ANCHOR_VALUE
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

  test('estimateCpfpPackage computes effective package fee data', () => {
    const network = networks.regtest;
    const changeOutput = createServiceOutput(
      DUMMY_SERVICE_ADDRESS(network),
      network
    );
    const parentTxHex = createSyntheticTxHex({
      version: 2,
      mainOutputValue: 12000,
      p2aValue: NON_TRUC_P2A_ANCHOR_VALUE
    });
    const plan = estimateCpfpPackage({
      parentTxHex,
      parentFee: 120,
      targetEffectiveFeeRate: 2,
      optionalUtxosData: [createSyntheticUtxoData(3000)],
      changeOutput
    });

    expect(plan).toBeDefined();
    if (!plan) throw new Error('Expected CPFP plan');
    expect(plan.parentTxHex).toBe(parentTxHex);
    expect(plan.anchorValue).toBe(NON_TRUC_P2A_ANCHOR_VALUE);
    expect(plan.childFee).toBeGreaterThanOrEqual(0);
    expect(plan.childOutputValue).toBeGreaterThan(0);
    expect(plan.effectiveFeeRate).toBeGreaterThanOrEqual(2);
  });

  test('estimateCpfpPackage returns undefined for legacy parent tx', () => {
    const network = networks.regtest;
    const changeOutput = createServiceOutput(
      DUMMY_SERVICE_ADDRESS(network),
      network
    );
    const parentTxHex = createSyntheticTxHex({
      version: 2,
      mainOutputValue: 12000
    });
    const plan = estimateCpfpPackage({
      parentTxHex,
      parentFee: 120,
      targetEffectiveFeeRate: 2,
      optionalUtxosData: [createSyntheticUtxoData(3000)],
      changeOutput
    });
    expect(plan).toBeUndefined();
  });

  test('higher presigned trigger fee raises the minimum vaulted amount', () => {
    const coldAddress = DUMMY_SERVICE_ADDRESS(networks.regtest);
    const minimumAtRelayFloor = estimateMinimumRequiredVaultedAmount({
      coldAddress,
      lockBlocks: 144,
      network: networks.regtest,
      vaultMode: 'TRUC',
      presignedTriggerFeeRate: 0.1
    });
    const minimumAtHighTriggerFee = estimateMinimumRequiredVaultedAmount({
      coldAddress,
      lockBlocks: 144,
      network: networks.regtest,
      vaultMode: 'TRUC',
      presignedTriggerFeeRate: 10
    });

    expect(minimumAtHighTriggerFee).toBeGreaterThan(minimumAtRelayFloor);
  });

  test('estimateCpfpPackage enforces TRUC child size limit', () => {
    const network = networks.regtest;
    const changeOutput = createServiceOutput(
      DUMMY_SERVICE_ADDRESS(network),
      network
    );
    const parentTxHex = createSyntheticTxHex({
      version: 3,
      mainOutputValue: 12000,
      p2aValue: 0
    });
    const utxosData = Array.from({ length: 200 }, () =>
      createSyntheticUtxoData(100)
    );
    const plan = estimateCpfpPackage({
      parentTxHex,
      parentFee: 0,
      targetEffectiveFeeRate: 120,
      optionalUtxosData: utxosData,
      changeOutput
    });
    expect(plan).toBeUndefined();
  });
});
