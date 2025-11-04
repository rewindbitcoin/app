// Copyright (c) 2025 Jose-Luis Landabaso - https://rewindbitcoin.com
// Distributed under the GPL software license

import { RegtestUtils } from 'regtest-client';
import { networks, Psbt } from 'bitcoinjs-lib';
import { fixtures } from './fixtutres';
const network = networks.regtest;
const networkId = 'REGTEST';
import * as secp256k1 from '@bitcoinerlab/secp256k1';
import {
  DescriptorsFactory,
  scriptExpressions,
  signers as descriptorsSigners
} from '@bitcoinerlab/descriptors';
const signBIP32 = descriptorsSigners.signBIP32;
import { type OutputInstance } from '@bitcoinerlab/descriptors';
import {
  ESPLORA_LOCAL_REGTEST_URL,
  EsploraExplorer
} from '@bitcoinerlab/explorer';
const { Output, parseKeyExpression } = DescriptorsFactory(secp256k1);

const regtestUtils = new RegtestUtils();
import { DiscoveryFactory, DiscoveryInstance } from '@bitcoinerlab/discovery';

const sleep = async (ms: number) =>
  await new Promise(resolve => setTimeout(resolve, ms));

import {
  createVault,
  getHotDescriptors,
  getUtxosData,
  type Vaults,
  type Vault,
  type VaultsStatuses
} from '../dist/src/app/lib/vaults';
import {
  createServiceOutput,
  createUnvaultKey,
  DUMMY_SERVICE_ADDRESS,
  getDefaultAccount,
  getMainAccount,
  getMasterNode
} from '../dist/src/app/lib/vaultDescriptors';
import {
  type Accounts,
  type Signer,
  type Signers
} from '../dist/src/app/lib/wallets';
import { createColdAddress } from '../dist/src/app/lib/vaultDescriptors';
import { transactionFromHex } from '../dist/src/app/lib/bitcoin';
import { findLowestTrueBinarySearch } from '../dist/src/common/lib/binarySearch';

type InitUnfreezeData = {
  txHex: string;
  txId: string;
  fee: number;
  feeRate: number;
  vSize: number;
};
const findNextEqualOrLargerFeeRate = (
  triggerSortedTxs: Array<InitUnfreezeData>,
  feeRate: number
) => {
  const result = findLowestTrueBinarySearch(
    triggerSortedTxs.length - 1,
    index => triggerSortedTxs[index]!.feeRate >= feeRate,
    100 //100 iterations at most
  );
  if (result.value !== undefined) return triggerSortedTxs[result.value]!;
  else return null;
};

describe('E2E: Multiple Pre-Signed txs Vault', () => {
  const {
    MNEMONIC,
    COLD_MNEMONIC,
    BURN_MNEMONIC,
    VAULT_PATH,
    FAUCET_AMOUNT,
    VAULTED_AMOUNT,
    GAP_LIMIT,
    SAMPLES,
    PRESIGNED_FEE_RATE_CEILING,
    MAX_PRESIGNED_FEE_RATE_CEILING,
    LOCK_BLOCKS,
    TRIGGER_FEE_RATE,
    expected
  } = fixtures.edge2edge;
  const burnMasterNode = getMasterNode(BURN_MNEMONIC, network);
  const burnDescriptor = scriptExpressions.wpkhBIP32({
    masterNode: burnMasterNode,
    network,
    account: 0,
    index: 0,
    change: 1
  });
  const burnOutput = new Output({ descriptor: burnDescriptor, network });

  const vaults: Vaults = {};
  const vaultsStatuses: VaultsStatuses = {};

  const masterNode = getMasterNode(MNEMONIC, network);

  const esploraPort = process.env['ESPLORA_PORT'] || '3002';
  let unvaultKey: string;
  let unvaultPubKey: Buffer;
  const signers: Signers = {};
  let signer: Signer;
  test('Create signer', async () => {
    const masterFingerprint = masterNode.fingerprint.toString('hex');
    signer = {
      masterFingerprint,
      type: 'SOFTWARE',
      mnemonic: MNEMONIC
    };
    signers[0] = signer;
    expect(signers[0]).toEqual({
      masterFingerprint: expected.masterFingerprint,
      type: 'SOFTWARE',
      mnemonic: MNEMONIC
    });
  });
  test('Create unvault key', async () => {
    unvaultKey = await createUnvaultKey({ signer, network });
    const unvaultKeyInfo = parseKeyExpression({
      keyExpression: unvaultKey,
      network
    });
    if (!unvaultKeyInfo.pubkey) throw new Error();
    unvaultPubKey = unvaultKeyInfo.pubkey;
    expect(unvaultKey).toBe(expected.unvaultKey);
    expect(unvaultPubKey).toEqual(
      Buffer.from(expected.unvaultPubKeyHex, 'hex')
    );
  });
  let coldAddress: string;
  test('Create cold address', async () => {
    coldAddress = await createColdAddress(COLD_MNEMONIC, network);
    expect(coldAddress).toBe(expected.coldAddress);
  });
  let accounts: Accounts;
  test('Create default accounts', async () => {
    const defaultAccount = await getDefaultAccount(signers, network);
    accounts = { [defaultAccount]: { discard: false } };
    expect(Object.keys(accounts)[0]).toBe(expected.defaultAccount);
    expect(accounts[defaultAccount]).toEqual({ discard: false });
  });
  let explorer: EsploraExplorer;
  let discovery: DiscoveryInstance;
  test('Create explorer and discovery instance', async () => {
    explorer = new EsploraExplorer({ url: `http://127.0.0.1:${esploraPort}` });
    const { Discovery } = DiscoveryFactory(explorer, network);
    discovery = new Discovery();
  });
  let descriptors: Array<string>;
  test('Discovery initial fetch', async () => {
    const tipHeight = await explorer.fetchBlockHeight();
    expect(typeof tipHeight).toBe('number');
    expect(tipHeight).toBeGreaterThan(0);
    descriptors = getHotDescriptors(
      vaults,
      vaultsStatuses,
      accounts,
      tipHeight
    );
    expect(descriptors).toEqual(expected.descriptors);

    await discovery.fetch({ descriptors, gapLimit: GAP_LIMIT });
  });
  let changeDescriptorWithIndex: { descriptor: string; index: number };
  test('Create change descriptor', async () => {
    const account = getMainAccount(accounts, network);
    const changeDescriptor = account.replace(/\/0\/\*/g, '/1/*');
    expect(changeDescriptor).toBe(expected.changeDescriptor);
    changeDescriptorWithIndex = {
      descriptor: changeDescriptor,
      index: discovery.getNextIndex({
        descriptor: changeDescriptor
      })
    };
    //change index will be incread on each run
    //expect(changeDescriptorWithIndex.index).toBe(0);
  });
  let serviceOutput: OutputInstance;
  test('Create serviceOutput', async () => {
    serviceOutput = createServiceOutput(
      DUMMY_SERVICE_ADDRESS(network),
      network
    );
  });
  test('Fund the wallet', async () => {
    const account = getMainAccount(accounts, network);
    const receiveDescriptor = account;
    const nextIndex = discovery.getNextIndex({ descriptor: receiveDescriptor });
    const nextOutput = new Output({
      descriptor: receiveDescriptor,
      index: nextIndex,
      network
    });
    await regtestUtils.faucet(nextOutput.getAddress(), FAUCET_AMOUNT);
    await discovery.fetch({ descriptors, gapLimit: GAP_LIMIT });
  });
  let vault:
    | Vault
    | 'COINSELECT_ERROR'
    | 'NOT_ENOUGH_FUNDS'
    | 'USER_CANCEL'
    | 'UNKNOWN_ERROR';
  test('Create the vault', async () => {
    const utxos = discovery.getUtxos({ descriptors });
    const utxosData = getUtxosData(utxos, vaults, network, discovery);

    const vaultPath = VAULT_PATH.replace(
      '<network>',
      network === networks.bitcoin ? '0' : '1'
    ).replace('<index>', '0');

    const vaultNode = masterNode.derivePath(vaultPath);
    if (!vaultNode.publicKey) throw new Error('Could not generate a vaultId');
    const vaultId = vaultNode.publicKey.toString('hex');

    const onProgress = (progress: number) => {
      void progress;
      return true;
    };

    vault = await createVault({
      vaultedAmount: VAULTED_AMOUNT,
      unvaultKey,
      samples: SAMPLES,
      feeRate: 2,
      serviceFee: 1000,
      /** This is the largest fee rate for which at least one trigger and panic txs
       * must be pre-computed*/
      feeRateCeiling: PRESIGNED_FEE_RATE_CEILING,
      /** This is the largest fee rate for which
       * this function computes presigned txs while there
       * is still room.
       * F.ex.: the max avaiable feeRate for the
       * triggerTx can be maxFeeRateCeiling > feeRate > feeRateCeiling */
      maxFeeRateCeiling: MAX_PRESIGNED_FEE_RATE_CEILING,
      coldAddress,
      changeDescriptorWithIndex,
      serviceOutput,
      lockBlocks: LOCK_BLOCKS,
      signer,
      networkId,
      utxosData,
      nextVaultId: vaultId,
      nextVaultPath: vaultPath,
      onProgress
    });
    expect(typeof vault).toBe('object');
    if (typeof vault === 'object') {
      expect(vault.vaultedAmount).toBe(VAULTED_AMOUNT);
      expect(vault.lockBlocks).toBe(LOCK_BLOCKS);
      expect(vault.unvaultKey).toBe(unvaultKey);
      //There must be at least SAMPLES trigger txs + 1 vault tx
      expect(Object.keys(vault.txMap).length).toBeGreaterThan(SAMPLES);
      //There must be some trigger txs
      expect(Object.keys(vault.triggerMap).length).toBeGreaterThan(0);
    }

    if (typeof vault !== 'object') throw new Error();
    vaults[vault.vaultId] = vault;
    vaultsStatuses[vault.vaultId] = {
      vaultPushTime: Math.floor(Date.now() / 1000),
      vaultTxBlockHeight: 0
    };
  }, 10000);
  test('Push it', async () => {
    if (typeof vault !== 'object') throw new Error();
    await discovery.push({ txHex: vault.vaultTxHex, gapLimit: GAP_LIMIT });
  });
  let triggerTxData: InitUnfreezeData | null;
  test('Init the unfreeze and mine it', async () => {
    if (typeof vault !== 'object') throw new Error();
    const triggerSortedTxs = Object.entries(vault.triggerMap)
      .map(([triggerTxHex]) => {
        if (typeof vault !== 'object') throw new Error();
        const txData = vault.txMap[triggerTxHex];
        if (!txData) throw new Error('trigger tx not mapped');
        const { tx } = transactionFromHex(triggerTxHex);
        return { ...txData, vSize: tx.virtualSize(), txHex: triggerTxHex };
      })
      .sort((a, b) => a.feeRate - b.feeRate);
    triggerTxData = findNextEqualOrLargerFeeRate(
      triggerSortedTxs,
      TRIGGER_FEE_RATE
    );
    expect(triggerTxData).not.toBeNull();
    if (triggerTxData === null) throw new Error();
    expect(triggerTxData.feeRate).toBeGreaterThanOrEqual(TRIGGER_FEE_RATE);
    await discovery.push({ txHex: triggerTxData.txHex, gapLimit: GAP_LIMIT });
    await regtestUtils.mine(1);
    await sleep(1000);
  });
  test('Try to access vaulted funds (will fail)', async () => {
    if (typeof vault !== 'object') throw new Error();
    //note that the triggerDescriptor will change on each run since
    //a tmp key is created internally
    //Same for the triggerAddress
    expect(vault.triggerDescriptor).toMatch(/^wsh\(andor\(pk\(/);
    expect(vault.triggerDescriptor).toContain(unvaultKey);
    expect(vault.triggerDescriptor).toContain(`older(${LOCK_BLOCKS})`);

    const triggerOutput = new Output({
      descriptor: vault.triggerDescriptor,
      signersPubKeys: [unvaultPubKey],
      network
    });

    const triggerAddress = triggerOutput.getAddress();
    expect(triggerAddress).toMatch(/^bcrt1q/);

    //Don't use regtestUtils.unspents: https://github.com/bitcoinjs/regtest-server/issues/23
    const response = await fetch(
      `${ESPLORA_LOCAL_REGTEST_URL}/address/${triggerAddress}/utxo`
    );
    const triggerUtxos = await response.json();
    expect(triggerUtxos).toHaveLength(1);
    expect(triggerUtxos[0].vout).toBe(0);
    expect(triggerUtxos[0].value).toBeLessThan(VAULTED_AMOUNT);
    expect(typeof triggerUtxos[0].status.confirmed).toBe('boolean');

    const psbt = new Psbt({ network });
    const { txHex } = await regtestUtils.fetch(triggerUtxos[0].txid);
    const finalize = triggerOutput.updatePsbtAsInput({
      psbt,
      vout: 0,
      txHex
    });
    burnOutput.updatePsbtAsOutput({ psbt, value: triggerUtxos[0].value - 500 });

    signBIP32({ psbt, masterNode });
    finalize({ psbt });

    const attackTxHex = psbt.extractTransaction(true).toHex();
    //expect this to throw and the error message must contain non-BIP68-final
    await expect(
      discovery.push({
        txHex: attackTxHex,
        gapLimit: GAP_LIMIT
      })
    ).rejects.toThrow(/non-BIP68-final/);
  });
  test('Send it to the panic address', async () => {
    if (typeof vault !== 'object') throw new Error();
    if (triggerTxData === null) throw new Error();
    const panicTxs = vault.triggerMap[triggerTxData.txHex];
    if (!panicTxs) throw new Error('Invalid triggerMap');
    //Push the panic tx with largest fee
    //expect above not to throw
    await expect(
      discovery.push({
        txHex: panicTxs[panicTxs.length - 1]!,
        gapLimit: GAP_LIMIT
      })
    ).resolves.not.toThrow();
  });
});
