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
import { networks, type Network, Transaction } from 'bitcoinjs-lib';
import { fromHex } from 'uint8array-tools';
import { createAddressOutput } from '../dist/src/app/lib/vaultDescriptors';

const P2A_NON_TRUC_ANCHOR_VALUE = 330; //FIXME: verify this is ok - better make this dynamic?

const DUMMY_ADDRESS = (network: Network) => {
  if (network === networks.bitcoin)
    return 'bc1qp2u85wn9cekkw3khr3trpsznakhhfkekpk2mld';
  if (network === networks.regtest)
    return 'bcrt1qq7m6la3syc6wk5fglznegngxe5lhy8aajevva9';
  if (network === networks.testnet)
    return 'tb1qm0k9mn48uqfs2w9gssvzmus4j8srrx5eje7wpf';
  throw new Error('Network not supported');
};

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
  const output = createAddressOutput(DUMMY_ADDRESS(network), network);
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

  test('getVaultMode infers P2A_TRUC from version 3 + 0-sat P2A', () => {
    const triggerTxHex = createSyntheticTxHex({
      version: 3,
      mainOutputValue: 10000,
      p2aValue: 0
    });
    const vault = {
      triggerMap: { [triggerTxHex]: [] }
    } as unknown as Vault;
    expect(getVaultMode(vault)).toBe('P2A_TRUC');
    expect(getTriggerAnchorOutputIndex(triggerTxHex)).toBe(1);
  });

  test('getVaultMode infers P2A_NON_TRUC from non-zero P2A anchor', () => {
    const triggerTxHex = createSyntheticTxHex({
      version: 2,
      mainOutputValue: 10000,
      p2aValue: P2A_NON_TRUC_ANCHOR_VALUE
    });
    const panicTxHex = createSyntheticTxHex({
      version: 2,
      mainOutputValue: 9000,
      p2aValue: P2A_NON_TRUC_ANCHOR_VALUE
    });
    const vault = {
      triggerMap: { [triggerTxHex]: [panicTxHex] }
    } as unknown as Vault;
    expect(getVaultMode(vault)).toBe('P2A_NON_TRUC');
    expect(getTriggerAnchorOutputIndex(triggerTxHex)).toBe(1);
    expect(getPanicAnchorOutputIndex(panicTxHex)).toBe(1);
  });

  test('getVaultMode falls back to LADDERED when no P2A output exists', () => {
    const ladderedTriggerTxHex = createSyntheticTxHex({
      version: 2,
      mainOutputValue: 10000
    });
    const ladderedVault = {
      triggerMap: { [ladderedTriggerTxHex]: [] }
    } as unknown as Vault;
    expect(getVaultMode(ladderedVault)).toBe('LADDERED');
    expect(getTriggerAnchorOutputIndex(ladderedTriggerTxHex)).toBeUndefined();
  });

  test('estimateCpfpPackage computes effective package fee data', () => {
    const network = networks.regtest;
    const changeOutput = createAddressOutput(
      DUMMY_ADDRESS(network),
      network
    );
    const parentTxHex = createSyntheticTxHex({
      version: 2,
      mainOutputValue: 12000,
      p2aValue: P2A_NON_TRUC_ANCHOR_VALUE
    });
    const plan = estimateCpfpPackage({
      parentTxHex,
      parentFee: 120,
      targetPackageFeeRate: 2,
      utxosData: [createSyntheticUtxoData(3000)],
      changeOutput
    });

    expect(plan).toBeDefined();
    if (!plan) throw new Error('Expected CPFP plan');
    expect(plan.childFee).toBeGreaterThanOrEqual(0);
    expect(plan.packageFeeRate).toBeGreaterThanOrEqual(2);
  });

  test('estimateCpfpPackage returns undefined for laddered parent tx', () => {
    const network = networks.regtest;
    const changeOutput = createAddressOutput(
      DUMMY_ADDRESS(network),
      network
    );
    const parentTxHex = createSyntheticTxHex({
      version: 2,
      mainOutputValue: 12000
    });
    const plan = estimateCpfpPackage({
      parentTxHex,
      parentFee: 120,
      targetPackageFeeRate: 2,
      utxosData: [createSyntheticUtxoData(3000)],
      changeOutput
    });
    expect(plan).toBeUndefined();
  });

  test('higher presigned trigger fee raises the minimum vaulted amount', () => {
    const coldAddress = DUMMY_ADDRESS(networks.regtest);
    const minimumAtRelayFloor = estimateMinimumRequiredVaultedAmount({
      coldAddress,
      lockBlocks: 144,
      network: networks.regtest,
      vaultMode: 'P2A_TRUC',
      presignedTriggerFeeRate: 0.1,
      presignedRescueFeeRate: 100
    });
    const minimumAtHighTriggerFee = estimateMinimumRequiredVaultedAmount({
      coldAddress,
      lockBlocks: 144,
      network: networks.regtest,
      vaultMode: 'P2A_TRUC',
      presignedTriggerFeeRate: 10,
      presignedRescueFeeRate: 100
    });

    expect(minimumAtHighTriggerFee).toBeGreaterThan(minimumAtRelayFloor);
  });

  test('estimateCpfpPackage enforces P2A_TRUC child size limit', () => {
    const network = networks.regtest;
    const changeOutput = createAddressOutput(
      DUMMY_ADDRESS(network),
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
      targetPackageFeeRate: 120,
      utxosData,
      changeOutput
    });
    expect(plan).toBeUndefined();
  });

  test('estimateCpfpPackage enforces child min relay fee', () => {
    const network = networks.regtest;
    const changeOutput = createAddressOutput(
      DUMMY_ADDRESS(network),
      network
    );
    const parentTxHex = createSyntheticTxHex({
      version: 2,
      mainOutputValue: 12000,
      p2aValue: P2A_NON_TRUC_ANCHOR_VALUE
    });
    const utxosData = [createSyntheticUtxoData(1000)];
    const plan = estimateCpfpPackage({
      parentTxHex,
      parentFee: 14,
      targetPackageFeeRate: 0.1,
      utxosData,
      changeOutput
    });

    expect(plan).toBeDefined();
    if (!plan) throw new Error('Expected CPFP plan');
    expect(plan.childFee).toBeGreaterThanOrEqual(
      Math.ceil(plan.childVSize * 0.1)
    );
  });
});
