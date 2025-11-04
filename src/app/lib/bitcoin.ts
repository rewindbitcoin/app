// Copyright (C) 2025 Jose-Luis Landabaso - https://rewindbitcoin.com
// Licensed under the GNU GPL v3 or later. See the LICENSE file for details.

import moize from 'moize';
import { Transaction } from 'bitcoinjs-lib';
export const transactionFromHex = moize(
  (txHex: string) => {
    const tx = Transaction.fromHex(txHex);
    const txId = tx.getId();
    return { tx, txId };
  },
  {
    maxSize: 1000
  }
);
