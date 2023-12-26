/**
 *
 * Intro:
 *
 * This module provides a `useGlobalStateStorage` hook along with a Context Provider.
 * This setup is designed for sharing storage state across multiple components. For instance,
 * if one component updates a setting, ALL components utilizing this hook will
 * automatically receive the updated value, and the shared storage will be updated
 * accordingly. This behavior is distinct from that of `useLocalStateStorage` (refer
 * to that hook for more details). For a comprehensive explanation, see the documentation
 * in str/hooks/useLocalStateStorage.ts.
 *
 * `useGlobalStateStorage` is ideal for global settings or states that need to be
 * consistently reflected across the entire application.
 *
 * Usage:
 *
 * To use the `useGlobalStateStorage` hook, call it with a specific key, type and
 * storage format.
 *
 * Example:
 * const [value, setValue, isSynchd] =
 *    useGlobalStateStorage<DataType>('uniqueKey', serializationFormat, defaultValue?);
 *
 * - 'DataType' is a TypeScript type or interface representing the structure
 *   of the data you're working with. For example Settings or Vaults, ...
 *  - The 'uniqueKey' argument ('settings' for example) uniquely identifies the
 *    data in the storage system. It is used to store and retrieve the value.
 * - 'serializationFormat' is a parameter that defines the serialization method
 *   for storing the data. It can be one of the following types:
 *   'NUMBER', 'STRING', 'SERIALIZABLE', 'BOOLEAN', 'UINT8ARRAY'.
 *    Use 'SERIALIZABLE' for data types like Array.isArray arrays and objects
 *    that can be serialized using JSON.stringify.
 *    Note that serializationFormat is only used in iOS and Android (which use
 *    mmkv storage engine), while not used on web since it uses IndexedDB, which
 *    natively serializes all values using "structured serialisation".
 *    https://html.spec.whatwg.org/multipage/structured-data.html#structuredserializeinternal
 *  - `defaultValue` is an optional argument that will be used as initialValue
 *    IF no value was retrieved from storage at the beginning.
 *
 * The 'value' returned by the hook represents the data associated with the given
 * key in the storage. Initially, this value might be 'undefined' while the
 * storage is being synchronized. Once 'isSynchd' is true, 'value' reflects the
 * data from the storage or remains 'undefined' if the key has never been set.
 *
 * 'setValue' is an asynchronous function to update the storage with a new value
 * for the specified key. You can await it to ensures that the value is stored before proceeding
 * with further operations. For instance, you might await 'setValue' in a backup
 * task to confirm successful storage before deleting a temporary value:
 * await setValue(newValue); // Ensuring the new value is stored
 * // Proceed with deleting temporary values, now that we know the backup completed successfuly
 *
 * 'isSynchd' is a boolean flag indicating whether the initial retrieval of the
 * data from storage has completed. It helps in differentiating between a 'value'
 * that is 'undefined' because it's yet to be fetched and a 'value' that is
 * 'undefined' because it has never been set in storage. To determine if a value
 * has never been set, use:
 * const hasNeverBeenSetInStorage = isSynchd && value === undefined;
 *
 * This hook simplifies managing persistent state in your React application by
 * synchronizing state with a storage system, handled by the StorageProvider.
 *
 */

import React, {
  useState,
  useEffect,
  createContext,
  useContext,
  ReactNode
} from 'react';
import {
  storage,
  SerializationFormat,
  assertSerializationFormat
} from '../lib/storage';

type StorageState<T> = Record<string, T>;
type ProviderValue<T> = {
  valueMap: StorageState<T>;
  setValueMap: React.Dispatch<React.SetStateAction<StorageState<T>>>;
};
const StorageContext = createContext<ProviderValue<unknown> | null>(null);

const StorageProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [valueMap, setValueMap] = useState<StorageState<unknown>>({});

  return (
    <StorageContext.Provider value={{ valueMap, setValueMap }}>
      {children}
    </StorageContext.Provider>
  );
};

const useGlobalStateStorage = <T,>(
  key: string,
  serializationFormat: SerializationFormat,
  /** defaultValue is used to set an initial value if the storage does not
   * contain already a value. DO NOT confuse this parameter with an initial
   * value.
   */
  defaultValue?: T
): [T | undefined, (newValue: T) => Promise<void>, boolean] => {
  const context = useContext(StorageContext);
  if (context === null)
    throw new Error(`useStorage must be used within a StorageProvider`);

  const { valueMap, setValueMap } = context;

  //We only need to retrieve the value from the storage intially for each key
  //We know key has not been retrieved yet if valueMap[key] is not set.
  //Note that valueMap[key] may be set to undefined which means it was retrieved
  //already but nothing was found in storage and no defaultValue was used
  //After having retrieved the initial value, then we will rely on
  //valueMap[key] to not spam the storage with more requests that we
  //already know the result
  useEffect(() => {
    const fetchValue = async () => {
      const savedValue = await storage.getAsync(key, serializationFormat);
      if (savedValue)
        setValueMap(prevState =>
          prevState[key] !== savedValue
            ? { ...prevState, [key]: savedValue }
            : prevState
        );
      else if (defaultValue !== undefined) await setStorageValue(defaultValue);
      else
        setValueMap(prevState =>
          prevState[key] !== undefined
            ? { ...prevState, [key]: undefined }
            : prevState
        );
    };
    if (!(key in valueMap)) fetchValue();
  }, [key]);

  /** sets storage and sate value */
  const setStorageValue = async (newValue: T) => {
    await storage.setAsync(
      key,
      assertSerializationFormat(newValue, serializationFormat)
    );
    setValueMap(prevState =>
      prevState[key] !== newValue
        ? { ...prevState, [key]: newValue }
        : prevState
    );
  };

  return [valueMap[key] as T | undefined, setStorageValue, key in valueMap];
};

export { StorageProvider, useGlobalStateStorage };
