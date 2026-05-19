// Copyright (C) 2025 Jose-Luis Landabaso - https://rewindbitcoin.com
// Licensed under the GNU GPL v3 or later. See the LICENSE file for details.

import { type Network } from 'bitcoinjs-lib';
import { sha256 } from '@noble/hashes/sha2';
import { MessageFactory } from '@bitcoinerlab/btcmessage';
import * as secp256k1 from '@bitcoinerlab/secp256k1';

import type { Signer } from '../wallets';
import { getMasterNode } from '../vaultDescriptors';
import { getWalletDataKeyPath } from '../rewindPaths';

const SIGNING_MESSAGE = 'Satoshi Nakamoto'; //Can be any, but don't change it
const MessageAPI = MessageFactory(secp256k1);

/**
 * the cipher key used to encrypt data stored in the app
 * (this is not backup related)
 */
export const getWalletDataCipherKey = async ({
  signer,
  network
}: {
  signer: Signer;
  network: Network;
}) => {
  return await getSeedDerivedCipherKey({
    vaultPath: getWalletDataKeyPath(network),
    signer,
    network
  });
};

// Important to be async so that this will also work when using Hardware Wallets
export const getSeedDerivedCipherKey = async ({
  vaultPath,
  signer,
  network
}: {
  vaultPath: string;
  signer: Signer;
  network: Network;
}) => {
  const mnemonic = signer.mnemonic;
  if (!mnemonic) throw new Error('Could not initialize the signer');
  const masterNode = getMasterNode(mnemonic, network);
  const childNode = masterNode.derivePath(vaultPath);
  if (!childNode.privateKey) throw new Error('Could not generate a privateKey');

  const signature = MessageAPI.sign(
    SIGNING_MESSAGE,
    childNode.privateKey,
    true // assumes compressed
  );
  const cipherKey = sha256(signature);

  return cipherKey;
};
