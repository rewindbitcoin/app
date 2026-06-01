// Copyright (C) 2025 Jose-Luis Landabaso - https://rewindbitcoin.com
// Licensed under the GNU GPL v3 or later. See the LICENSE file for details.

jest.mock('../dist/src/common/lib/cipher', () => ({
  getManagedChacha: jest.fn(),
  getPasswordDerivedCipherKey: jest.fn()
}));
jest.mock('../dist/src/app/lib/backup/shared', () => ({
  getSeedDerivedCipherKey: jest.fn()
}));

import { fixtures } from './fixtutres';
import {
  assertP2AParentPolicy,
  estimateCpfpPackage,
  estimateMinimumRequiredVaultedAmount,
  findP2AOutputData,
  getHotDescriptors,
  P2A_NON_TRUC_ANCHOR_VALUE,
  getVaultMode,
  type HistoryData,
  type UtxosData,
  type Vault,
  type Vaults,
  type VaultsStatuses
} from '../dist/src/app/lib/vaults';
import { type Accounts } from '../dist/src/app/lib/wallets';
import { MIN_FEE_RATE } from '../dist/src/app/lib/fees';
import { getAdditionalP2AOutputValue } from '../dist/src/app/lib/p2aReserve';
import {
  getSendableUtxos,
  getVaultableUtxos
} from '../dist/src/app/lib/utxoPolicy';
import {
  buildVaultActionDataForFeeRate,
  getVaultActionBlocker,
  getCpfpFeeInfo
} from '../dist/src/app/lib/vaultActionTx';
import { networks, type Network, Transaction } from 'bitcoinjs-lib';
import { fromHex } from 'uint8array-tools';
import { createAddressOutput } from '../dist/src/app/lib/vaultDescriptors';

const P2A_NON_TRUC_ANCHOR_SATS = Number(P2A_NON_TRUC_ANCHOR_VALUE);

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

const createSyntheticUtxoData = (
  value: number,
  version = 2
): UtxosData[number] => {
  const network = networks.regtest;
  const output = createAddressOutput(DUMMY_ADDRESS(network), network);
  const tx = new Transaction();
  tx.version = version;
  tx.addInput(new Uint8Array(32), 0);
  tx.addOutput(fromHex(`0014${'00'.repeat(20)}`), BigInt(value));
  return {
    tx,
    txHex: tx.toHex(),
    vout: 0,
    output
  };
};

const createSyntheticCpfpChildTxHex = ({
  parentTxHex,
  reserveUtxosData,
  childFee
}: {
  parentTxHex: string;
  reserveUtxosData: UtxosData;
  childFee: number;
}) => {
  const parentTx = Transaction.fromHex(parentTxHex);
  const parentAnchor = findP2AOutputData(parentTx);
  if (!parentAnchor) throw new Error('Expected parent anchor');
  const reserveValue = reserveUtxosData.reduce((sum, utxoData) => {
    const output = utxoData.tx.outs[utxoData.vout];
    if (!output) throw new Error('Expected reserve output');
    return sum + Number(output.value);
  }, 0);
  const childOutputValue = BigInt(parentAnchor.value + reserveValue - childFee);
  if (childOutputValue <= BigInt(0)) throw new Error('Invalid child fee');

  const childTx = new Transaction();
  childTx.version = parentTx.version === 3 ? 3 : 2;
  childTx.addInput(parentTx.getHash(), parentAnchor.index, 0xfffffffd);
  reserveUtxosData.forEach(utxoData => {
    childTx.addInput(utxoData.tx.getHash(), utxoData.vout, 0xfffffffd);
  });
  childTx.addOutput(fromHex(`0014${'11'.repeat(20)}`), childOutputValue);
  return childTx.toHex();
};

const createPresignedP2ATxInfo = ({
  version,
  p2aValue,
  fee
}: {
  version: number;
  p2aValue: number;
  fee: number;
}) => {
  const txHex = createSyntheticTxHex({
    version,
    mainOutputValue: 12000,
    p2aValue
  });
  const tx = Transaction.fromHex(txHex);
  return { txHex, fee, feeRate: fee / tx.virtualSize() };
};

describe('vaults unit tests', () => {
  const { expected } = fixtures.edge2edge;

  test('P2A_NON_TRUC anchor is just above P2A dust threshold', () => {
    expect(P2A_NON_TRUC_ANCHOR_SATS).toBe(241);
  });

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
    expect(findP2AOutputData(Transaction.fromHex(triggerTxHex))?.index).toBe(1);
  });

  test('getVaultMode infers P2A_NON_TRUC from non-zero P2A anchor', () => {
    const triggerTxHex = createSyntheticTxHex({
      version: 2,
      mainOutputValue: 10000,
      p2aValue: P2A_NON_TRUC_ANCHOR_SATS
    });
    const panicTxHex = createSyntheticTxHex({
      version: 2,
      mainOutputValue: 9000,
      p2aValue: P2A_NON_TRUC_ANCHOR_SATS
    });
    const vault = {
      triggerMap: { [triggerTxHex]: [panicTxHex] }
    } as unknown as Vault;
    expect(getVaultMode(vault)).toBe('P2A_NON_TRUC');
    expect(findP2AOutputData(Transaction.fromHex(triggerTxHex))?.index).toBe(1);
    expect(findP2AOutputData(Transaction.fromHex(panicTxHex))?.index).toBe(1);
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
    expect(
      findP2AOutputData(Transaction.fromHex(ladderedTriggerTxHex))
    ).toBeUndefined();
  });

  test('estimateCpfpPackage computes effective package fee data', () => {
    const network = networks.regtest;
    const changeOutput = createAddressOutput(DUMMY_ADDRESS(network), network);
    const parentTxHex = createSyntheticTxHex({
      version: 2,
      mainOutputValue: 12000,
      p2aValue: P2A_NON_TRUC_ANCHOR_SATS
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

  test('getAdditionalP2AOutputValue funds one new child input', () => {
    const network = networks.regtest;
    const changeOutput = createAddressOutput(DUMMY_ADDRESS(network), network);
    const nextReserveOutput = createAddressOutput(
      DUMMY_ADDRESS(network),
      network
    );
    const parentTxHex = createSyntheticTxHex({
      version: 2,
      mainOutputValue: 12000,
      p2aValue: P2A_NON_TRUC_ANCHOR_SATS
    });
    const parentTx = Transaction.fromHex(parentTxHex);
    const parentAnchor = findP2AOutputData(parentTx);
    if (!parentAnchor) throw new Error('Expected parent anchor');
    const parentFee = 120;
    const targetPackageFeeRate = 20;

    const requiredValue = Number(
      getAdditionalP2AOutputValue({
        parentAnchorValue: parentAnchor.value,
        presignedParentVSize: parentTx.virtualSize(),
        presignedParentFeeRate: parentFee / parentTx.virtualSize(),
        targetPackageFeeRate,
        outputsWithValue: [],
        additionalOutput: nextReserveOutput,
        changeOutput
      })
    );

    expect(requiredValue).toBeGreaterThan(0);
    const plan = estimateCpfpPackage({
      parentTxHex,
      parentFee,
      targetPackageFeeRate,
      utxosData: [createSyntheticUtxoData(requiredValue)],
      changeOutput
    });
    expect(plan).toBeDefined();
    expect(plan?.packageFeeRate).toBeGreaterThanOrEqual(targetPackageFeeRate);

    const underfundedPlan = estimateCpfpPackage({
      parentTxHex,
      parentFee,
      targetPackageFeeRate,
      utxosData: [createSyntheticUtxoData(requiredValue - 1)],
      changeOutput
    });
    expect(underfundedPlan).toBeUndefined();
  });

  test('P2A replacement uses reserve inputs spent by the previous child', () => {
    const network = networks.regtest;
    const changeOutput = createAddressOutput(DUMMY_ADDRESS(network), network);
    const parentTxHex = createSyntheticTxHex({
      version: 2,
      mainOutputValue: 12000,
      p2aValue: P2A_NON_TRUC_ANCHOR_SATS
    });
    const parentTx = Transaction.fromHex(parentTxHex);
    const parentFee = 120;
    const priorReserveUtxo = createSyntheticUtxoData(3000);
    const pushedChildTxHex = createSyntheticCpfpChildTxHex({
      parentTxHex,
      reserveUtxosData: [priorReserveUtxo],
      childFee: 200
    });
    const p2aBumpPlan = {
      txosData: [priorReserveUtxo],
      hasUnconfirmedUtxos: false,
      changeOutput
    };
    const presignedTxInfos = [
      {
        txHex: parentTxHex,
        fee: parentFee,
        feeRate: parentFee / parentTx.virtualSize()
      }
    ];
    const availability = getVaultActionBlocker({
      vaultMode: 'P2A_NON_TRUC',
      feeEstimates: { '1': 10 },
      pushedTxHex: parentTxHex,
      pushedChildTxHex,
      presignedTxInfos,
      p2aBumpPlan,
      coinControl: false,
      historyData: []
    });

    expect(availability.reason).toBeNull();
    expect(availability.minimumSelectableFeeRate).not.toBeNull();
    if (availability.minimumSelectableFeeRate === null)
      throw new Error('Expected minimum selectable fee rate');
    const txData = buildVaultActionDataForFeeRate({
      vaultMode: 'P2A_NON_TRUC',
      selectedFeeRate: availability.minimumSelectableFeeRate,
      pushedTxHex: parentTxHex,
      presignedTxInfos,
      p2aBumpPlan,
      coinControl: false
    });

    expect(txData?.p2aBumpPlan?.txosData).toHaveLength(1);
    expect(txData?.p2aBumpPlan?.txosData[0]?.tx.getId()).toBe(
      priorReserveUtxo.tx.getId()
    );
    expect(txData?.walletSupplementUtxosData).toBe('walletSupplementUnneeded');
  });

  test('P2A trigger uses wallet supplement only after opt-in', () => {
    const network = networks.regtest;
    const changeOutput = createAddressOutput(DUMMY_ADDRESS(network), network);
    const parentTxHex = createSyntheticTxHex({
      version: 2,
      mainOutputValue: 12000,
      p2aValue: P2A_NON_TRUC_ANCHOR_SATS
    });
    const parentTx = Transaction.fromHex(parentTxHex);
    const parentFee = 120;
    const reserveUtxo = createSyntheticUtxoData(100);
    const walletUtxo = createSyntheticUtxoData(10000);
    const presignedTxInfos = [
      {
        txHex: parentTxHex,
        fee: parentFee,
        feeRate: parentFee / parentTx.virtualSize()
      }
    ];
    const reserveOnlyPlan = {
      txosData: [reserveUtxo],
      hasUnconfirmedUtxos: false,
      changeOutput
    };

    expect(
      buildVaultActionDataForFeeRate({
        vaultMode: 'P2A_NON_TRUC',
        selectedFeeRate: 20,
        presignedTxInfos,
        p2aBumpPlan: reserveOnlyPlan,
        coinControl: false
      })
    ).toBeNull();

    const supplementedTxData = buildVaultActionDataForFeeRate({
      vaultMode: 'P2A_NON_TRUC',
      selectedFeeRate: 20,
      presignedTxInfos,
      p2aBumpPlan: reserveOnlyPlan,
      vaultableWalletUtxosData: [walletUtxo],
      coinControl: false
    });

    expect(supplementedTxData?.p2aBumpPlan?.txosData).toHaveLength(1);
    expect(supplementedTxData?.p2aBumpPlan?.txosData[0]?.tx.getId()).toBe(
      reserveUtxo.tx.getId()
    );
    expect(Array.isArray(supplementedTxData?.walletSupplementUtxosData)).toBe(
      true
    );
    if (
      !supplementedTxData ||
      !Array.isArray(supplementedTxData.walletSupplementUtxosData)
    )
      throw new Error('Expected wallet supplement UTXOs');
    expect(supplementedTxData.walletSupplementUtxosData).toHaveLength(1);
    expect(supplementedTxData.walletSupplementUtxosData[0]?.tx.getId()).toBe(
      walletUtxo.tx.getId()
    );
  });

  test('P2A trigger supplement allows unconfirmed wallet UTXOs only for non-TRUC', () => {
    const walletUtxo = createSyntheticUtxoData(10000);
    const historyData = [
      {
        tx: walletUtxo.tx,
        txId: walletUtxo.tx.getId(),
        blockHeight: 0
      }
    ] as unknown as HistoryData;
    const vaultsStatuses = {} as VaultsStatuses;

    expect(
      getVaultableUtxos([walletUtxo], vaultsStatuses, historyData, 'P2A_TRUC')
        .utxosData
    ).toHaveLength(0);
    expect(
      getVaultableUtxos(
        [walletUtxo],
        vaultsStatuses,
        historyData,
        'P2A_NON_TRUC'
      ).utxosData
    ).toHaveLength(1);
  });

  test('UTXO availability reports confirmation-gated wallet inputs', () => {
    const unconfirmedV2Utxo = createSyntheticUtxoData(10000, 2);
    const unconfirmedV3Utxo = createSyntheticUtxoData(11000, 3);
    const historyData = [
      {
        tx: unconfirmedV2Utxo.tx,
        txId: unconfirmedV2Utxo.tx.getId(),
        blockHeight: 0
      },
      {
        tx: unconfirmedV3Utxo.tx,
        txId: unconfirmedV3Utxo.tx.getId(),
        blockHeight: 0
      }
    ] as unknown as HistoryData;
    const vaultsStatuses = {} as VaultsStatuses;

    expect(
      getVaultableUtxos(
        [unconfirmedV2Utxo],
        vaultsStatuses,
        historyData,
        'P2A_TRUC'
      ).utxosAvailability[0]
    ).toMatchObject({
      status: 'temporarilyUnavailable',
      reason: 'trucRequiresConfirmedInput'
    });
    expect(
      getVaultableUtxos(
        [unconfirmedV2Utxo],
        vaultsStatuses,
        historyData,
        'P2A_NON_TRUC'
      ).utxosAvailability[0]
    ).toMatchObject({ status: 'selectable' });
    expect(
      getSendableUtxos([unconfirmedV3Utxo], vaultsStatuses, historyData)
        .utxosAvailability[0]
    ).toMatchObject({
      status: 'temporarilyUnavailable',
      reason: 'unconfirmedV3Output'
    });
  });

  test('UTXO availability reports unconfirmed acceleration outputs as confirmation-gated', () => {
    const accelerationUtxo = createSyntheticUtxoData(12000);
    const historyData = [
      {
        tx: accelerationUtxo.tx,
        txId: accelerationUtxo.tx.getId(),
        blockHeight: 0
      }
    ] as unknown as HistoryData;
    const vaultsStatuses = {
      vault: { triggerCpfpTxHex: accelerationUtxo.txHex }
    } as unknown as VaultsStatuses;

    expect(
      getSendableUtxos([accelerationUtxo], vaultsStatuses, historyData)
        .utxosAvailability[0]
    ).toMatchObject({
      status: 'temporarilyUnavailable',
      reason: 'unconfirmedAcceleratableOutput'
    });
  });

  test('P2A trigger does not fall back to parent-only when reserve cannot fund selected fee', () => {
    const network = networks.regtest;
    const changeOutput = createAddressOutput(DUMMY_ADDRESS(network), network);
    const parentTxHex = createSyntheticTxHex({
      version: 2,
      mainOutputValue: 12000,
      p2aValue: P2A_NON_TRUC_ANCHOR_SATS
    });
    const parentTx = Transaction.fromHex(parentTxHex);
    const parentFee = Math.ceil(parentTx.virtualSize() * 2);

    expect(
      buildVaultActionDataForFeeRate({
        vaultMode: 'P2A_NON_TRUC',
        selectedFeeRate: MIN_FEE_RATE,
        presignedTxInfos: [
          {
            txHex: parentTxHex,
            fee: parentFee,
            feeRate: parentFee / parentTx.virtualSize()
          }
        ],
        p2aBumpPlan: {
          txosData: [createSyntheticUtxoData(1)],
          hasUnconfirmedUtxos: false,
          changeOutput
        },
        coinControl: false
      })
    ).toBeNull();
  });

  test('P2A trigger keeps wallet supplement unused when reserve is enough', () => {
    const network = networks.regtest;
    const changeOutput = createAddressOutput(DUMMY_ADDRESS(network), network);
    const parentTxHex = createSyntheticTxHex({
      version: 2,
      mainOutputValue: 12000,
      p2aValue: P2A_NON_TRUC_ANCHOR_SATS
    });
    const parentTx = Transaction.fromHex(parentTxHex);
    const parentFee = 120;
    const reserveUtxo = createSyntheticUtxoData(10000);
    const walletUtxo = createSyntheticUtxoData(10000);
    const txData = buildVaultActionDataForFeeRate({
      vaultMode: 'P2A_NON_TRUC',
      selectedFeeRate: 2,
      presignedTxInfos: [
        {
          txHex: parentTxHex,
          fee: parentFee,
          feeRate: parentFee / parentTx.virtualSize()
        }
      ],
      p2aBumpPlan: {
        txosData: [reserveUtxo],
        hasUnconfirmedUtxos: false,
        changeOutput
      },
      vaultableWalletUtxosData: [walletUtxo],
      coinControl: false
    });

    expect(txData?.p2aBumpPlan?.txosData).toHaveLength(1);
    expect(txData?.p2aBumpPlan?.txosData[0]?.tx.getId()).toBe(
      reserveUtxo.tx.getId()
    );
    expect(txData?.walletSupplementUtxosData).toBe('walletSupplementUnneeded');
  });

  test('P2A trigger manual supplement spends every selected wallet UTXO when reserve is short', () => {
    const network = networks.regtest;
    const changeOutput = createAddressOutput(DUMMY_ADDRESS(network), network);
    const parentTxHex = createSyntheticTxHex({
      version: 2,
      mainOutputValue: 12000,
      p2aValue: P2A_NON_TRUC_ANCHOR_SATS
    });
    const parentTx = Transaction.fromHex(parentTxHex);
    const parentFee = 120;
    const reserveUtxo = createSyntheticUtxoData(100);
    const walletUtxoA = createSyntheticUtxoData(10000);
    const walletUtxoB = createSyntheticUtxoData(3000);
    const txData = buildVaultActionDataForFeeRate({
      vaultMode: 'P2A_NON_TRUC',
      selectedFeeRate: 20,
      presignedTxInfos: [
        {
          txHex: parentTxHex,
          fee: parentFee,
          feeRate: parentFee / parentTx.virtualSize()
        }
      ],
      p2aBumpPlan: {
        txosData: [reserveUtxo],
        hasUnconfirmedUtxos: false,
        changeOutput
      },
      vaultableWalletUtxosData: [walletUtxoA, walletUtxoB],
      coinControl: true
    });

    expect(txData?.p2aBumpPlan?.txosData).toHaveLength(1);
    expect(txData?.p2aBumpPlan?.txosData[0]?.tx.getId()).toBe(
      reserveUtxo.tx.getId()
    );
    expect(Array.isArray(txData?.walletSupplementUtxosData)).toBe(true);
    if (!txData || !Array.isArray(txData.walletSupplementUtxosData))
      throw new Error('Expected manual wallet supplement UTXOs');
    expect(txData.walletSupplementUtxosData).toHaveLength(2);
    expect(
      txData.walletSupplementUtxosData.map(utxo => utxo.tx.getId())
    ).toEqual([walletUtxoA.tx.getId(), walletUtxoB.tx.getId()]);
  });

  test('getCpfpFeeInfo derives old wallet supplement input values from known txs', () => {
    const parentTxHex = createSyntheticTxHex({
      version: 2,
      mainOutputValue: 12000,
      p2aValue: P2A_NON_TRUC_ANCHOR_SATS
    });
    const reserveUtxo = createSyntheticUtxoData(1000);
    const walletUtxo = createSyntheticUtxoData(3000);
    const childTxHex = createSyntheticCpfpChildTxHex({
      parentTxHex,
      reserveUtxosData: [reserveUtxo, walletUtxo],
      childFee: 200
    });

    const feeInfo = getCpfpFeeInfo({
      parentTxHex,
      parentFee: 120,
      childTxHex,
      reserveUtxosData: [reserveUtxo],
      historyData: [{ tx: walletUtxo.tx } as HistoryData[number]]
    });

    expect(feeInfo.childFee).toBe(200);
  });

  test('P2A replacement above maximum reports max-fee guard', () => {
    const network = networks.regtest;
    const changeOutput = createAddressOutput(DUMMY_ADDRESS(network), network);
    const parentTxHex = createSyntheticTxHex({
      version: 2,
      mainOutputValue: 12000,
      p2aValue: P2A_NON_TRUC_ANCHOR_SATS
    });
    const parentTx = Transaction.fromHex(parentTxHex);
    const parentFee = 120;
    const priorReserveUtxo = createSyntheticUtxoData(10000);
    const pushedChildTxHex = createSyntheticCpfpChildTxHex({
      parentTxHex,
      reserveUtxosData: [priorReserveUtxo],
      childFee: 5000
    });

    expect(
      getVaultActionBlocker({
        vaultMode: 'P2A_NON_TRUC',
        feeEstimates: { '1': 1 },
        pushedTxHex: parentTxHex,
        pushedChildTxHex,
        presignedTxInfos: [
          {
            txHex: parentTxHex,
            fee: parentFee,
            feeRate: parentFee / parentTx.virtualSize()
          }
        ],
        p2aBumpPlan: {
          txosData: [priorReserveUtxo],
          hasUnconfirmedUtxos: false,
          changeOutput
        },
        coinControl: false,
        historyData: []
      })
    ).toEqual({
      reason: 'replacementFeeAboveMaximum',
      minimumSelectableFeeRate: null
    });
  });

  test('estimateCpfpPackage returns undefined for laddered parent tx', () => {
    const network = networks.regtest;
    const changeOutput = createAddressOutput(DUMMY_ADDRESS(network), network);
    const parentTxHex = createSyntheticTxHex({
      version: 2,
      mainOutputValue: 12000
    });
    expect(() =>
      estimateCpfpPackage({
        parentTxHex,
        parentFee: 120,
        targetPackageFeeRate: 2,
        utxosData: [createSyntheticUtxoData(3000)],
        changeOutput
      })
    ).toThrow('Expected exactly one P2A output in parent tx');
  });

  test('higher presigned trigger fee raises the P2A_NON_TRUC minimum', () => {
    const coldAddress = DUMMY_ADDRESS(networks.regtest);
    const minimumAtRelayFloor = estimateMinimumRequiredVaultedAmount({
      coldAddress,
      lockBlocks: 144,
      network: networks.regtest,
      vaultMode: 'P2A_NON_TRUC',
      presignedTriggerFeeRate: 0.1,
      presignedRescueFeeRate: 100
    });
    const minimumAtHighTriggerFee = estimateMinimumRequiredVaultedAmount({
      coldAddress,
      lockBlocks: 144,
      network: networks.regtest,
      vaultMode: 'P2A_NON_TRUC',
      presignedTriggerFeeRate: 10,
      presignedRescueFeeRate: 100
    });

    expect(minimumAtHighTriggerFee).toBeGreaterThan(minimumAtRelayFloor);
  });

  test('assertP2AParentPolicy rejects non-zero-fee dust anchors', () => {
    const parentTxHex = createSyntheticTxHex({
      version: 3,
      mainOutputValue: 12000,
      p2aValue: 0
    });
    expect(() =>
      assertP2AParentPolicy({
        tx: Transaction.fromHex(parentTxHex),
        fee: 1,
        txName: 'test tx',
        vaultMode: 'P2A_TRUC'
      })
    ).toThrow('tx with dust output must be 0-fee');
  });

  test('assertP2AParentPolicy accepts zero-fee dust anchors', () => {
    const parentTxHex = createSyntheticTxHex({
      version: 3,
      mainOutputValue: 12000,
      p2aValue: 0
    });
    expect(() =>
      assertP2AParentPolicy({
        tx: Transaction.fromHex(parentTxHex),
        fee: 0,
        txName: 'test tx',
        vaultMode: 'P2A_TRUC'
      })
    ).not.toThrow();
  });

  test('assertP2AParentPolicy accepts non-zero-fee funded anchors', () => {
    const parentTxHex = createSyntheticTxHex({
      version: 3,
      mainOutputValue: 12000,
      p2aValue: P2A_NON_TRUC_ANCHOR_SATS
    });
    expect(() =>
      assertP2AParentPolicy({
        tx: Transaction.fromHex(parentTxHex),
        fee: 1,
        txName: 'test tx',
        vaultMode: 'P2A_TRUC'
      })
    ).not.toThrow();
  });

  test('assertP2AParentPolicy rejects dust anchors for P2A_NON_TRUC', () => {
    const parentTxHex = createSyntheticTxHex({
      version: 2,
      mainOutputValue: 12000,
      p2aValue: 0
    });
    expect(() =>
      assertP2AParentPolicy({
        tx: Transaction.fromHex(parentTxHex),
        fee: 0,
        txName: 'test tx',
        vaultMode: 'P2A_NON_TRUC'
      })
    ).toThrow('P2A_NON_TRUC anchor must be non-dust');
  });

  test('getVaultActionBlocker blocks parent-only P2A_TRUC trigger without package fee', () => {
    const parentTxInfo = createPresignedP2ATxInfo({
      version: 3,
      p2aValue: 0,
      fee: 0
    });

    expect(
      getVaultActionBlocker({
        vaultMode: 'P2A_TRUC',
        presignedTxInfos: [parentTxInfo],
        coinControl: false,
        historyData: []
      })
    ).toEqual({
      reason: 'noP2AReserve',
      minimumSelectableFeeRate: null
    });
  });

  test('getVaultActionBlocker rejects parent-only dust anchors with non-zero fee', () => {
    const parentTxInfo = createPresignedP2ATxInfo({
      version: 3,
      p2aValue: 0,
      fee: 100
    });

    expect(() =>
      getVaultActionBlocker({
        vaultMode: 'P2A_TRUC',
        presignedTxInfos: [parentTxInfo],
        coinControl: false,
        historyData: []
      })
    ).toThrow('tx with dust output must be 0-fee');
  });

  test('getVaultActionBlocker allows parent-only P2A_NON_TRUC at relay floor', () => {
    const txHex = createSyntheticTxHex({
      version: 2,
      mainOutputValue: 12000,
      p2aValue: P2A_NON_TRUC_ANCHOR_SATS
    });
    const tx = Transaction.fromHex(txHex);
    const fee = Math.ceil(tx.virtualSize() * MIN_FEE_RATE);

    expect(
      getVaultActionBlocker({
        vaultMode: 'P2A_NON_TRUC',
        presignedTxInfos: [{ txHex, fee, feeRate: fee / tx.virtualSize() }],
        coinControl: false,
        historyData: []
      })
    ).toEqual({
      reason: null,
      minimumSelectableFeeRate: null
    });
  });

  test('getVaultActionBlocker blocks parent-only P2A_NON_TRUC below relay floor', () => {
    const txHex = createSyntheticTxHex({
      version: 2,
      mainOutputValue: 12000,
      p2aValue: P2A_NON_TRUC_ANCHOR_SATS
    });
    const tx = Transaction.fromHex(txHex);
    const fee = Math.ceil(tx.virtualSize() * MIN_FEE_RATE) - 1;

    expect(
      getVaultActionBlocker({
        vaultMode: 'P2A_NON_TRUC',
        presignedTxInfos: [{ txHex, fee, feeRate: fee / tx.virtualSize() }],
        coinControl: false,
        historyData: []
      })
    ).toEqual({
      reason: 'noP2AReserve',
      minimumSelectableFeeRate: null
    });
  });

  test('estimateCpfpPackage enforces P2A_TRUC child size limit', () => {
    const network = networks.regtest;
    const changeOutput = createAddressOutput(DUMMY_ADDRESS(network), network);
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
    const changeOutput = createAddressOutput(DUMMY_ADDRESS(network), network);
    const parentTxHex = createSyntheticTxHex({
      version: 2,
      mainOutputValue: 12000,
      p2aValue: P2A_NON_TRUC_ANCHOR_SATS
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
