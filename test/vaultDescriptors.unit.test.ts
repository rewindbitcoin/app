// Copyright (C) 2025 Jose-Luis Landabaso - https://rewindbitcoin.com
// Licensed under the GNU GPL v3 or later. See the LICENSE file for details.

import { networks } from 'bitcoinjs-lib';
import { fixtures } from './fixtutres';
import {
  createColdAddress,
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

const network = networks.regtest;

describe('vaultDescriptors unit tests', () => {
  const { MNEMONIC, COLD_MNEMONIC, expected } = fixtures.edge2edge;
  const masterNode = getMasterNode(MNEMONIC, network);
  const masterFingerprint = masterNode.fingerprint.toString('hex');
  const signer: Signer = {
    masterFingerprint,
    type: 'SOFTWARE',
    mnemonic: MNEMONIC
  };
  const signers: Signers = { 0: signer };

  test('createUnvaultKey', async () => {
    const unvaultKey = await createUnvaultKey({ signer, network });
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

  test('createServiceOutput', () => {
    const serviceOutput = createServiceOutput(
      DUMMY_SERVICE_ADDRESS(network),
      network
    );
    expect(serviceOutput.getAddress()).toBe(DUMMY_SERVICE_ADDRESS(network));
  });
});
