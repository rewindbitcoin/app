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
 * device is locked. It can also survive FaceId or TouchId changes:
 * Read more:
 * https://github.com/expo/expo/issues/22312
 *
 * getAsync returns undefined if the key is not found
 * setAsync cannot be used to set "undefined" or "null" values.
 *
 * Some other related error: https://github.com/expo/expo/issues/23426
 */

const SECURESTORE_ATTEMPTS = 2;

const MATCH_USER_CANCEL = 'User cancel';
export type StorageErrorCode = keyof typeof StorageErrors | false;
export const StorageErrors = {
  /** Thrown when reading from securestore using biometrics
   * (and it's not the user cancelling it)*/
  BiometricsReadError: 'Biometrics Read Error: Key could not be read.',
  /** Thrown when writing to securestore using biometrics
   * (and it's not the user cancelling it)*/
  BiometricsWriteError: 'Biometrics Write Error: Key could not be written.',
  /** Thrown when user cancels reading from securestore using biometrics*/
  BiometricsReadUserCancel: 'Biometrics Read Error: User Cancelled.',
  /** Thrown when user cancels writing to securestore using biometrics*/
  BiometricsWriteUserCancel: 'Biometrics Write Error: User Cancelled.',
  /** Thrown when reading from non-securestore*/
  ReadError: 'Read Error: Key could not be read.',
  /** Thrown when writing to non-securestore*/
  WriteError: 'Write Error: Key could not be written.',
  /** Thrown when deleting a key in any store*/
  DeleteError: 'Delete Error: Key could not be deleted.',
  DecryptError: 'Decrypt Failed.',
  EncryptError: 'Encrypt Failed.',
  UnknownError: 'Unknown Error.'
};
export function getStorageErrorCode(error: unknown): StorageErrorCode {
  if (error instanceof Error && typeof error.message === 'string') {
    for (const [key, value] of Object.entries(StorageErrors))
      if (value === error.message) return key as StorageErrorCode;
  }
  return 'UnknownError';
}

export type StorageStatus = {
  isSynchd: boolean;
  errorCode: StorageErrorCode;
};

import { MMKV } from 'react-native-mmkv';
const mmkvStorage = new MMKV();

const mmkvSet = (
  key: string,
  value: string | number | boolean | Uint8Array
) => {
  try {
    mmkvStorage.set(key, value);
  } catch (err) {
    console.warn(err);
    throw new Error(StorageErrors.ReadError);
  }
};
const mmkvDel = (key: string) => {
  try {
    mmkvStorage.delete(key);
  } catch (err) {
    console.warn(err);
    throw new Error(StorageErrors.DeleteError);
  }
};
const mmkvGetNumber = (key: string) => {
  try {
    return mmkvStorage.getNumber(key);
  } catch (err) {
    console.warn(err);
  }
  throw new Error(StorageErrors.ReadError);
};
const mmkvGetString = (key: string) => {
  try {
    return mmkvStorage.getString(key);
  } catch (err) {
    console.warn(err);
  }
  throw new Error(StorageErrors.ReadError);
};
const mmkvGetBoolean = (key: string) => {
  try {
    return mmkvStorage.getBoolean(key);
  } catch (err) {
    console.warn(err);
  }
  throw new Error(StorageErrors.ReadError);
};
const mmkvGetBuffer = (key: string) => {
  try {
    return mmkvStorage.getBuffer(key);
  } catch (err) {
    console.warn(err);
  }
  throw new Error(StorageErrors.ReadError);
};

import {
  get as idbOriginalGet,
  set as idbOriginalSet,
  del as idbOriginalDel
} from 'idb-keyval';
const idbGet = async (key: string) => {
  try {
    return idbOriginalGet(key);
  } catch (err) {
    console.warn(err);
  }
  throw new Error(StorageErrors.ReadError);
};
const idbSet = async (
  key: string,
  value: string | number | boolean | object | Uint8Array
) => {
  try {
    return idbOriginalSet(key, value);
  } catch (err) {
    console.warn(err);
    throw new Error(StorageErrors.WriteError);
  }
};
const idbDel = async (key: string) => {
  try {
    return idbOriginalDel(key);
  } catch (err) {
    console.warn(err);
    throw new Error(StorageErrors.DeleteError);
  }
};

import { Platform } from 'react-native';

//Note this package has been patch-packaged:
//After patch-pachate you need to npx expo prebuild
//https://github.com/expo/expo/issues/17804
//Eventually the new API of loca.authentication will support BIOMETRIC_STRONG
//It has been pull requested as of apr 11 2024, but not published in a stable
//release yet:
//https://github.com/expo/expo/blob/main/packages/expo-local-authentication/CHANGELOG.md
//NOTE2: New versions of expo-secure-store will provide
//canUseBiometricAuthentication so I believe expo--local-authentication will no
//longer needed (or at least the patch)
import {
  hasHardwareAsync,
  isEnrolledAsync,
  supportedAuthenticationTypesAsync
} from 'expo-local-authentication';

//import { strToU8, strFromU8 } from 'fflate';
import { getManagedChacha } from './cipher';
import { TextEncoder, TextDecoder } from './textencoder';

import {
  AFTER_FIRST_UNLOCK,
  getItemAsync as secureStoreOriginalGetItemAsync,
  setItemAsync as secureStoreOriginalSetItemAsync,
  deleteItemAsync as secureStoreOriginalDeleteItemAsync,
  type SecureStoreOptions,
  isAvailableAsync
  //canUseBiometricAuthentication
} from 'expo-secure-store';

export const getSecureStorageInfoAsync = async () => {
  const canUseSecureStorage =
    Platform.OS !== 'web' &&
    //canUseBiometricAuthentication() &&
    (await isAvailableAsync()) &&
    (await hasHardwareAsync()) &&
    (await isEnrolledAsync());
  const authenticationTypes = await supportedAuthenticationTypesAsync();
  return { canUseSecureStorage, authenticationTypes };
};

const canUseSecureStorageAsync = async () =>
  (await getSecureStorageInfoAsync()).canUseSecureStorage;

/** these are the messages thrown by 3rd party libs that we'll match and re-throw
 * using the Error messsages above
 */
function errorMatches(err: unknown, msg: string) {
  if (
    err instanceof Error &&
    typeof err.message === 'string' &&
    err.message.includes(msg)
  )
    return true;
  else return false;
}

const secureStoreOptions: SecureStoreOptions = {
  requireAuthentication: true,
  keychainAccessible: AFTER_FIRST_UNLOCK //This only applies to iOS
};

//github.com/expo/expo/issues/23426
const secureStoreGetItemAsync = async (
  key: string,
  options: SecureStoreOptions
) => {
  if (!(await canUseSecureStorageAsync()))
    throw new Error('Device does not support secure storage');
  for (let attempts = 0; attempts < SECURESTORE_ATTEMPTS; attempts++) {
    try {
      if (attempts > 0) {
        console.warn(
          `Secure Store failed reading ${key}. #Attempts: so far: ${attempts}. Attempting again.`
        );
        await new Promise(resolve => setTimeout(resolve, 1000)); //sleep 1 second
      }
      return await secureStoreOriginalGetItemAsync(key, options);
    } catch (error) {
      console.warn(error);
      if (errorMatches(error, MATCH_USER_CANCEL))
        throw new Error(StorageErrors.BiometricsReadUserCancel);
    }
  }
  throw new Error(StorageErrors.BiometricsReadError);
};
const secureStoreSetItemAsync = async (
  key: string,
  value: string,
  options: SecureStoreOptions
) => {
  // assert this programming error (this should never happen)
  if (!(await canUseSecureStorageAsync()))
    throw new Error('Device does not support secure storage');
  for (let attempts = 0; attempts < SECURESTORE_ATTEMPTS; attempts++) {
    try {
      if (attempts > 0) {
        console.warn(
          `Secure Store failed setting ${key}. #Attempts so far: ${attempts}. Deleting key and attempting again.`
        );
        await new Promise(resolve => setTimeout(resolve, 1000)); //sleep 1 second
        await secureStoreDeleteItemAsync(key, options);
      }
      return await secureStoreOriginalSetItemAsync(key, value, options);
    } catch (error) {
      console.warn(error);
      if (errorMatches(error, MATCH_USER_CANCEL))
        throw new Error(StorageErrors.BiometricsWriteUserCancel);
    }
  }
  throw new Error(StorageErrors.BiometricsWriteError);
};
const secureStoreDeleteItemAsync = async (
  key: string,
  options: SecureStoreOptions
) => {
  try {
    return secureStoreOriginalDeleteItemAsync(key, options);
  } catch (err) {
    console.warn(err);
  }
  throw new Error(StorageErrors.DeleteError);
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
    return mmkvDel(key);
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
    const strOriginalMessage = JSON.stringify(originalMessage);
    //const uint8OriginalMessage = strToU8(strOriginalMessage);
    const uint8OriginalMessage = new TextEncoder().encode(strOriginalMessage);
    try {
      cipherMessage = chacha.encrypt(uint8OriginalMessage);
    } catch (err: unknown) {
      console.warn(err);
      throw new Error(StorageErrors.EncryptError);
    }
  }
  if (engine === 'IDB') {
    await idbSet(key, cipherMessage || value);
  } else if (engine === 'SECURESTORE') {
    if (!cipherMessage && value instanceof Uint8Array)
      throw new Error(
        `Engine ${engine} does not support native Uint8Array since it uses JSON.stringify`
      );
    const secureStoreValue =
      //(cipherMessage && strFromU8(cipherMessage, true)) ||
      (cipherMessage &&
        new TextDecoder().decode(cipherMessage, { stream: false })) ||
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
    mmkvSet(key, mmkvValue);
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
          ? //? strToU8(stringValue, true)
            new TextEncoder().encode(stringValue)
          : JSON.parse(stringValue);
  } else if (engine === 'MMKV') {
    if (cipherKey) {
      result = mmkvGetBuffer(key);
    } else {
      switch (serializationFormat) {
        case NUMBER:
          result = mmkvGetNumber(key);
          break;
        case STRING:
          result = mmkvGetString(key);
          break;
        case SERIALIZABLE: {
          const stringValue = mmkvGetString(key);
          result =
            stringValue !== undefined ? JSON.parse(stringValue) : undefined;
          break;
        }
        case BOOLEAN:
          result = mmkvGetBoolean(key);
          break;
        case UINT8ARRAY:
          result = mmkvGetBuffer(key);
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
      let decryptedResult: Uint8Array;
      try {
        decryptedResult = chacha.decrypt(result);
      } catch (err: unknown) {
        console.warn(err);
        throw new Error(StorageErrors.DecryptError);
      }
      //const strResult = strFromU8(decryptedResult);
      const strResult = new TextDecoder().decode(decryptedResult, {
        stream: false
      });
      result = JSON.parse(strResult);
    }
  }
  return result;
};
