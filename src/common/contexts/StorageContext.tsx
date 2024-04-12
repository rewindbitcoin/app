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
 * const [value, setValue, deleteValue, clearCache, storageStatus: {errorCode, isSynchd}] =
 *    useGlobalStateStorage<DataType>('uniqueKey', serializationFormat, defaultValue?);
 *
 * - 'DataType' is a TypeScript type or interface representing the structure
 *   of the data you're working with. For example Settings or Vaults, ...
 *  - The 'uniqueKey' argument ('settings' for example) uniquely identifies the
 *    data in the storage system. It is used to store and retrieve the value.
 *    If undefined is passed, then this hook behaves as a noop.
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
 * storage is being synchronized. Once 'storageStatus.isSynchd' is true, 'value' reflects the
 * data from the storage or remains 'undefined' if the key has never been set.
 *
 * 'setValue' is an asynchronous function to update the storage with a new value
 * for the specified key. You can await it to ensures that the value is stored before proceeding
 * with further operations. For instance, you might await 'setValue' in a backup
 * task to confirm successful storage before deleting a temporary value:
 * await setValue(newValue); // Ensuring the new value is stored
 * Similarly to useState, setValue assumes immutability. If you set an object that
 * has been mutated it won't be set. You need to pass a new object.
 *
 * deleteValue deletes the value from storage
 * clearCache forces the next call to read from storage (will not use memory)
 *
 * 'storageStatus.isSynchd' is a boolean flag indicating whether the initial retrieval of the
 * data from storage has completed. It helps in differentiating between a 'value'
 * that is 'undefined' because it's yet to be fetched and a 'value' that is
 * 'undefined' because it has never been set in storage. To determine if a value
 * has never been set, use:
 * const hasNeverBeenSetInStorage = storageStatus.isSynchd && value === undefined;
 *
 * 'storageStatus.errorCode indicates whether the cipherKey (if used) could not
 * decrypt the message or if there were errors while using biometrics
 * (user cancelled or device problems)
 *
 * This hook simplifies managing persistent state in your React application by
 * synchronizing state with a storage system, handled by the StorageProvider.
 *
 */

import React, {
  useState,
  useCallback,
  useEffect,
  createContext,
  useContext,
  ReactNode
} from 'react';
import {
  getAsync,
  setAsync,
  deleteAsync,
  SerializationFormat,
  Engine,
  assertSerializationFormat,
  StorageStatus,
  StorageErrorCodes,
  getStorageErrorCode
} from '../lib/storage';
import { Platform } from 'react-native';

type StorageState<T> = Record<string, T>;
type ProviderValue<T> = {
  valueMap: StorageState<T>;
  setValueMap: React.Dispatch<React.SetStateAction<StorageState<T>>>;
  errorCodeMap: Record<string, StorageErrorCodes>;
  setErrorCodeMap: React.Dispatch<
    React.SetStateAction<Record<string, StorageErrorCodes>>
  >;
};
const StorageContext = createContext<ProviderValue<unknown> | null>(null);

const StorageProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [valueMap, setValueMap] = useState<StorageState<unknown>>({});
  const [errorCodeMap, setErrorCodeMap] = useState<
    Record<string, StorageErrorCodes>
  >({});

  return (
    <StorageContext.Provider
      value={{ valueMap, setValueMap, errorCodeMap, setErrorCodeMap }}
    >
      {children}
    </StorageContext.Provider>
  );
};

const useGlobalStateStorage = <T,>(
  /**
   * Keys must and contain only alphanumeric characters, ".", "-", and "_"
   */
  key: string | undefined,
  serializationFormat: SerializationFormat,
  /** defaultValue is used to set an initial value if the storage does not
   * contain already a value. DO NOT confuse this parameter with an initial
   * value.
   */
  defaultValue?: T,
  engine: Engine = Platform.OS === 'web' ? 'IDB' : 'MMKV',
  cipherKey: Uint8Array | undefined = undefined,
  authenticationPrompt: string | undefined = undefined
): [
  T | undefined,
  (newValue: T) => Promise<void>,
  () => Promise<void>,
  () => void,
  StorageStatus
] => {
  const context = useContext(StorageContext);
  if (context === null)
    throw new Error(`useStorage must be used within a StorageProvider`);

  const { valueMap, setValueMap, errorCodeMap, setErrorCodeMap } = context;

  /** sets storage and sate value */
  const setStorageValue = useCallback(
    async (newValue: T) => {
      if (newValue === undefined)
        throw new Error(
          'Cannot set undefined value, since undefined is used to mark empty keys'
        );
      if (key !== undefined) {
        await setAsync(
          key,
          assertSerializationFormat(newValue, serializationFormat),
          engine,
          cipherKey,
          authenticationPrompt
        );
        //useState assumes immutability: https://react.dev/reference/react/useState
        setValueMap(prevState =>
          prevState[key] !== newValue
            ? { ...prevState, [key]: newValue }
            : prevState
        );
      }
    },
    [
      key,
      setValueMap,
      serializationFormat,
      engine,
      cipherKey,
      authenticationPrompt
    ]
  );

  //We only need to retrieve the value from the storage intially for each key
  //We know key has not been retrieved yet if valueMap[key] is not set.
  //Note that valueMap[key] may be set to undefined which means it was retrieved
  //already but nothing was found in storage and no defaultValue was used
  //After having retrieved the initial value, then we will rely on
  //valueMap[key] to not spam the storage with more requests that we
  //already know the result
  useEffect(() => {
    if (key !== undefined) {
      const fetchValue = async () => {
        try {
          setErrorCodeMap(prevState =>
            prevState[key] !== false
              ? { ...prevState, [key]: false }
              : prevState
          );
          const savedValue = await getAsync(
            key,
            serializationFormat,
            engine,
            cipherKey,
            authenticationPrompt
          );
          if (savedValue !== undefined)
            //useState assumes immutability: https://react.dev/reference/react/useState
            setValueMap(prevState =>
              prevState[key] !== savedValue
                ? { ...prevState, [key]: savedValue }
                : prevState
            );
          else if (defaultValue !== undefined)
            await setStorageValue(defaultValue);
          //useState assumes immutability: https://react.dev/reference/react/useState
          else
            setValueMap(prevState =>
              prevState[key] !== undefined ||
              !(
                //isSynchd can also be marked with state[key] = undefined
                (key in prevState)
              )
                ? { ...prevState, [key]: undefined }
                : prevState
            );
        } catch (err: unknown) {
          console.warn(err);
          const errorCode = getStorageErrorCode(err);
          setErrorCodeMap(prevState =>
            prevState[key] !== errorCode
              ? { ...prevState, [key]: errorCode }
              : prevState
          );
        }
      };
      if (!(key in valueMap)) fetchValue();
    }
  }, [
    key,
    authenticationPrompt,
    cipherKey,
    defaultValue,
    engine,
    serializationFormat,
    setStorageValue,
    setValueMap,
    valueMap,
    setErrorCodeMap
  ]);

  const clearCache = useCallback(() => {
    if (key) {
      setValueMap(prevState => {
        if (key in prevState) {
          const { [key]: omitted, ...newState } = prevState;
          void omitted;
          return newState;
        }
        return prevState;
      });

      setErrorCodeMap(prevState => {
        if (key in prevState) {
          const { [key]: omitted, ...newState } = prevState;
          void omitted;
          return newState;
        }
        return prevState;
      });
    }
  }, [key, setValueMap, setErrorCodeMap]);

  const deleteValue = useCallback(async () => {
    if (key) {
      await deleteAsync(key, engine, authenticationPrompt);
      clearCache();
    }
  }, [key, engine, authenticationPrompt, clearCache]);

  if (key === undefined)
    return [
      undefined,
      setStorageValue,
      deleteValue,
      clearCache,
      { isSynchd: false, errorCode: false }
    ];
  else {
    if (key in valueMap && !(key in errorCodeMap))
      throw new Error(`errorCodeMap not set for ${key}`);
    //valueMap is not set when decrypt error, but we know it's synchd anyway
    const isSynchd = key in valueMap || key in errorCodeMap;
    const errorCode = errorCodeMap[key] || false;
    return [
      valueMap[key] as T | undefined,
      setStorageValue,
      deleteValue,
      clearCache,
      { isSynchd, errorCode }
    ];
  }
};

export { StorageProvider, useGlobalStateStorage };
