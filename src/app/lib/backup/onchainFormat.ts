// Copyright (C) 2026 Jose-Luis Landabaso - https://rewindbitcoin.com
// Licensed under the GNU GPL v3 or later. See the LICENSE file for details.

import { fromUtf8 } from 'uint8array-tools';
import {
  EMERGENCY_OUTPUT_DATA_BYTES,
  EMERGENCY_OUTPUT_TYPE_BYTES,
  EMERGENCY_OUTPUT_TYPES,
  type EmergencyOutputType
} from '../emergencyOutputs';

export const ONCHAIN_BACKUP_MAGIC = fromUtf8('REW');
export const ONCHAIN_BACKUP_ENTRY_VERSION = 0;
export const ONCHAIN_BACKUP_ENTRY_VERSION_BYTES = 1;
export const LOCK_BLOCKS_BYTES = 2;
export const COMPRESSED_PUBLIC_KEY_BYTES = 33;
export const PUBLIC_KEY_HASH_BYTES = 20;
export const ONCHAIN_BACKUP_SIGNATURE_BYTES = 64;
export const ONCHAIN_BACKUP_NONCE_BYTES = 24;

const uniqueSorted = (values: number[]) =>
  values
    .filter((value, index, array) => array.indexOf(value) === index)
    .sort((a, b) => a - b);

export const ONCHAIN_BACKUP_ENTRY_BASE_BYTES =
  ONCHAIN_BACKUP_ENTRY_VERSION_BYTES +
  EMERGENCY_OUTPUT_TYPE_BYTES +
  LOCK_BLOCKS_BYTES +
  COMPRESSED_PUBLIC_KEY_BYTES +
  ONCHAIN_BACKUP_SIGNATURE_BYTES * 2;

export const getOnChainBackupEntryBytes = (type: EmergencyOutputType) =>
  ONCHAIN_BACKUP_ENTRY_BASE_BYTES + EMERGENCY_OUTPUT_DATA_BYTES[type];

export const getOnChainBackupPayloadBytes = (type: EmergencyOutputType) =>
  ONCHAIN_BACKUP_MAGIC.length + getOnChainBackupEntryBytes(type);

const ONCHAIN_BACKUP_PAYLOAD_BYTES_BY_EMERGENCY_OUTPUT_TYPE =
  Object.fromEntries(
    EMERGENCY_OUTPUT_TYPES.map(type => [
      type,
      getOnChainBackupPayloadBytes(type)
    ])
  ) as Record<EmergencyOutputType, number>;

export const ONCHAIN_BACKUP_PAYLOAD_BYTE_OPTIONS = uniqueSorted(
  Object.values(ONCHAIN_BACKUP_PAYLOAD_BYTES_BY_EMERGENCY_OUTPUT_TYPE)
);
