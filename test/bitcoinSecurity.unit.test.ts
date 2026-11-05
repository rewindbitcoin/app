// Copyright (C) 2026 Jose-Luis Landabaso - https://rewindbitcoin.com
// Licensed under the GNU GPL v3 or later. See the LICENSE file for details.

import { Block, Psbt, Transaction } from 'bitcoinjs-lib';
import { entropyToMnemonic } from 'bip39';
import { fromHex } from 'uint8array-tools';

describe('Bitcoin security regressions', () => {
  test('rejects finalized inputs without UTXOs when calculating fees or extracting', () => {
    const psbt = new Psbt();
    psbt.addInput({
      hash: '11'.repeat(32),
      index: 0,
      finalScriptWitness: Uint8Array.from([0])
    });
    psbt.addOutput({ script: fromHex('51'), value: 0n });

    expect(() => psbt.getFee()).toThrow('Need a Utxo input item');
    expect(() => psbt.getFeeRate()).toThrow('Need a Utxo input item');
    expect(() => psbt.extractTransaction()).toThrow('Need a Utxo input item');
  });

  test('rejects conflicting UTXO amounts instead of understating fees', () => {
    const script = fromHex('51');
    const fundingTx = new Transaction();
    fundingTx.addInput(new Uint8Array(32), 0xffffffff);
    fundingTx.addOutput(script, 10000n);

    const psbt = new Psbt();
    psbt.addInput({
      hash: fundingTx.getHash(),
      index: 0,
      nonWitnessUtxo: fundingTx.toBuffer(),
      witnessUtxo: { script, value: 1000n },
      finalScriptWitness: Uint8Array.from([0])
    });
    psbt.addOutput({ script, value: 500n });

    const error = "doesn't match the non-witness UTXO";
    expect(() => psbt.getFee()).toThrow(error);
    expect(() => psbt.getFeeRate()).toThrow(error);
    expect(() => psbt.extractTransaction()).toThrow(error);
  });

  test.each([0, 0x01800001, 0x23000001])(
    'rejects invalid compact proof-of-work target %i',
    bits => {
      const block = new Block();
      block.prevHash = new Uint8Array(32);
      block.merkleRoot = new Uint8Array(32);
      block.bits = bits;
      expect(block.checkProofOfWork()).toBe(false);
    }
  );

  test.each(['00'.repeat(16) + 'z', '00'.repeat(15) + 'zz'])(
    'rejects malformed hexadecimal mnemonic entropy %s',
    entropy => {
      expect(() => entropyToMnemonic(entropy)).toThrow();
    }
  );
});
