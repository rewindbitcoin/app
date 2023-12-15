//TODO: provide clear in the useGlobalStateStorage and useLocalStateStorage
//TODO: provide a clearAll in storage.ts
//
//TODO: provide idb-keyval layer compat
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
 * in str/lib/storage.
 *
 * `useGlobalStateStorage` is ideal for global settings or states that need to be
 * consistently reflected across the entire application.
 *
 * Usage:
 *
 * To use the `useGlobalStateStorage` hook, call it with a specific key and type. For example:
 * const [value, setValue, isSynchd] = useGlobal<Settings>('settings');
 * Here, 'Settings' is a TypeScript type or interface representing the structure
 * of the data you're working with.
 *
 * The 'key' argument ('settings' in this example) uniquely identifies the data
 * in the storage system. It is used to store and retrieve the value.
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
 * IMPORTANT: NB
 *
 */

import React, {
  useState,
  useEffect,
  createContext,
  useContext,
  ReactNode
} from 'react';
import { storage } from '../lib/storage';

type StorageState<T> = Record<string, T>;
type ProviderValue<T> = {
  storageState: StorageState<T>;
  setStorageState: React.Dispatch<React.SetStateAction<StorageState<T>>>;
};
const StorageContext = createContext<ProviderValue<unknown> | null>(null);

const StorageProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  //console.log('StorageProvider');
  const [storageState, setStorageState] = useState<StorageState<unknown>>({});

  return (
    <StorageContext.Provider value={{ storageState, setStorageState }}>
      {children}
    </StorageContext.Provider>
  );
};

export const SETTINGS_GLOBAL_STORAGE = 'SETTINGS_GLOBAL_STORAGE';

const useGlobalStateStorage = <T,>(
  key: string
): [T | undefined, (newValue: T) => Promise<void>, boolean] => {
  const context = useContext(StorageContext);
  if (context === null) {
    throw new Error(`useStorage must be used within a StorageProvider`);
  }
  const { storageState, setStorageState } = context;

  useEffect(() => {
    //We only need to retrieve the value from the storage intially
    //We know key has not been retrieved yet if storageState[key] is not set.
    //After having retrieved the initial value, then we will rely on
    //storageState[key] to not spam the storage with more requests that we
    //already know the result
    if (!(key in storageState)) {
      //console.log(`fetching key ${key}`);
      const fetchValue = async () => {
        const savedValue = await storage.getStringAsync(key);
        let parsedValue: T | undefined;

        if (typeof savedValue === 'string') {
          try {
            parsedValue = JSON.parse(savedValue);
          } catch (error) {
            parsedValue = savedValue as T;
          }
        } else
          throw new Error(
            `non-string types not contemplated in useStorage: ${savedValue}`
          );
        setStorageState(prevState => {
          //console.log(`setting value ${parsedValue} to state for ${key}`);
          return { ...prevState, [key]: parsedValue };
        });
      };
      fetchValue();
    }
  }, [storageState, key, storage]);

  const setStorageValue = async (newValue: T) => {
    await storage.setStringAsync(
      key,
      typeof newValue === 'string' ? newValue : JSON.stringify(newValue)
    );
    setStorageState(prevState => ({ ...prevState, [key]: newValue }));
  };

  return [
    storageState[key] as T | undefined,
    setStorageValue,
    key in storageState
  ];
};

export { StorageProvider, useGlobalStateStorage };
