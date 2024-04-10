//TODO: Test this json.stringify function which is faster for typescript:
//  -> In addition, it supports Uint8Array
//    https://dev.to/samchon/i-made-10x-faster-jsonstringify-functions-even-type-safe-2eme
//  -> In fact it even supports directy encoding objects into binary objects
//    https://typia.io/docs/protobuf/encode/

/**
 * IMPORTANT, when using SECURESTORE, if requireAuthentication = true, the data
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
 *
 * getAsync returns undefined if the key is not found
 * setAsync cannot be used to set "undefined" or "null" values.
 */

import { MMKV } from 'react-native-mmkv';
const mmkvStorage = new MMKV();

import { Platform } from 'react-native';

import { get as idbGet, set as idbSet, del as idbDel } from 'idb-keyval';

//Note this package has been patch-packaged:
//After patch-pachate you need to npx expo prebuild
//https://github.com/expo/expo/issues/17804
import { hasHardwareAsync, isEnrolledAsync } from 'expo-local-authentication';

//import { to_string } from 'react-native-libsodium';
import { strToU8, strFromU8 } from 'fflate';
import { getManagedChacha } from './cipher';

import {
  AFTER_FIRST_UNLOCK,
  getItemAsync as secureStoreOriginalGetItemAsync,
  setItemAsync as secureStoreOriginalSetItemAsync,
  deleteItemAsync as secureStoreDeleteItemAsync,
  SecureStoreOptions,
  deleteItemAsync,
  isAvailableAsync
} from 'expo-secure-store';

export const canUseSecureStorageAsync = async () => {
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
  if (!(await canUseSecureStorageAsync()))
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
  if (!(await canUseSecureStorageAsync()))
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

export const NUMBER = 'NUMBER';
export const STRING = 'STRING';
export const SERIALIZABLE = 'SERIALIZABLE';
export const BOOLEAN = 'BOOLEAN';
export const UINT8ARRAY = 'UINT8ARRAY';

type SerializationFormatMapping = {
  [NUMBER]: number | undefined;
  [STRING]: string | undefined;
  // serializable with JSON.stringify in mmkv & with "structured serialisation"
  // in IndexedDB for web:
  [SERIALIZABLE]: object | undefined;
  [BOOLEAN]: boolean | undefined;
  [UINT8ARRAY]: Uint8Array | undefined;
};
export type SerializationFormat = keyof SerializationFormatMapping;

export const assertSerializationFormat = (
  value: unknown,
  serializationFormat: SerializationFormat
) => {
  if (value === null || value === undefined) {
    //SecureStorage rerturns null when the key does not exist. Other storages
    //return undefined. So we don't allow any of those 2 values.
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

export type StorageStatus = { isSynchd: boolean; decryptError: boolean };

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
  engine: Engine = Platform.OS === 'web' ? 'IDB' : 'MMKV',
  authenticationPrompt: string | undefined = undefined
): Promise<void> => {
  if (engine === 'IDB') {
    return await idbDel(key);
  } else if (engine === 'SECURESTORE') {
    if (authenticationPrompt === undefined)
      throw new Error('SECURESTORE requires an authenticationPrompt');
    return await secureStoreDeleteItemAsync(
      key,
      secureStoreGetOptions(authenticationPrompt)
    );
  } else if (engine === 'MMKV') {
    return new Promise(resolve => {
      resolve(mmkvStorage.delete(key));
    });
  } else throw new Error(`Unknown engine ${engine}`);
};
export const setAsync = async (
  key: string,
  value: string | number | boolean | object | Uint8Array,
  engine: Engine = Platform.OS === 'web' ? 'IDB' : 'MMKV',
  cipherKey: Uint8Array | undefined = undefined,
  authenticationPrompt: string | undefined = undefined
): Promise<void> => {
  let cipherMessage: Uint8Array | undefined = undefined;
  if (cipherKey) {
    if (value instanceof Uint8Array)
      throw new Error(
        `Uint8Array is not compatible with cipher (uses JSON.stringify)`
      );
    const chacha = getManagedChacha(cipherKey);
    const originalMessage = value;
    console.log(`About to encrypt ${key} in ${engine}`);
    const start = performance.now(); // Start timing
    const strOriginalMessage = JSON.stringify(originalMessage);
    const uint8OriginalMessage = strToU8(strOriginalMessage);
    cipherMessage = chacha.encrypt(uint8OriginalMessage);
    const end = performance.now(); // End timing
    console.log(
      `Data preparation success: encrypted buffer length: ${cipherMessage.length} chars / ${(end - start) / 1000} seconds`
    );
  }
  if (engine === 'IDB') {
    await idbSet(key, cipherMessage || value);
  } else if (engine === 'SECURESTORE') {
    if (!cipherMessage && value instanceof Uint8Array)
      throw new Error(
        `Engine ${engine} does not support native Uint8Array since it uses JSON.stringify`
      );
    const secureStoreValue =
      (cipherMessage && strFromU8(cipherMessage, true)) ||
      JSON.stringify(value);
    if (secureStoreValue.length > 2048)
      throw new Error(
        `Reached Secure Store Limit: ${secureStoreValue.length} > 2048.`
      );
    if (authenticationPrompt === undefined)
      throw new Error('SECURESTORE requires an authenticationPrompt');
    await secureStoreSetItemAsync(
      key,
      secureStoreValue,
      secureStoreGetOptions(authenticationPrompt)
    );
  } else if (engine === 'MMKV') {
    // Only stringify objects, and don't stringify Uint8Array since
    // mmkv nicely handle this. However, note that
    // typeof new Uint8Array() === 'object', so make sure only
    // objects which are not Uint8Array are stringified:
    const mmkvValue =
      cipherMessage ||
      (typeof value === 'object' && !(value instanceof Uint8Array)
        ? JSON.stringify(value)
        : value);
    mmkvStorage.set(key, mmkvValue);
  } else throw new Error(`Unknown engine ${engine}`);
};
export const getAsync = async <S extends SerializationFormat>(
  key: string,
  serializationFormat: S,
  engine: Engine = Platform.OS === 'web' ? 'IDB' : 'MMKV',
  cipherKey: Uint8Array | undefined = undefined,
  authenticationPrompt: string | undefined = undefined
): Promise<SerializationFormatMapping[S]> => {
  let result;
  if (engine === 'IDB') {
    result = await idbGet(key);
  } else if (engine === 'SECURESTORE') {
    if (authenticationPrompt === undefined)
      throw new Error('SECURESTORE requires an authenticationPrompt');
    const stringValue = await secureStoreGetItemAsync(
      key,
      secureStoreGetOptions(authenticationPrompt)
    );
    result =
      stringValue === null
        ? undefined
        : cipherKey
          ? strToU8(stringValue, true)
          : JSON.parse(stringValue);
  } else if (engine === 'MMKV') {
    if (cipherKey) {
      result = mmkvStorage.getBuffer(key);
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
    } else if (!(result instanceof Uint8Array)) {
      console.error(result);
      throw new Error(
        `Impossible to decode non-binary encoded value: ${typeof result}`
      );
    } else {
      const chacha = getManagedChacha(cipherKey);
      console.log(
        `About to decrypt ${key} / encrypted buffer length ${result.length} bytes / ${engine}`
      );
      const start = performance.now(); // Start timing
      const decryptedResult = chacha.decrypt(result);
      const decryptTime = performance.now();
      console.log(`decrypt time: ${(decryptTime - start) / 1000} seconds`);
      const strResult = strFromU8(decryptedResult);
      const strTime = performance.now();
      console.log(`U8 -> str time: ${(strTime - decryptTime) / 1000} seconds`);
      result = JSON.parse(strResult);
      const end = performance.now(); // End timing
      console.log(`JSON.parse time: ${(end - strTime) / 1000} seconds`);
      console.log(`Success: ${(end - start) / 1000} seconds`);
    }
  }
  return result;
};
