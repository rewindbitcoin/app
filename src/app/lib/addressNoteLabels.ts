// Copyright (C) 2026 Jose-Luis Landabaso - https://rewindbitcoin.com
// Licensed under the GNU GPL v3 or later. See the LICENSE file for details.

import {
  address as bitcoinAddress,
  type Network,
  type Transaction
} from 'bitcoinjs-lib';
import { getWalletLabelText, type WalletLabels } from './labels';

export const getOutputAddressNoteText = ({
  labels,
  tx,
  vout,
  network
}: {
  labels: WalletLabels | undefined;
  tx: Transaction;
  vout: number;
  network: Network;
}) => {
  const output = tx.outs[vout];
  if (!output) return '';
  try {
    const outputAddress = bitcoinAddress.fromOutputScript(
      output.script,
      network
    );
    return getWalletLabelText(labels, 'addr', outputAddress);
  } catch {
    return '';
  }
};

export const getOwnedOutputAddressNoteText = ({
  labels,
  tx,
  outs,
  network
}: {
  labels: WalletLabels | undefined;
  tx: Transaction;
  outs: Array<{ ownedTxo: string | false }>;
  network: Network;
}) => {
  for (const [vout, output] of outs.entries()) {
    if (!output.ownedTxo) continue;
    const label = getOutputAddressNoteText({ labels, tx, vout, network });
    if (label) return label;
  }
  return '';
};
