// Copyright (C) 2026 Jose-Luis Landabaso - https://rewindbitcoin.com
// Licensed under the GNU GPL v3 or later. See the LICENSE file for details.

import { toHex } from 'uint8array-tools';

import type { Signer } from '../wallets';
import { getMasterNode } from '../vaultDescriptors';
import { type NetworkId, networkMapping } from '../network';
import { getVaultPath } from '../rewindPaths';

export const getVaultIdentity = ({
  signer,
  networkId,
  index
}: {
  signer: Signer;
  networkId: NetworkId;
  index: number;
}) => {
  const mnemonic = signer.mnemonic;
  if (!mnemonic) throw new Error('This type of signer is not supported');
  const network = networkMapping[networkId];
  const masterNode = getMasterNode(mnemonic, network);
  const vaultPath = getVaultPath(network, index);
  const vaultNode = masterNode.derivePath(vaultPath);
  if (!vaultNode.publicKey) throw new Error('Could not generate a vaultId');
  return {
    vaultIndex: index,
    vaultId: toHex(vaultNode.publicKey),
    vaultPath
  };
};
