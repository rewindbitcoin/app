//TODO: Test this encryption lib by Paul Millr and see how fast is it:
//https://github.com/paulmillr/noble-ciphers?tab=readme-ov-file#speed
//  -> Use this cypher:
//    XChaCha20-Poly1305

//TODO: Test this json.stringify function which is faster for typescript:
//https://dev.to/samchon/i-made-10x-faster-jsonstringify-functions-even-type-safe-2eme
import { MMKV } from 'react-native-mmkv';
const mmkvStorage = new MMKV();

import { Platform } from 'react-native';

import {
  get as idbGet,
  set as idbSet,
  del as idbDel,
  clear as idbClearAll
} from 'idb-keyval';

import { xchacha20poly1305 } from '@noble/ciphers/chacha';
//import { managedNonce } from '@noble/ciphers/webcrypto'; <- Future versions will switch to this
import { managedNonce } from '@noble/ciphers/webcrypto/utils';
import { hexToBytes, utf8ToBytes } from '@noble/ciphers/utils';
//const key = hexToBytes(
//  'fa686bfdffd3758f6377abbc23bf3d9bdc1a0dda4a6e7f8dbdd579fa1ff6d7e1'
//);
//const chacha = managedNonce(xchacha20poly1305)(key); // manages nonces for you
//const data = utf8ToBytes('hello, noble');
//const ciphertext = chacha.encrypt(data);
//const data_ = chacha.decrypt(ciphertext);

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

export type Engine = 'AUTO' | 'IDB' | 'MMKV' | 'SECURESTORE';

const getActualEngine = (engine: Engine) => {
  if (Platform.OS === 'web' && engine === 'SECURESTORE')
    throw new Error('Web does not support SECURESTORE');
  if (engine === 'AUTO') {
    if (Platform.OS === 'web') {
      return 'IDB';
    } else {
      return 'MMKV';
    }
  }
  return engine;
};

export const storage2 = {
  deleteAsync: (key: string, engine: Engine = 'AUTO'): Promise<void> => {
    if (getActualEngine(engine) === 'IDB') {
      return idbDel(key);
    } else {
      return new Promise(resolve => {
        resolve(mmkvStorage.delete.bind(mmkvStorage)(key));
      });
    }
  },
  setAsync: (
    key: string,
    value: string | number | boolean | object | Uint8Array,
    engine: Engine = 'AUTO',
    cipherKey: Uint8Array | undefined = undefined
  ): Promise<void> => {
    if (getActualEngine(engine) === 'IDB') {
      return idbSet(key, value);
    } else {
      return new Promise(resolve => {
        resolve(
          mmkvStorage.set.bind(mmkvStorage)(
            key,
            // Only stringify objects, and don't stringify Uint8Array since
            // mmkv nicely handle this. However, note that
            // typeof new Uint8Array() === 'object', so make sure only
            // objects which are not Uint8Array are stringified:
            typeof value === 'object' && !(value instanceof Uint8Array)
              ? JSON.stringify(value)
              : value
          )
        );
      });
    }
  },
  getAsync: <S extends SerializationFormat>(
    key: string,
    serializationFormat: S,
    engine: Engine = 'AUTO',
    cipherKey: Uint8Array | undefined = undefined
  ): Promise<SerializationFormatMapping[S]> => {
    if (getActualEngine(engine) === 'IDB') {
      return idbGet(key);
    } else {
      return new Promise(resolve => {
        let result: string | number | boolean | object | Uint8Array | undefined;

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
        resolve(result as SerializationFormatMapping[S]);
      });
    }
  }
};

export const storage = {
  deleteAsync:
    Platform.OS === 'web'
      ? idbDel
      : (key: string): Promise<void> =>
          new Promise(resolve => {
            resolve(mmkvStorage.delete.bind(mmkvStorage)(key));
          }),
  setAsync:
    Platform.OS === 'web'
      ? idbSet
      : (
          key: string,
          value: string | number | boolean | object | Uint8Array
        ): Promise<void> =>
          new Promise(resolve => {
            resolve(
              mmkvStorage.set.bind(mmkvStorage)(
                key,
                // Only stringify objects, and don't stringify Uint8Array since
                // mmkv nicely handle this. However, note that
                // typeof new Uint8Array() === 'object', so make sure only
                // objects which are not Uint8Array are stringified:
                typeof value === 'object' && !(value instanceof Uint8Array)
                  ? JSON.stringify(value)
                  : value
              )
            );
          }),
  getAsync:
    Platform.OS === 'web'
      ? <S extends SerializationFormat>(
          key: string,
          _serializationFormat: S
        ): Promise<SerializationFormatMapping[S]> => idbGet(key)
      : <S extends SerializationFormat>(
          key: string,
          serializationFormat: S
        ): Promise<SerializationFormatMapping[S]> =>
          new Promise(resolve => {
            let result:
              | string
              | number
              | boolean
              | object
              | Uint8Array
              | undefined;

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
                  stringValue !== undefined
                    ? JSON.parse(stringValue)
                    : undefined;
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
            resolve(result as SerializationFormatMapping[S]);
          })
};
export const clearAllAsync =
  Platform.OS === 'web'
    ? idbClearAll
    : (): Promise<void> =>
        new Promise(resolve => {
          resolve(mmkvStorage.clearAll.bind(mmkvStorage)());
        });
