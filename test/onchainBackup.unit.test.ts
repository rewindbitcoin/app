// Copyright (C) 2026 Jose-Luis Landabaso - https://rewindbitcoin.com
// Licensed under the GNU GPL v3 or later. See the LICENSE file for details.

jest.mock('../dist/src/app/lib/backup/shared', () => ({
  getSeedDerivedCipherKey: jest.fn(async () => new Uint8Array(32).fill(1))
}));

import { DescriptorsFactory } from '@bitcoinerlab/descriptors';
import type { DiscoveryInstance } from '@bitcoinerlab/discovery';
import type { Explorer } from '@bitcoinerlab/explorer';
import * as secp256k1 from '@bitcoinerlab/secp256k1';
import {
  address as bitcoinAddress,
  initEccLib,
  networks,
  payments,
  Transaction
} from 'bitcoinjs-lib';
import { toHex } from 'uint8array-tools';

import { fixtures } from './fixtutres';
import {
  createOnChainBackupTx,
  fetchOnChainVaults
} from '../dist/src/app/lib/backup/onchain';
import {
  getOnChainBackupPayloadBytes,
  ONCHAIN_BACKUP_MAGIC
} from '../dist/src/app/lib/backup/onchainFormat';
import {
  getEmergencyOutputDataFromAddress,
  type EmergencyOutputType
} from '../dist/src/app/lib/emergencyOutputs';
import { getVaultIdentity } from '../dist/src/app/lib/backup/vaultIdentity';
import {
  createColdAddress,
  createUnvaultKeyExpression,
  getDefaultAccount,
  getMasterNode
} from '../dist/src/app/lib/vaultDescriptors';
import {
  createVault,
  getRandomSigner,
  type UtxosData,
  type Vault
} from '../dist/src/app/lib/vaults';
import {
  getPresignedTriggerFeeRate,
  MAX_TRIGGER_FEERATE,
  PRESIGNED_RESCUE_FEERATE
} from '../dist/src/app/lib/vaultFees';
import { type Signer, type Signers } from '../dist/src/app/lib/wallets';

const { Output } = DescriptorsFactory(secp256k1);
initEccLib(secp256k1);
const network = networks.regtest;
const networkId = 'REGTEST';
const REW_MAGIC_HEX = toHex(ONCHAIN_BACKUP_MAGIC);

const extractRewPayload = (txHex: string) => {
  const tx = Transaction.fromHex(txHex);
  for (const output of tx.outs) {
    const payload = payments.embed({ output: output.script }).data?.[0];
    if (
      payload &&
      toHex(payload.subarray(0, ONCHAIN_BACKUP_MAGIC.length)) === REW_MAGIC_HEX
    )
      return payload;
  }
  throw new Error('REW payload not found');
};

const corruptRewPayload = (txHex: string) => {
  const tx = Transaction.fromHex(txHex);
  for (const output of tx.outs) {
    const payload = payments.embed({ output: output.script }).data?.[0];
    if (
      payload &&
      toHex(payload.subarray(0, ONCHAIN_BACKUP_MAGIC.length)) === REW_MAGIC_HEX
    ) {
      const corruptedPayload = Uint8Array.from(payload);
      const corruptIndex = corruptedPayload.length - 1;
      const corruptedByte = corruptedPayload[corruptIndex];
      if (corruptedByte === undefined) throw new Error('Empty REW payload');
      corruptedPayload[corruptIndex] = corruptedByte ^ 1;
      const embed = payments.embed({ data: [corruptedPayload] });
      if (!embed.output) throw new Error('Could not corrupt REW payload');
      output.script = embed.output;
      return tx.toHex();
    }
  }
  throw new Error('REW payload not found');
};

const getVaultTriggerAndRescueTxHex = (vault: Vault) => {
  const triggerEntries = Object.entries(vault.triggerMap);
  expect(triggerEntries).toHaveLength(1);
  const [triggerTxHex, rescueTxHexs] = triggerEntries[0] ?? [];
  expect(rescueTxHexs).toHaveLength(1);
  const rescueTxHex = rescueTxHexs?.[0];
  if (!triggerTxHex || !rescueTxHex)
    throw new Error('Expected trigger and rescue tx hex');
  return { triggerTxHex, rescueTxHex };
};

describe('on-chain backup unit tests', () => {
  const { MNEMONIC, COLD_MNEMONIC, VAULTED_AMOUNT, LOCK_BLOCKS } =
    fixtures.edge2edge;

  test('rejects invalid P2TR emergency addresses', () => {
    const invalidXOnlyPointAddress = bitcoinAddress.toBech32(
      new Uint8Array(32).fill(0xff),
      1,
      network.bech32
    );
    expect(
      getEmergencyOutputDataFromAddress(invalidXOnlyPointAddress, network)
    ).toBeUndefined();
  });

  const getP2PKHColdAddress = () => {
    const coldAddress = payments.p2pkh({
      hash: new Uint8Array(20).fill(2),
      network
    }).address;
    if (!coldAddress) throw new Error('Could not create P2PKH address');
    return coldAddress;
  };

  const getP2SHColdAddress = () => {
    const coldAddress = payments.p2sh({
      hash: new Uint8Array(20).fill(4),
      network
    }).address;
    if (!coldAddress) throw new Error('Could not create P2SH address');
    return coldAddress;
  };

  const getP2TRColdAddress = () => {
    const coldAddress = payments.p2tr({
      internalPubkey: secp256k1.xOnlyPointFromScalar(
        new Uint8Array(32).fill(3)
      ),
      network
    }).address;
    if (!coldAddress) throw new Error('Could not create P2TR address');
    return coldAddress;
  };

  const getP2WSHColdAddress = () => {
    const coldAddress = payments.p2wsh({
      hash: new Uint8Array(32).fill(5),
      network
    }).address;
    if (!coldAddress) throw new Error('Could not create P2WSH address');
    return coldAddress;
  };

  const expectRestoresOnChainBackup = async ({
    coldAddress,
    expectedEmergencyOutputType,
    vaultIndex,
    vaultMode = 'P2A_NON_TRUC',
    expectCorruptedBackupRejection = false
  }: {
    coldAddress: string;
    expectedEmergencyOutputType: EmergencyOutputType;
    vaultIndex: number;
    vaultMode?: 'P2A_TRUC' | 'P2A_NON_TRUC';
    expectCorruptedBackupRejection?: boolean;
  }) => {
    const masterNode = getMasterNode(MNEMONIC, network);
    const signer: Signer = {
      masterFingerprint: toHex(masterNode.fingerprint),
      type: 'SOFTWARE',
      mnemonic: MNEMONIC
    };
    const signers: Signers = { 0: signer };
    const account = await getDefaultAccount(signers, network);
    const fundingOutput = new Output({
      descriptor: account,
      index: 0,
      network
    });
    const fundingTx = new Transaction();
    fundingTx.version = 2;
    fundingTx.addInput(new Uint8Array(32), 0);
    fundingTx.addOutput(
      fundingOutput.getScriptPubKey(),
      BigInt(fixtures.edge2edge.FAUCET_AMOUNT)
    );
    const utxosData: UtxosData = [
      {
        tx: fundingTx,
        txHex: fundingTx.toHex(),
        vout: 0,
        output: fundingOutput
      }
    ];
    const vaultIdentity = getVaultIdentity({
      signer,
      networkId,
      index: vaultIndex
    });
    const unvaultKeyExpression = await createUnvaultKeyExpression({
      signer,
      network
    });
    const createResult = await createVault({
      vaultedAmount: BigInt(VAULTED_AMOUNT),
      unvaultKeyExpression,
      packageFeeRate: 2,
      presignedTriggerFeeRate: getPresignedTriggerFeeRate(vaultMode),
      presignedRescueFeeRate: PRESIGNED_RESCUE_FEERATE,
      maxTriggerFeeRate: MAX_TRIGGER_FEERATE,
      utxosData,
      coinControl: false,
      signer,
      randomSigner: await getRandomSigner(networkId),
      coldAddress,
      lockBlocks: LOCK_BLOCKS,
      changeDescriptorWithIndex: {
        descriptor: account.replace(/\/0\/\*/g, '/1/*'),
        index: 0
      },
      vaultIndex,
      vaultMode,
      shiftFeesToBackupTx: true,
      networkId
    });
    if (typeof createResult === 'string') throw new Error(createResult);
    const vault: Vault = {
      vaultId: vaultIdentity.vaultId,
      vaultPath: vaultIdentity.vaultPath,
      vaultedAmount: createResult.selectedVaultedAmount,
      vaultAddress: createResult.vaultAddress,
      triggerAddress: createResult.triggerAddress,
      coldAddress,
      lockBlocks: LOCK_BLOCKS,
      vaultTxHex: createResult.vaultTxHex,
      txMap: createResult.txMap,
      triggerMap: createResult.triggerMap,
      networkId,
      unvaultKey: unvaultKeyExpression,
      triggerDescriptor: createResult.triggerDescriptor,
      creationTime: createResult.creationTime
    };

    const backupTxHex = await createOnChainBackupTx({ vault, signer });
    const backupPayload = extractRewPayload(backupTxHex);
    expect(toHex(backupPayload.subarray(0, ONCHAIN_BACKUP_MAGIC.length))).toBe(
      REW_MAGIC_HEX
    );
    const emergencyOutput = getEmergencyOutputDataFromAddress(
      coldAddress,
      network
    );
    if (!emergencyOutput) throw new Error('Invalid emergency output address');
    expect(emergencyOutput.type).toBe(expectedEmergencyOutputType);
    expect(backupPayload.length).toBe(
      getOnChainBackupPayloadBytes(emergencyOutput.type)
    );
    const { triggerTxHex, rescueTxHex } = getVaultTriggerAndRescueTxHex(vault);
    const explorer = {
      fetchTx: async (txId: string) => {
        if (txId !== fundingTx.getId()) throw new Error('Unexpected txid');
        return fundingTx.toHex();
      },
      fetchBlockStatus: async () => ({
        blockHash: '0'.repeat(64),
        blockHeight: 1,
        blockTime: createResult.creationTime,
        irreversible: true
      })
    } as unknown as Explorer;

    const createDiscovery = (candidateBackupTxHex: string) =>
      ({
        fetch: jest.fn(async () => undefined),
        getHistory: jest.fn(({ index }: { index?: number }) =>
          index === vaultIndex
            ? [
                {
                  txHex: vault.vaultTxHex,
                  blockHeight: 1,
                  irreversible: true
                },
                {
                  txHex: candidateBackupTxHex,
                  blockHeight: 1,
                  irreversible: true
                }
              ]
            : []
        ),
        getExplorer: () => explorer
      }) as unknown as DiscoveryInstance;

    if (expectCorruptedBackupRejection) {
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {
        // Expected: restore logs and skips corrupted backup payloads.
      });
      try {
        const corruptedRestoredVaults = await fetchOnChainVaults({
          discovery: createDiscovery(corruptRewPayload(backupTxHex)),
          signer,
          networkId,
          firstIndexToCheck: vaultIndex
        });
        expect(corruptedRestoredVaults[vault.vaultId]).toBeUndefined();
      } finally {
        warn.mockRestore();
      }
    }

    const discovery = createDiscovery(backupTxHex);
    const restoredVaults = await fetchOnChainVaults({
      discovery,
      signer,
      networkId,
      firstIndexToCheck: vaultIndex
    });
    const restoredVault = restoredVaults[vault.vaultId];
    if (!restoredVault) throw new Error('Vault not restored');
    const cachedExplorer = {
      fetchTx: async () => {
        throw new Error('Expected cached tx hex');
      },
      fetchBlockStatus: explorer.fetchBlockStatus
    } as unknown as Explorer;
    const cachedDiscovery = {
      fetch: jest.fn(async () => undefined),
      getHistory: discovery.getHistory,
      getExplorer: () => cachedExplorer
    } as unknown as DiscoveryInstance;
    const restoredVaultsFromCache = await fetchOnChainVaults({
      discovery: cachedDiscovery,
      signer,
      networkId,
      firstIndexToCheck: vaultIndex
    });
    const restoredVaultFromCache = restoredVaultsFromCache[vault.vaultId];
    if (!restoredVaultFromCache)
      throw new Error('Vault not restored from cache');

    expect(restoredVault.vaultId).toBe(vault.vaultId);
    expect(restoredVault.vaultPath).toBe(vault.vaultPath);
    expect(restoredVault.vaultedAmount).toBe(vault.vaultedAmount);
    expect(restoredVault.vaultAddress).toBe(vault.vaultAddress);
    expect(restoredVault.triggerAddress).toBe(vault.triggerAddress);
    expect(restoredVault.coldAddress).toBe(vault.coldAddress);
    expect(restoredVault.lockBlocks).toBe(vault.lockBlocks);
    expect(restoredVault.vaultTxHex).toBe(vault.vaultTxHex);
    expect(Object.keys(restoredVault.triggerMap)).toEqual([triggerTxHex]);
    expect(restoredVault.triggerMap[triggerTxHex]).toEqual([rescueTxHex]);
    expect(restoredVault.txMap[triggerTxHex]).toEqual(
      vault.txMap[triggerTxHex]
    );
    expect(restoredVault.txMap[rescueTxHex]).toEqual(vault.txMap[rescueTxHex]);
    expect(restoredVault.triggerMap).toEqual(vault.triggerMap);
    expect(restoredVault.unvaultKey).toBe(vault.unvaultKey);
    expect(restoredVault.txMap).toEqual(vault.txMap);
    expect(restoredVaultFromCache.txMap).toEqual(vault.txMap);
  };

  test('restores a P2WPKH emergency output from on-chain backup', async () => {
    await expectRestoresOnChainBackup({
      coldAddress: await createColdAddress(COLD_MNEMONIC, network),
      expectedEmergencyOutputType: 'P2WPKH',
      vaultIndex: 0,
      expectCorruptedBackupRejection: true
    });
  });

  test('restores a P2A_TRUC vault from on-chain backup', async () => {
    await expectRestoresOnChainBackup({
      coldAddress: await createColdAddress(COLD_MNEMONIC, network),
      expectedEmergencyOutputType: 'P2WPKH',
      vaultIndex: 3,
      vaultMode: 'P2A_TRUC'
    });
  });

  test('restores a P2PKH emergency output from on-chain backup', async () => {
    await expectRestoresOnChainBackup({
      coldAddress: getP2PKHColdAddress(),
      expectedEmergencyOutputType: 'P2PKH',
      vaultIndex: 1
    });
  });

  test('restores a P2SH emergency output from on-chain backup', async () => {
    await expectRestoresOnChainBackup({
      coldAddress: getP2SHColdAddress(),
      expectedEmergencyOutputType: 'P2SH',
      vaultIndex: 4
    });
  });

  test('restores a P2TR emergency output from on-chain backup', async () => {
    await expectRestoresOnChainBackup({
      coldAddress: getP2TRColdAddress(),
      expectedEmergencyOutputType: 'P2TR',
      vaultIndex: 2
    });
  });

  test('restores a P2WSH emergency output from on-chain backup', async () => {
    await expectRestoresOnChainBackup({
      coldAddress: getP2WSHColdAddress(),
      expectedEmergencyOutputType: 'P2WSH',
      vaultIndex: 5
    });
  });
});
