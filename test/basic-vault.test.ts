// Copyright (C) 2025 Jose-Luis Landabaso - https://rewindbitcoin.com
// Licensed under the GNU GPL v3 or later. See the LICENSE file for details.

import { RegtestUtils } from 'regtest-client';
import { networks } from 'bitcoinjs-lib';
import { toHex } from 'uint8array-tools';
import * as secp256k1 from '@bitcoinerlab/secp256k1';
import * as descriptors from '@bitcoinerlab/descriptors';
const scriptExpressions = descriptors.scriptExpressions;
const keyExpressionBIP32 = descriptors.keyExpressionBIP32;
import { mnemonicToSeedSync } from 'bip39';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { encode: olderEncode } = require('bip68');
import { compilePolicy, ready } from '@bitcoinerlab/miniscript-policies';
import { EsploraExplorer } from '@bitcoinerlab/explorer';
const { Output, BIP32, ECPair } = descriptors.DescriptorsFactory(secp256k1);

const regtestUtils = new RegtestUtils();
import { DiscoveryFactory } from '@bitcoinerlab/discovery';

describe('Basic Vault', () => {
  const network = networks.regtest;
  const lockBlocks = 1;

  const SEED =
    'mystery kidney army immune caught trend fury version cube magic faint couch';

  const BALANCE = 10000;
  let standardDescriptors: Array<string>;
  let vaultDescriptor: string;
  let vaultAddress: string;

  beforeAll(async () => {});

  const esploraPort = process.env['ESPLORA_PORT'] || '3002';
  test('Create and fund a vault', async () => {
    await ready;
    const POLICY = (older: number) =>
      `or(pk(@panicKey),99@and(pk(@unvaultKey),older(${older})))`;
    const older = olderEncode({ blocks: lockBlocks });
    const { miniscript, issane } = compilePolicy(POLICY(older));
    if (!issane) throw new Error('Policy not sane');

    const masterNode = BIP32.fromSeed(mnemonicToSeedSync(SEED), network);
    standardDescriptors = [0, 1].map(change =>
      scriptExpressions.wpkhBIP32({
        masterNode,
        network,
        account: 0,
        index: '*',
        change
      })
    );
    const unvaultKey = keyExpressionBIP32({
      masterNode,
      originPath: "/0'",
      keyPath: '/0'
    });

    const panicPair = ECPair.makeRandom();
    const panicPubKey = panicPair.publicKey;

    vaultDescriptor = `wsh(${miniscript
      .replace('@unvaultKey', unvaultKey)
      .replace('@panicKey', toHex(panicPubKey))})`;

    const vaultOutput = new Output({ descriptor: vaultDescriptor, network });
    vaultAddress = vaultOutput.getAddress();
    await regtestUtils.faucet(vaultAddress, BALANCE);
    await new Promise(resolve => setTimeout(resolve, 15000)); //Esplora is slow at times!
    const { Discovery } = DiscoveryFactory(
      new EsploraExplorer({ url: `http://127.0.0.1:${esploraPort}` }),
      network
    );
    const discovery = new Discovery();
    const blockHeight = await regtestUtils.height();
    expect(blockHeight).toBeGreaterThan(0);
    const explorerBlockHeight = await discovery
      .getExplorer()
      .fetchBlockHeight();
    expect(blockHeight).toBe(explorerBlockHeight);
    const descriptors = [...standardDescriptors, vaultDescriptor];
    await discovery.fetch({ descriptors });
    const { utxos, balance } = discovery.getUtxosAndBalance({ descriptors });
    expect(utxos.length).toBeGreaterThanOrEqual(1);
    expect(balance).toBeGreaterThanOrEqual(BALANCE);
  }, 20000);
});
