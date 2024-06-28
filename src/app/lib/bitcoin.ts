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
