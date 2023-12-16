import { MMKV } from 'react-native-mmkv';
const mmkvStorage = new MMKV();

import { Platform } from 'react-native';

import {
  get as webGet,
  set as webSet,
  del as webDel,
  clear as webClearAll
} from 'idb-keyval';

export const NUMBER = 'NUMBER';
export const STRING = 'STRING';
export const SERIALIZABLE = 'SERIALIZABLE';
export const BOOLEAN = 'BOOLEAN';
export const UINT8ARRAY = 'UINT8ARRAY';

type SerializationFormatMapping = {
  [NUMBER]: number | null | undefined;
  [STRING]: string | null | undefined;
  [SERIALIZABLE]: object | null | undefined; // serializable with JSON.stringify
  [BOOLEAN]: boolean | null | undefined;
  [UINT8ARRAY]: Uint8Array | null | undefined;
};

export const assertValue = (newValue: unknown) => {
  if (
    newValue === null ||
    newValue === undefined ||
    (typeof newValue !== 'string' &&
      typeof newValue !== 'number' &&
      typeof newValue !== 'boolean' &&
      !(newValue instanceof Uint8Array) &&
      // Assuming 'object' is JSON.stringify on mmkv and is serializeble through
      // "structured serialisation" in IndexedDB
      // A better assertion could be here... but we leave it to the user
      // not to make this assertion part very slow
      typeof newValue !== 'object')
  ) {
    throw new Error(`Unsupported type`);
  }
  return newValue;
};

export type SerializationFormat = keyof SerializationFormatMapping;
export const storage = {
  deleteAsync:
    Platform.OS === 'web'
      ? webDel
      : (key: string): Promise<void> =>
          new Promise(resolve => {
            resolve(mmkvStorage.delete.bind(mmkvStorage)(key));
          }),
  setAsync:
    Platform.OS === 'web'
      ? webSet
      : (
          key: string,
          value: string | number | boolean | object | Uint8Array
        ): Promise<void> =>
          new Promise(resolve => {
            resolve(
              mmkvStorage.set.bind(mmkvStorage)(
                key,
                typeof value === 'object' ? JSON.stringify(value) : value
              )
            );
          }),
  getAsync:
    Platform.OS === 'web'
      ? <S extends SerializationFormat>(
          key: string,
          _serializationFormat: S
        ): Promise<SerializationFormatMapping[S]> => webGet(key)
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
    ? webClearAll
    : (): Promise<void> =>
        new Promise(resolve => {
          resolve(mmkvStorage.clearAll.bind(mmkvStorage)());
        });

import { useEffect, useState } from 'react';

/**
 * Usage of `useLocalStateStorage`:
 *
 * This hook is designed for managing local storage state within a specific component,
 * independent of other components. It differs from `useGlobalStateStorage`
 * in that it does not share state across the application. Each invocation
 * of `useLocalStateStorage` maintains its own state, making it ideal for
 * component-specific data that does not need global synchronization.
 * See long explanation at the end of this file.
 *
 * Example:
 * const [value, setValue, isSynchd] =
 *    useLocalStateStorage<DataType>('uniqueKey', serializationFormat);
 * - 'DataType' is a TypeScript type or interface representing your data structure.
 * - 'uniqueKey' is a unique identifier for your data in storage.
 * - 'serializationFormat' is a parameter that defines the serialization method
 *   for storing the data. It can be one of the following types:
 *   'NUMBER', 'STRING', 'SERIALIZABLE', 'BOOLEAN', 'UINT8ARRAY'.
 *    Use 'SERIALIZABLE' for data types like Array.isArray arrays and objects
 *    that can be serialized using JSON.stringify. This format is versatile and
 *    can handle various data types, but for efficiency, consider using the
 *    specific types ('NUMBER', 'STRING', etc.) when applicable.
 *    These specific types allow for more optimized storage compared
 *    to the general 'SERIALIZABLE' type, which is suitable for complex data
 *    structures but may be less efficient for simple data types.
 *    Note that serializationFormat is only used in iOS and Android (which use
 *    mmkv storage engine), while not used on web since it uses IndexedDB, which
 *    natively serializes all values using "structured serialisation".
 *    https://html.spec.whatwg.org/multipage/structured-data.html#structuredserializeinternal
 *
 * 'value': Represents the current state associated with 'uniqueKey'. It starts
 * as 'undefined' and is updated after fetching from storage. Changes to 'value'
 * in one component do not affect others using the same key.
 *
 * 'setValue': An async function to update the value in storage and in the
 * local state of the component. Use it when you need to store new data and
 * ensure it's saved before proceeding with other actions.
 *
 * 'isSynchd': A boolean indicating if the data has been fetched from storage.
 * Useful for determining if 'value' is 'undefined' because it's yet to be
 * fetched or because it was never set in storage.
 *
 * Note: Unlike `useGlobalStateStorage`, `useLocalStateStorage` does not cause
 * re-renders in other components using the same key. It's useful for data
 * like form inputs or component-specific settings. For shared global state,
 * refer to `useGlobalStateStorage`. More information on the differences between
 * these hooks can be found in the documentation in str/lib/storage.
 */

export const useLocalStateStorage = <T>(
  key: string,
  serializationFormat: SerializationFormat
): [T | undefined, (newValue: T) => Promise<void>, boolean] => {
  const [value, setValue] = useState<T | undefined>();
  const [isSynchd, setIsSynchd] = useState(false);

  //We only need to retrieve the value from the storage intially for each key
  //After having retrieved the initial value, then we will rely on
  //value set by setValue to not spam the storage with more requests that we
  //already know the result
  useEffect(() => {
    const fetchValue = async () => {
      const savedValue = await storage.getAsync(key, serializationFormat);
      setValue(savedValue as T | undefined);
      setIsSynchd(true);
    };
    fetchValue();
  }, [key]);

  const setNewValue = async (newValue: T) => {
    await storage.setAsync(key, assertValue(newValue));
    setValue(newValue);
  };

  return [value, setNewValue, isSynchd];
};

/**
 * Differences and Recommendations for useGlobalStateStorage vs useLocalStateStorage:
 *
 * Similarities:
 * - Both synchronize state with persistent storage.
 * - Same interface: [value, setValue, isSynchd].
 * - Handle fetching and updating data in storage.
 * - Asynchronous setValue function.
 *
 * Differences:
 * - State Scope:
 *   - useGlobalStateStorage: Manages global state across components.
 *   - useLocalStateStorage: Manages state specific to each component.
 * - Re-rendering Behavior:
 *   - useGlobalStateStorage: Can cause more re-renders across components.
 *   - useLocalStateStorage: Restricts re-renders to the owning component.
 * - Use Cases:
 *   - useGlobalStateStorage: Ideal for global data like settings.
 *   - useLocalStateStorage: Suitable for component-specific data.
 *
 * Choosing Between Hooks:
 * - Use useGlobalStateStorage for:
 *   - Shared state like app settings. Example: If one module updates a setting,
 *     it immediately propagates to all modules using useGlobalStateStorage.
 *   - Global data that changes infrequently to minimize re-renders.
 * - Use useLocalStateStorage for:
 *   - State specific to a component or domain that doesn't affect others.
 *   - Example: Vault speciffic information. This avoids unnecessary re-renders
 *     in other parts of the app.
 *   - Note: Other components using useLocalStateStorage with the same key
 *     won't be notified of changes. This is important to take into account.
 *
 * Consequences:
 * - useGlobalStateStorage with frequently changing data can cause performance issues.
 * - useLocalStateStorage for global data might lead to inconsistencies.
 *
 * Summary:
 * Choose based on data scope, re-rendering impact, and whether components need to
 * be aware of each other's state changes. This enhances app performance and consistency.
 */
