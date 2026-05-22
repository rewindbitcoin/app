// Copyright (C) 2026 Jose-Luis Landabaso - https://rewindbitcoin.com
// Licensed under the GNU GPL v3 or later. See the LICENSE file for details.

jest.mock('../dist/src/common/lib/cipher', () => ({
  getManagedChacha: jest.fn(async () => ({
    encrypt: (message: Uint8Array) => {
      const encrypted = new Uint8Array(message.length + 40);
      encrypted.set(message, 40);
      return encrypted;
    },
    decrypt: (cipherMessage: Uint8Array) => cipherMessage.slice(40)
  })),
  getPasswordDerivedCipherKey: jest.fn()
}));
jest.mock('../dist/src/app/lib/backup/shared', () => ({
  getSeedDerivedCipherKey: jest.fn(async () => new Uint8Array(32).fill(1))
}));

import { DescriptorsFactory } from '@bitcoinerlab/descriptors';
import type { DiscoveryInstance } from '@bitcoinerlab/discovery';
import type { Explorer } from '@bitcoinerlab/explorer';
import * as secp256k1 from '@bitcoinerlab/secp256k1';
import { networks, Transaction } from 'bitcoinjs-lib';
import { toHex } from 'uint8array-tools';

import { fixtures } from './fixtutres';
import {
  createOnChainBackupTx,
  fetchOnChainVaults
} from '../dist/src/app/lib/backup/onchain';
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
import { type Signer, type Signers } from '../dist/src/app/lib/wallets';

const { Output } = DescriptorsFactory(secp256k1);
const network = networks.regtest;
const networkId = 'REGTEST';

describe('on-chain backup unit tests', () => {
  const { MNEMONIC, COLD_MNEMONIC, VAULTED_AMOUNT, LOCK_BLOCKS } =
    fixtures.edge2edge;

  test('restores a vault from its on-chain backup tx', async () => {
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
    const vaultIndex = 0;
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
      presignedTriggerFeeRate: 0.1,
      presignedRescueFeeRate: 100,
      maxTriggerFeeRate: 100,
      utxosData,
      coinControl: false,
      signer,
      randomSigner: await getRandomSigner(networkId),
      coldAddress: await createColdAddress(COLD_MNEMONIC, network),
      lockBlocks: LOCK_BLOCKS,
      changeDescriptorWithIndex: {
        descriptor: account.replace(/\/0\/\*/g, '/1/*'),
        index: 0
      },
      vaultIndex,
      vaultMode: 'P2A_NON_TRUC',
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
      coldAddress: await createColdAddress(COLD_MNEMONIC, network),
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
    const discovery = {
      fetch: jest.fn(async () => undefined),
      getHistory: jest.fn(({ index }: { index?: number }) =>
        index === vaultIndex
          ? [
              {
                txHex: vault.vaultTxHex,
                blockHeight: 1,
                irreversible: true
              },
              { txHex: backupTxHex, blockHeight: 1, irreversible: true }
            ]
          : []
      ),
      getExplorer: () => explorer
    } as unknown as DiscoveryInstance;
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
    expect(restoredVault.triggerMap).toEqual(vault.triggerMap);
    expect(restoredVault.unvaultKey).toBe(vault.unvaultKey);
    expect(restoredVault.txMap).toEqual(vault.txMap);
    expect(restoredVaultFromCache.txMap).toEqual(vault.txMap);
  });
});
