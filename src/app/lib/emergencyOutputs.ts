// Copyright (C) 2026 Jose-Luis Landabaso - https://rewindbitcoin.com
// Licensed under the GNU GPL v3 or later. See the LICENSE file for details.

import {
  address as bitcoinAddress,
  payments,
  type Network
} from 'bitcoinjs-lib';
import { ensureDescriptorsFactoryInstance } from './descriptorsFactory';

export const EMERGENCY_OUTPUT_TYPES = [
  'P2WPKH',
  'P2PKH',
  'P2SH',
  'P2TR',
  'P2WSH'
] as const;
export type EmergencyOutputType = (typeof EMERGENCY_OUTPUT_TYPES)[number];

export const SUPPORTED_EMERGENCY_ADDRESS_TYPES =
  EMERGENCY_OUTPUT_TYPES.join(', ');

export const EMERGENCY_OUTPUT_TYPE_BYTES = 1;
const EMERGENCY_OUTPUT_TYPE_IDS: Record<EmergencyOutputType, number> = {
  P2WPKH: 0,
  P2PKH: 1,
  P2SH: 2,
  P2TR: 3,
  P2WSH: 4
};
const EMERGENCY_OUTPUT_TYPES_BY_ID = Object.fromEntries(
  EMERGENCY_OUTPUT_TYPES.map(type => [EMERGENCY_OUTPUT_TYPE_IDS[type], type])
) as Record<number, EmergencyOutputType>;
export const EMERGENCY_OUTPUT_DATA_BYTES: Record<EmergencyOutputType, number> =
  {
    P2WPKH: 20,
    P2PKH: 20,
    P2SH: 20,
    P2TR: 32,
    P2WSH: 32
  };

export type EmergencyOutputData = {
  type: EmergencyOutputType;
  data: Uint8Array;
};

export const getEmergencyOutputTypeId = (type: EmergencyOutputType) =>
  EMERGENCY_OUTPUT_TYPE_IDS[type];

export const getEmergencyOutputTypeFromId = (typeId: number) => {
  const type = EMERGENCY_OUTPUT_TYPES_BY_ID[typeId];
  if (!type) throw new Error(`Unsupported emergency output type ${typeId}`);
  return type;
};

export const getEmergencyOutputDataBytes = (type: EmergencyOutputType) =>
  EMERGENCY_OUTPUT_DATA_BYTES[type];

const assertEmergencyOutputDataLength = ({
  type,
  data
}: EmergencyOutputData) => {
  const expectedBytes = getEmergencyOutputDataBytes(type);
  if (data.length !== expectedBytes)
    throw new Error(
      `${type} emergency output data should be ${expectedBytes} bytes`
    );
};

const requireBytes = (bytes: Uint8Array | undefined, label: string) => {
  if (!bytes) throw new Error(`Could not determine ${label}`);
  return bytes;
};

export const createEmergencyOutputScript = ({
  type,
  data
}: EmergencyOutputData) => {
  assertEmergencyOutputDataLength({ type, data });
  switch (type) {
    case 'P2WPKH':
      return requireBytes(
        payments.p2wpkh({ hash: data }).output,
        'P2WPKH emergency output script'
      );
    case 'P2PKH':
      return requireBytes(
        payments.p2pkh({ hash: data }).output,
        'P2PKH emergency output script'
      );
    case 'P2SH':
      return requireBytes(
        payments.p2sh({ hash: data }).output,
        'P2SH emergency output script'
      );
    case 'P2TR':
      // bitcoinjs-lib needs the ECC library loaded before it can validate
      // Taproot keys. The descriptors factory is our shared ECC initializer.
      ensureDescriptorsFactoryInstance();
      return requireBytes(
        payments.p2tr({ pubkey: data }).output,
        'P2TR emergency output script'
      );
    case 'P2WSH':
      return requireBytes(
        payments.p2wsh({ hash: data }).output,
        'P2WSH emergency output script'
      );
  }
};

const parseEmergencyOutputData = ({
  type,
  getData
}: {
  type: EmergencyOutputType;
  getData: () => Uint8Array | undefined;
}): EmergencyOutputData | undefined => {
  try {
    const data = getData();
    if (data?.length === getEmergencyOutputDataBytes(type))
      return { type, data };
  } catch (e) {
    void e;
  }
  return undefined;
};

export const getEmergencyOutputDataFromScript = (
  outputScript: Uint8Array
): EmergencyOutputData => {
  const p2wpkh = parseEmergencyOutputData({
    type: 'P2WPKH',
    getData: () => payments.p2wpkh({ output: outputScript }).hash
  });
  if (p2wpkh) return p2wpkh;
  const p2pkh = parseEmergencyOutputData({
    type: 'P2PKH',
    getData: () => payments.p2pkh({ output: outputScript }).hash
  });
  if (p2pkh) return p2pkh;
  const p2sh = parseEmergencyOutputData({
    type: 'P2SH',
    getData: () => payments.p2sh({ output: outputScript }).hash
  });
  if (p2sh) return p2sh;
  const p2tr = parseEmergencyOutputData({
    type: 'P2TR',
    getData: () => {
      // bitcoinjs-lib needs the ECC library loaded before it can validate
      // Taproot keys. The descriptors factory is our shared ECC initializer.
      ensureDescriptorsFactoryInstance();
      return payments.p2tr({ output: outputScript }).pubkey;
    }
  });
  if (p2tr) return p2tr;
  const p2wsh = parseEmergencyOutputData({
    type: 'P2WSH',
    getData: () => payments.p2wsh({ output: outputScript }).hash
  });
  if (p2wsh) return p2wsh;
  throw new Error('Unsupported emergency output script');
};

export const getEmergencyOutputDataFromAddress = (
  addressValue: string,
  network: Network
): EmergencyOutputData | undefined => {
  try {
    const { version, hash } = bitcoinAddress.fromBase58Check(addressValue);
    if (hash.length !== 20) return undefined;
    if (version === network.pubKeyHash) return { type: 'P2PKH', data: hash };
    if (version === network.scriptHash) return { type: 'P2SH', data: hash };
  } catch (e) {
    void e;
  }
  try {
    const { version, prefix, data } = bitcoinAddress.fromBech32(addressValue);
    if (prefix !== network.bech32) return undefined;
    if (version === 0 && data.length === 20) return { type: 'P2WPKH', data };
    if (version === 0 && data.length === 32) return { type: 'P2WSH', data };
    if (version === 1 && data.length === 32) {
      // bitcoinjs-lib needs the ECC library loaded before it can validate
      // Taproot keys. The descriptors factory is our shared ECC initializer.
      ensureDescriptorsFactoryInstance();
      if (payments.p2tr({ pubkey: data }).output) return { type: 'P2TR', data };
    }
  } catch (e) {
    void e;
  }
  return undefined;
};

export const validateEmergencyAddress = (
  addressValue: string,
  network: Network
) => !!getEmergencyOutputDataFromAddress(addressValue, network);
