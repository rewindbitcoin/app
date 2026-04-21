// Copyright (C) 2025 Jose-Luis Landabaso - https://rewindbitcoin.com
// Licensed under the GNU GPL v3 or later. See the LICENSE file for details.

import { networks, type Network } from 'bitcoinjs-lib';
import { toHex } from 'uint8array-tools';
import { fixtures } from './fixtutres';
import {
  createColdAddress,
  createAddressOutput,
  createUnvaultKeyExpression,
  getDefaultAccount,
  getMainAccount,
  getMasterNode
} from '../dist/src/app/lib/vaultDescriptors';
import {
  type Accounts,
  type Signer,
  type Signers
} from '../dist/src/app/lib/wallets';

const network = networks.regtest;

const DUMMY_ADDRESS = (network: Network) => {
  if (network === networks.bitcoin)
    return 'bc1qp2u85wn9cekkw3khr3trpsznakhhfkekpk2mld';
  if (network === networks.regtest)
    return 'bcrt1qq7m6la3syc6wk5fglznegngxe5lhy8aajevva9';
  if (network === networks.testnet)
    return 'tb1qm0k9mn48uqfs2w9gssvzmus4j8srrx5eje7wpf';
  throw new Error('Network not supported');
};

describe('vaultDescriptors unit tests', () => {
  const { MNEMONIC, COLD_MNEMONIC, expected } = fixtures.edge2edge;
  const masterNode = getMasterNode(MNEMONIC, network);
  const masterFingerprint = toHex(masterNode.fingerprint);
  const signer: Signer = {
    masterFingerprint,
    type: 'SOFTWARE',
    mnemonic: MNEMONIC
  };
  const signers: Signers = { 0: signer };

  test('createUnvaultKeyExpression', async () => {
    const unvaultKey = await createUnvaultKeyExpression({ signer, network });
    expect(unvaultKey).toBe(expected.unvaultKey);
  });

  test('createColdAddress', async () => {
    const coldAddress = await createColdAddress(COLD_MNEMONIC, network);
    expect(coldAddress).toBe(expected.coldAddress);
  });

  test('getDefaultAccount', async () => {
    const defaultAccount = await getDefaultAccount(signers, network);
    expect(defaultAccount).toBe(expected.defaultAccount);
  });

  test('getMainAccount', () => {
    const accounts: Accounts = {
      [expected.defaultAccount]: { discard: false }
    };
    const mainAccount = getMainAccount(accounts, network);
    expect(mainAccount).toBe(expected.defaultAccount);
  });

  test('createAddressOutput', () => {
    const serviceOutput = createAddressOutput(
      DUMMY_ADDRESS(network),
      network
    );
    expect(serviceOutput.getAddress()).toBe(DUMMY_ADDRESS(network));
  });
});
