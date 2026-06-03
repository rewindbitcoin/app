// Copyright (C) 2026 Jose-Luis Landabaso - https://rewindbitcoin.com
// Licensed under the GNU GPL v3 or later. See the LICENSE file for details.

const BIP329_SUPPORTED_TYPES = [
  'tx',
  'addr',
  'pubkey',
  'input',
  'output',
  'xpub'
] as const;

export type Bip329SupportedType = (typeof BIP329_SUPPORTED_TYPES)[number];
//Bip329SupportedType = | 'tx' | 'addr' | 'pubkey' | 'input' | 'output' | 'xpub';

type WalletLabel = {
  type: Bip329SupportedType;
  ref: string;
  label?: string;
  origin?: string;
  // TODO: We currently preserve BIP-329 `spendable` for import/export only.
  // Wire output `spendable: false` into the existing UTXO spendability policy,
  // keeping the UX wording distinct from Rewind vault freeze/unfreeze.
  spendable?: boolean;
};

type WalletLabelKey = `${Bip329SupportedType}:${string}`;
export type WalletLabels = Record<string, WalletLabel>;

type Bip329ImportWarning = {
  line: number;
  code: 'unsupported-type' | 'noop-record' | 'conflicting-record';
  message: string;
};

type Bip329ImportError = {
  line: number;
  message: string;
};

export type Bip329ImportResult = {
  labels: WalletLabels;
  importedCount: number;
  skippedUnsupportedCount: number;
  conflictingRecordCount: number;
  warnings: Bip329ImportWarning[];
  errors: Bip329ImportError[];
};

const TXID_RE = /^[0-9a-fA-F]{64}$/;
const TXO_RE = /^([0-9a-fA-F]{64}):([0-9]+)$/;
const PUBKEY_RE = /^(?:[0-9a-fA-F]{64}|[0-9a-fA-F]{66}|[0-9a-fA-F]{130})$/;
const NON_WHITESPACE_RE = /^\S+$/;

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isSupportedType = (type: string): type is Bip329SupportedType =>
  (BIP329_SUPPORTED_TYPES as readonly string[]).includes(type);

const hasStoredLabelData = (label: WalletLabel) =>
  label.label !== undefined ||
  label.origin !== undefined ||
  label.spendable !== undefined;

const areLabelsEqual = (first: WalletLabel | undefined, second: WalletLabel) =>
  first !== undefined &&
  first.type === second.type &&
  first.ref === second.ref &&
  first.label === second.label &&
  first.origin === second.origin &&
  first.spendable === second.spendable;

const hasImportedFieldConflict = (
  existing: WalletLabel,
  imported: WalletLabel
) =>
  (existing.label !== undefined &&
    imported.label !== undefined &&
    existing.label !== imported.label) ||
  (existing.origin !== undefined &&
    imported.origin !== undefined &&
    existing.origin !== imported.origin) ||
  (existing.spendable !== undefined &&
    imported.spendable !== undefined &&
    existing.spendable !== imported.spendable);

/**
 * Checks that a BIP-329 `ref` is valid for its `type`, then returns the stable
 * form we use as part of the internal label key.
 *
 * Hex values are lowercased, and outpoint indexes are normalized so `txid:01`
 * and `txid:1` point to the same label. Addresses and xpubs are kept as typed,
 * except they must be non-empty and contain no whitespace.
 *
 * @throws If the reference is malformed for the supplied BIP-329 type.
 */
const normalizeLabelRef = (type: Bip329SupportedType, ref: string): string => {
  if (type === 'tx') {
    if (!TXID_RE.test(ref)) throw new Error('Invalid transaction id');
    return ref.toLowerCase();
  }

  if (type === 'input' || type === 'output') {
    const match = ref.match(TXO_RE);
    if (!match) throw new Error(`Invalid ${type} outpoint`);
    const txid = match[1];
    const indexText = match[2];
    if (!txid || !indexText) throw new Error(`Invalid ${type} outpoint`);
    const index = Number(indexText);
    if (!Number.isSafeInteger(index)) throw new Error('Invalid outpoint index');
    return `${txid.toLowerCase()}:${index}`;
  }

  if (type === 'pubkey') {
    if (!PUBKEY_RE.test(ref)) throw new Error('Invalid public key');
    return ref.toLowerCase();
  }

  if (type === 'addr') {
    if (!ref || !NON_WHITESPACE_RE.test(ref))
      throw new Error('Invalid address');
    return ref;
  }

  if (type === 'xpub') {
    if (!ref || !NON_WHITESPACE_RE.test(ref)) throw new Error('Invalid xpub');
    return ref;
  }

  throw new Error(`Unsupported label type ${type}`);
};

const getWalletLabelKey = (
  type: Bip329SupportedType,
  ref: string
): WalletLabelKey => `${type}:${normalizeLabelRef(type, ref)}`;

const getWalletLabel = (
  labels: WalletLabels | undefined,
  type: Bip329SupportedType,
  ref: string
): WalletLabel | undefined => labels?.[getWalletLabelKey(type, ref)];

export const getWalletLabelText = (
  labels: WalletLabels | undefined,
  type: Bip329SupportedType,
  ref: string
): string => getWalletLabel(labels, type, ref)?.label ?? '';

/**
 * Sets or clears the text for one wallet label.
 *
 * Returns the same labels object when the text did not change. This lets callers
 * skip storage writes for no-op saves.
 */
export const updateWalletLabelText = ({
  labels,
  type,
  ref,
  label
}: {
  labels: WalletLabels;
  type: Bip329SupportedType;
  ref: string;
  label: string;
}): WalletLabels => {
  const normalizedRef = normalizeLabelRef(type, ref);
  const key = getWalletLabelKey(type, normalizedRef);
  const existing = labels[key];
  const normalizedLabel = label.trim();

  if (!normalizedLabel) {
    if (!existing || existing.label === undefined) return labels;
    const { label: omittedLabel, ...labelWithoutText } = existing;
    void omittedLabel;
    const nextLabels = { ...labels };
    if (hasStoredLabelData(labelWithoutText))
      nextLabels[key] = labelWithoutText;
    else delete nextLabels[key];
    return nextLabels;
  }

  if (existing?.label === normalizedLabel) return labels;
  return {
    ...labels,
    [key]: {
      ...existing,
      type,
      ref: normalizedRef,
      label: normalizedLabel
    }
  };
};

/**
 * Combines an imported BIP-329 record with an existing stored label.
 *
 * In BIP-329, an omitted field means "do not change it". If the imported record
 * disagrees with any existing field we preserve, the record is left untouched
 * and reported as a conflict. Missing fields can still be filled by import.
 */
const mergeImportedLabel = (
  existing: WalletLabel | undefined,
  imported: WalletLabel
): { label: WalletLabel; hasConflict: boolean; hasChange: boolean } => {
  if (existing && hasImportedFieldConflict(existing, imported))
    return { label: existing, hasConflict: true, hasChange: false };

  const next: WalletLabel = {
    type: imported.type,
    ref: imported.ref
  };

  if (existing?.label !== undefined) next.label = existing.label;
  if (existing?.origin !== undefined) next.origin = existing.origin;
  if (existing?.spendable !== undefined) next.spendable = existing.spendable;

  if (imported.label !== undefined) next.label = imported.label;
  if (imported.origin !== undefined) next.origin = imported.origin;
  if (imported.spendable !== undefined) next.spendable = imported.spendable;

  return {
    label: next,
    hasConflict: false,
    hasChange: !areLabelsEqual(existing, next)
  };
};

/**
 * Converts one parsed JSON object from a BIP-329 import into an internal label.
 *
 * Return statuses:
 * - `record`: the object is valid and contains data we store.
 * - `unsupported`: the BIP-329 type is known but not supported here yet
 *   (`spscan`), or it is an unknown future/custom type. The import skips it
 *   instead of failing the whole file.
 * - `noop`: the object is valid BIP-329, but there is nothing for us to save.
 *   For example, `{ "type": "tx", "ref": "..." }` points to a transaction but
 *   does not provide a label, origin, or spendable value.
 *
 * @throws If a supported record is malformed, such as an invalid txid or a
 * non-boolean `spendable` value.
 */
const parseObjectRecord = (
  record: Record<string, unknown>
):
  | { status: 'record'; record: WalletLabel }
  | { status: 'unsupported'; type: string }
  | { status: 'noop' } => {
  const rawType = record['type'];
  if (typeof rawType !== 'string') throw new Error('Missing label type');
  if (rawType === 'spscan') return { status: 'unsupported', type: rawType };
  if (!isSupportedType(rawType))
    return { status: 'unsupported', type: rawType };

  const rawRef = record['ref'];
  if (typeof rawRef !== 'string') throw new Error('Missing label ref');
  const normalizedRef = normalizeLabelRef(rawType, rawRef);

  const label: WalletLabel = {
    type: rawType,
    ref: normalizedRef
  };

  if ('label' in record) {
    const rawLabel = record['label'];
    if (typeof rawLabel !== 'string') throw new Error('Invalid label value');
    label.label = rawLabel;
  }

  if ('origin' in record) {
    const rawOrigin = record['origin'];
    if (typeof rawOrigin !== 'string') throw new Error('Invalid origin value');
    label.origin = rawOrigin;
  }

  if ('spendable' in record) {
    const rawSpendable = record['spendable'];
    if (rawType !== 'output')
      throw new Error('spendable is only valid on output labels');
    if (typeof rawSpendable !== 'boolean')
      throw new Error('Invalid spendable value');
    label.spendable = rawSpendable;
  }

  if (!hasStoredLabelData(label)) return { status: 'noop' };
  return { status: 'record', record: label };
};

/**
 * Parses pasted/imported BIP-329 labels and merges them into existing labels.
 *
 * This is the import entrypoint. It reads one JSON object per line, validates
 * supported records, skips unsupported types such as `spscan`, and collects
 * malformed lines as line-numbered errors instead of failing the whole import.
 */
export const parseBip329Labels = (
  jsonLines: string,
  existingLabels: WalletLabels = {}
): Bip329ImportResult => {
  const labels: WalletLabels = { ...existingLabels };
  let importedCount = 0;
  const warnings: Bip329ImportWarning[] = [];
  const errors: Bip329ImportError[] = [];
  let skippedUnsupportedCount = 0;
  let conflictingRecordCount = 0;

  jsonLines.split(/\n/).forEach((line, index) => {
    const lineNumber = index + 1;
    if (!line.trim()) return;

    try {
      const parsed: unknown = JSON.parse(line);
      if (!isObjectRecord(parsed)) throw new Error('Line is not a JSON object');
      const result = parseObjectRecord(parsed);

      if (result.status === 'unsupported') {
        skippedUnsupportedCount += 1;
        warnings.push({
          line: lineNumber,
          code: 'unsupported-type',
          message: `Unsupported BIP-329 label type: ${result.type}`
        });
        return;
      }

      if (result.status === 'noop') {
        warnings.push({
          line: lineNumber,
          code: 'noop-record',
          message:
            'BIP-329 record did not set a label, origin, or spendable value'
        });
        return;
      }

      const key = getWalletLabelKey(result.record.type, result.record.ref);
      const merged = mergeImportedLabel(labels[key], result.record);

      if (merged.hasConflict) {
        conflictingRecordCount += 1;
        warnings.push({
          line: lineNumber,
          code: 'conflicting-record',
          message: 'BIP-329 record conflicts with existing label data'
        });
        return;
      }

      if (!merged.hasChange) return;

      labels[key] = merged.label;
      importedCount += 1;
    } catch (error) {
      errors.push({
        line: lineNumber,
        message:
          error instanceof Error ? error.message : 'Invalid BIP-329 record'
      });
    }
  });

  return {
    labels,
    importedCount,
    skippedUnsupportedCount,
    conflictingRecordCount,
    warnings,
    errors
  };
};

export const serializeBip329Labels = (labels: WalletLabels): string => {
  const lines = Object.keys(labels)
    .sort()
    .map(key => {
      const label = labels[key];
      if (!label) throw new Error(`Missing label for key ${key}`);
      const record: {
        type: Bip329SupportedType;
        ref: string;
        label?: string;
        origin?: string;
        spendable?: boolean;
      } = {
        type: label.type,
        ref: label.ref
      };
      if (label.label !== undefined) record.label = label.label;
      if (label.origin !== undefined) record.origin = label.origin;
      if (label.spendable !== undefined) record.spendable = label.spendable;
      return JSON.stringify(record);
    });

  return lines.length ? `${lines.join('\n')}\n` : '';
};
