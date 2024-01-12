//TODO: Test this json.stringify function which is faster for typescript:
//  -> In addition, it supports Uint8Array
//https://dev.to/samchon/i-made-10x-faster-jsonstringify-functions-even-type-safe-2eme

/**
 * IMPORTANT, when using SECURESTORE, id requireAuthentication = true, the data
 * is tied to the current biometric methods. So if the user adds a new
 * fingerprint or changes the faceId, then the data won't be recoverable:
 * From https://docs.expo.dev/versions/v50.0.0/sdk/securestore
 *    Keys are invalidated by the system when biometrics change, such as adding a new fingerprint or changing the face profile used for face recognition. After a key has been invalidated, it becomes impossible to read its value. This only applies to values stored with requireAuthentication set to true.
 *
 * For the moment it is set as requireAuthentication false. This needs to be
 * properly tested and we must offer the user a way to re-enter the seed in that
 * case (reassociating it with the wallet). For the moment avoid this.
 *
 * requireAuthentication false is as safe as requireAuthentication true if the
 * device is locked. It can also survive FaceId or TouhcId changes:
 * Read more:
 * https://github.com/expo/expo/issues/22312
 */

import { MMKV } from 'react-native-mmkv';
const mmkvStorage = new MMKV();
import memoize from 'lodash.memoize';

import { Platform } from 'react-native';

import { get as idbGet, set as idbSet, del as idbDel } from 'idb-keyval';

//Note this package has been patch-packaged:
//After patch-pachate you need to npx expo prebuild
//https://github.com/expo/expo/issues/17804
import { hasHardwareAsync, isEnrolledAsync } from 'expo-local-authentication';

import {
  AFTER_FIRST_UNLOCK,
  getItemAsync as secureStoreOriginalGetItemAsync,
  setItemAsync as secureStoreOriginalSetItemAsync,
  deleteItemAsync as secureStoreDeleteItemAsync,
  SecureStoreOptions,
  deleteItemAsync,
  isAvailableAsync
} from 'expo-secure-store';

export const canUseSecureStorage = async () => {
  return (
    Platform.OS !== 'web' &&
    (await isAvailableAsync()) &&
    (await hasHardwareAsync()) &&
    (await isEnrolledAsync())
  );
};

//github.com/expo/expo/issues/23426
const secureStoreGetItemAsync = async (
  key: string,
  options: SecureStoreOptions
) => {
  if (!(await canUseSecureStorage()))
    throw new Error('Device does not support secure storage');
  for (let attempts = 0; attempts < 5; attempts++) {
    try {
      const value = await secureStoreOriginalGetItemAsync(key, options);
      return value;
    } catch (error) {
      console.warn(error);
    }
  }
  await deleteItemAsync(key);
  return await secureStoreOriginalGetItemAsync(key, options);
};
const secureStoreSetItemAsync = async (
  key: string,
  value: string,
  options: SecureStoreOptions
) => {
  if (!(await canUseSecureStorage()))
    throw new Error('Device does not support secure storage');
  for (let attempts = 0; attempts < 5; attempts++) {
    try {
      return await secureStoreOriginalSetItemAsync(key, value, options);
    } catch (error) {
      console.warn(error);
    }
  }
  await deleteItemAsync(key);
  return await secureStoreOriginalSetItemAsync(key, value, options);
};

const secureStoreOptions = {
  requireAuthentication: true,
  keychainAccessible: AFTER_FIRST_UNLOCK
};

import { xchacha20poly1305 } from '@noble/ciphers/chacha';
import { utf8ToBytes, bytesToUtf8 } from '@noble/ciphers/utils';
import { managedNonce } from '@noble/ciphers/webcrypto/utils';

// Memoized function to get the ChaCha encoder instance
const getManagedChacha = memoize(
  (key: Uint8Array) => {
    const chacha = managedNonce(xchacha20poly1305)(key);
    return chacha;
  },
  (key: Uint8Array) => [...key].join(',')
);

export const NUMBER = 'NUMBER';
export const STRING = 'STRING';
export const SERIALIZABLE = 'SERIALIZABLE';
export const BOOLEAN = 'BOOLEAN';
export const UINT8ARRAY = 'UINT8ARRAY';

type SerializationFormatMapping = {
  [NUMBER]: number | null | undefined;
  [STRING]: string | null | undefined;
  // serializable with JSON.stringify in mmkv & with "structured serialisation"
  // in IndexedDB for web:
  [SERIALIZABLE]: object | null | undefined;
  [BOOLEAN]: boolean | null | undefined;
  [UINT8ARRAY]: Uint8Array | null | undefined;
};
export type SerializationFormat = keyof SerializationFormatMapping;

export const assertSerializationFormat = (
  value: unknown,
  serializationFormat: SerializationFormat
) => {
  if (value === null || value === undefined) {
    throw new Error(`Value cannot be null or undefined`);
  }

  switch (serializationFormat) {
    case NUMBER:
      if (typeof value !== 'number') {
        throw new Error(`Expected a number, got ${typeof value}`);
      }
      break;
    case STRING:
      if (typeof value !== 'string') {
        throw new Error(`Expected a string, got ${typeof value}`);
      }
      break;
    case SERIALIZABLE:
      if (typeof value !== 'object' || value instanceof Uint8Array) {
        throw new Error(`Expected an object, got ${typeof value}`);
      }
      break;
    case BOOLEAN:
      if (typeof value !== 'boolean') {
        throw new Error(`Expected a boolean, got ${typeof value}`);
      }
      break;
    case UINT8ARRAY:
      if (!(value instanceof Uint8Array)) {
        throw new Error(`Expected a Uint8Array, got ${typeof value}`);
      }
      break;
    default:
      throw new Error(
        `Unsupported serialization format: ${serializationFormat}`
      );
  }

  return value;
};

export type Engine = 'IDB' | 'MMKV' | 'SECURESTORE';

function secureStoreGetOptions(authenticationPrompt: string | undefined) {
  if (secureStoreOptions.requireAuthentication) {
    if (authenticationPrompt === undefined)
      throw new Error(
        'SecureStore requires an authenticationPrompt when using requireAuthentication'
      );
    return { ...secureStoreOptions, authenticationPrompt };
  } else return secureStoreOptions;
}

export const deleteAsync = async (
  key: string,
  engine: Engine,
  authenticationPrompt: string | undefined = undefined
): Promise<void> => {
  if (engine === 'IDB') {
    return await idbDel(key);
  } else if (engine === 'SECURESTORE') {
    return await secureStoreDeleteItemAsync(
      key,
      secureStoreGetOptions(authenticationPrompt)
    );
  } else if (engine === 'MMKV') {
    return new Promise(resolve => {
      resolve(mmkvStorage.delete.bind(mmkvStorage)(key));
    });
  } else throw new Error(`Unknown engine ${engine}`);
};
export const setAsync = async (
  key: string,
  value: string | number | boolean | object | Uint8Array,
  engine: Engine,
  cipherKey: Uint8Array | undefined = undefined,
  authenticationPrompt: string | undefined = undefined
): Promise<void> => {
  if (cipherKey) {
    if (value instanceof Uint8Array)
      throw new Error(
        `Uint8Array is not compatible with cipher (uses JSON.stringify)`
      );
    const chacha = getManagedChacha(cipherKey);
    value = bytesToUtf8(chacha.encrypt(utf8ToBytes(JSON.stringify(value))));
  }
  if (engine === 'IDB') {
    await idbSet(key, value);
  } else if (engine === 'SECURESTORE') {
    if (value instanceof Uint8Array)
      throw new Error(
        `Engine ${engine} does not support native Uint8Array - using JSON.stringify`
      );
    await secureStoreSetItemAsync(
      key,
      JSON.stringify(value),
      secureStoreGetOptions(authenticationPrompt)
    );
  } else if (engine === 'MMKV') {
    mmkvStorage.set.bind(mmkvStorage)(
      key,
      // Only stringify objects, and don't stringify Uint8Array since
      // mmkv nicely handle this. However, note that
      // typeof new Uint8Array() === 'object', so make sure only
      // objects which are not Uint8Array are stringified:
      typeof value === 'object' && !(value instanceof Uint8Array)
        ? JSON.stringify(value)
        : value
    );
  } else throw new Error(`Unknown engine ${engine}`);
};
export const getAsync = async <S extends SerializationFormat>(
  key: string,
  serializationFormat: S,
  engine: Engine,
  cipherKey: Uint8Array | undefined = undefined,
  authenticationPrompt: string | undefined = undefined
): Promise<SerializationFormatMapping[S]> => {
  let result;
  if (engine === 'IDB') {
    result = await idbGet(key);
  } else if (engine === 'SECURESTORE') {
    const stringValue = await secureStoreGetItemAsync(
      key,
      secureStoreGetOptions(authenticationPrompt)
    );
    result = stringValue !== null ? JSON.parse(stringValue) : undefined;
  } else if (engine === 'MMKV') {
    if (cipherKey) {
      result = mmkvStorage.getString(key);
    } else {
      switch (serializationFormat) {
        case NUMBER:
          result = mmkvStorage.getNumber(key);
          break;
        case STRING:
          result = mmkvStorage.getString(key);
          break;
        case SERIALIZABLE: {
          const stringValue = mmkvStorage.getString(key);
          result =
            stringValue !== undefined ? JSON.parse(stringValue) : undefined;
          break;
        }
        case BOOLEAN:
          result = mmkvStorage.getBoolean(key);
          break;
        case UINT8ARRAY:
          result = mmkvStorage.getBuffer(key);
          break;
        default:
          throw new Error(
            `Invalid serializationFormat: ${serializationFormat}`
          );
      }
    }
  } else throw new Error(`Unknown engine ${engine}`);
  if (cipherKey) {
    if (serializationFormat === UINT8ARRAY)
      throw new Error(
        `Uint8Array is not compatible with cipher (should have been encoded with JSON.stringify, which cannot manage Uint8Array)`
      );
    if (result === undefined) {
      return result;
    } else if (typeof result !== 'string') {
      throw new Error('Impossible to decode non-string encoded value');
    } else {
      const chacha = getManagedChacha(cipherKey);
      result = JSON.parse(bytesToUtf8(chacha.decrypt(utf8ToBytes(result))));
    }
  }
  return result;
};
