// Copyright (C) 2026 Jose-Luis Landabaso - https://rewindbitcoin.com
// Licensed under the GNU GPL v3 or later. See the LICENSE file for details.

import {
  getWalletLabelText,
  parseBip329Labels,
  serializeBip329Labels,
  updateWalletLabelText,
  type WalletLabels
} from '../dist/src/app/lib/labels';

const TXID = 'f91d0a8a78462bc59398f2c5d7a84fcff491c26ba54c4833478b202796c8aafd';
const TXID_UPPER = TXID.toUpperCase();
const OUTPUT_REF = `${TXID}:1`;
const TX_LABEL_KEY = `tx:${TXID}`;
const OUTPUT_LABEL_KEY = `output:${OUTPUT_REF}`;

describe('BIP-329 labels', () => {
  test('parses supported records and skips spscan records', () => {
    const result = parseBip329Labels(
      [
        JSON.stringify({
          type: 'tx',
          ref: TXID_UPPER,
          label: 'Transaction',
          origin: "wpkh([d34db33f/84'/0'/0'])"
        }),
        JSON.stringify({
          type: 'output',
          ref: OUTPUT_REF,
          label: 'Output',
          spendable: false
        }),
        JSON.stringify({ type: 'spscan', ref: 'spscan1qexample', label: 'SP' })
      ].join('\n')
    );

    expect(result.errors).toEqual([]);
    expect(result.importedCount).toBe(2);
    expect(result.skippedUnsupportedCount).toBe(1);
    expect(result.conflictingRecordCount).toBe(0);
    expect(result.warnings).toEqual([
      {
        line: 3,
        code: 'unsupported-type',
        message: 'Unsupported BIP-329 label type: spscan'
      }
    ]);
    expect(getWalletLabelText(result.labels, 'tx', TXID)).toBe('Transaction');
    expect(result.labels[OUTPUT_LABEL_KEY]).toEqual({
      type: 'output',
      ref: OUTPUT_REF,
      label: 'Output',
      spendable: false
    });
  });

  test('roundtrips exported labels deterministically', () => {
    const labels: WalletLabels = {
      [TX_LABEL_KEY]: {
        type: 'tx',
        ref: TXID,
        label: 'Transaction',
        origin: "wpkh([d34db33f/84'/0'/0'])"
      },
      [OUTPUT_LABEL_KEY]: {
        type: 'output',
        ref: OUTPUT_REF,
        label: 'Output',
        spendable: false
      }
    };

    const exported = serializeBip329Labels(labels);
    expect(exported).toBe(
      `${JSON.stringify({ type: 'output', ref: OUTPUT_REF, label: 'Output', spendable: false })}\n` +
        `${JSON.stringify({ type: 'tx', ref: TXID, label: 'Transaction', origin: "wpkh([d34db33f/84'/0'/0'])" })}\n`
    );
    expect(parseBip329Labels(exported).labels).toEqual(labels);
  });

  test('reports invalid records with line numbers', () => {
    const result = parseBip329Labels(
      [
        JSON.stringify({ type: 'tx', ref: TXID, label: 'Good' }),
        'not json',
        JSON.stringify({ type: 'tx', ref: 'bad', label: 'Bad txid' }),
        JSON.stringify({
          type: 'output',
          ref: `${TXID}:0`,
          label: 'Bad spendable',
          spendable: 'false'
        })
      ].join('\n')
    );

    expect(result.importedCount).toBe(1);
    expect(result.errors.map(error => error.line)).toEqual([2, 3, 4]);
  });

  test('skips conflicting records without clearing omitted fields', () => {
    const firstImport = parseBip329Labels(
      JSON.stringify({
        type: 'output',
        ref: OUTPUT_REF,
        label: 'Old output',
        spendable: false
      })
    );

    const secondImport = parseBip329Labels(
      [
        JSON.stringify({
          type: 'output',
          ref: OUTPUT_REF,
          label: 'New output'
        }),
        JSON.stringify({ type: 'output', ref: OUTPUT_REF, spendable: true }),
        JSON.stringify({
          type: 'output',
          ref: OUTPUT_REF,
          origin: "wpkh([d34db33f/84'/0'/0'])"
        })
      ].join('\n'),
      firstImport.labels
    );
    const repeatedImport = parseBip329Labels(
      JSON.stringify({
        type: 'output',
        ref: OUTPUT_REF,
        origin: "wpkh([d34db33f/84'/0'/0'])"
      }),
      secondImport.labels
    );
    const originConflictImport = parseBip329Labels(
      JSON.stringify({
        type: 'output',
        ref: OUTPUT_REF,
        origin: "wpkh([badc0de/84'/0'/0'])"
      }),
      secondImport.labels
    );

    expect(secondImport.importedCount).toBe(1);
    expect(secondImport.conflictingRecordCount).toBe(2);
    expect(secondImport.warnings).toEqual([
      {
        line: 1,
        code: 'conflicting-record',
        message: 'BIP-329 record conflicts with existing label data'
      },
      {
        line: 2,
        code: 'conflicting-record',
        message: 'BIP-329 record conflicts with existing label data'
      }
    ]);
    expect(secondImport.labels[OUTPUT_LABEL_KEY]).toEqual({
      type: 'output',
      ref: OUTPUT_REF,
      label: 'Old output',
      spendable: false,
      origin: "wpkh([d34db33f/84'/0'/0'])"
    });
    expect(repeatedImport.importedCount).toBe(0);
    expect(repeatedImport.labels).toEqual(secondImport.labels);
    expect(originConflictImport.importedCount).toBe(0);
    expect(originConflictImport.conflictingRecordCount).toBe(1);
    expect(originConflictImport.labels).toEqual(secondImport.labels);
  });

  test('updates label text while preserving imported metadata', () => {
    const labels = parseBip329Labels(
      JSON.stringify({
        type: 'output',
        ref: OUTPUT_REF,
        label: 'Imported label',
        spendable: false
      })
    ).labels;

    const edited = updateWalletLabelText({
      labels,
      type: 'output',
      ref: OUTPUT_REF,
      label: '  User label  '
    });
    const removed = updateWalletLabelText({
      labels: edited,
      type: 'output',
      ref: OUTPUT_REF,
      label: ' '
    });

    expect(getWalletLabelText(edited, 'output', OUTPUT_REF)).toBe('User label');
    expect(removed[OUTPUT_LABEL_KEY]).toEqual({
      type: 'output',
      ref: OUTPUT_REF,
      spendable: false
    });
  });
});
