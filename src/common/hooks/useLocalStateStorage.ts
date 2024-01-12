import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import {
  getAsync,
  setAsync,
  Engine,
  SerializationFormat,
  assertSerializationFormat
} from '../lib/storage';

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
 *    useLocalStateStorage<DataType>('uniqueKey', serializationFormat, defaultValue);
 * - 'DataType' is a TypeScript type or interface representing your data structure.
 * - 'uniqueKey' is a unique identifier for your data in storage.
 * - 'serializationFormat' is a parameter that defines the serialization method
 *   for storing the data. It can be one of the following types:
 *   'NUMBER', 'STRING', 'SERIALIZABLE', 'BOOLEAN', 'UINT8ARRAY'.
 *    Use 'SERIALIZABLE' for data types like Array.isArray arrays and objects
 *    that can be serialized using JSON.stringify.
 *    Note that serializationFormat is only used in iOS and Android (which use
 *    mmkv storage engine), while not used on web since it uses IndexedDB, which
 *    natively serializes all values using "structured serialisation".
 *    https://html.spec.whatwg.org/multipage/structured-data.html#structuredserializeinternal
 * - `defaultValue` is an optional argument that will be used as initialValue
 *    IF no value was retrieved from storage at the beginning.
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
 * these hooks can be found in the documentation in src/hooks/useLocalStateStorage.ts
 */

export const useLocalStateStorage = <T>(
  /**
   * Keys must and contain only alphanumeric characters, ".", "-", and "_"
   */
  key: string,
  serializationFormat: SerializationFormat,
  /** defaultValue is used to set an initial value if the storage does not
   * contain already a value. DO NOT confuse this parameter with an initial
   * value.
   */
  defaultValue?: T,
  engine: Engine = Platform.OS === 'web' ? 'IDB' : 'MMKV',
  cipherKey: Uint8Array | undefined = undefined,
  authenticationPrompt: string | undefined = undefined
): [T | undefined, (newValue: T) => Promise<void>, boolean] => {
  const [value, setValue] = useState<T | undefined>();
  const [isSynchd, setIsSynchd] = useState(false);

  //We only need to retrieve the value from the storage intially for each key
  //After having retrieved the initial value, then we will rely on
  //value set by setValue to not spam the storage with more requests that we
  //already know the result
  useEffect(() => {
    const fetchValue = async () => {
      const savedValue = await getAsync(
        key,
        serializationFormat,
        engine,
        cipherKey,
        authenticationPrompt
      );
      if (savedValue) setValue(savedValue as T);
      else if (defaultValue !== undefined) await setStorageValue(defaultValue);
      else setValue(undefined);

      setIsSynchd(true);
    };
    fetchValue();
  }, [key]);

  /** sets storage and sate value */
  const setStorageValue = async (newValue: T) => {
    await setAsync(
      key,
      assertSerializationFormat(newValue, serializationFormat),
      engine,
      cipherKey,
      authenticationPrompt
    );
    setValue(newValue);
  };

  return [value, setStorageValue, isSynchd];
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
