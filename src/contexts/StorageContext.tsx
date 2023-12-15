import memoize from 'lodash.memoize';
import React, {
  useState,
  useEffect,
  createContext,
  useContext,
  ReactNode
} from 'react';
import { storage } from '../lib/storage';

type StorageContextType<T> = {
  value: T | undefined;
  setValue: React.Dispatch<React.SetStateAction<T | undefined>>;
  isStorageSynchd: boolean;
};

const createStorageHook = <T,>(key: string): StorageHook<T> => {
  const StorageContext = createContext<StorageContextType<T> | undefined>(
    undefined
  );

  const StorageProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [value, setValue] = useState<T | undefined>();
    const [isStorageSynchd, setIsStorageSynchd] = useState(false);

    useEffect(() => {
      const fetchValue = async () => {
        const savedValue = await storage.getStringAsync(key);

        if (typeof savedValue === 'string') {
          try {
            const parsedValue = JSON.parse(savedValue);
            setValue(parsedValue as T);
          } catch (error) {
            setValue(savedValue as T);
          }
        }
        setIsStorageSynchd(true);
      };
      fetchValue();
    }, []);

    return (
      <StorageContext.Provider value={{ value, setValue, isStorageSynchd }}>
        {children}
      </StorageContext.Provider>
    );
  };

  const useStorage = (): [
    T | undefined,
    (newValue: T) => Promise<void>,
    boolean
  ] => {
    const context = useContext(StorageContext);
    if (!context) {
      throw new Error(
        `useStorage must be used within a StorageProvider for key ${key}`
      );
    }

    const { value, setValue, isStorageSynchd } = context;

    const setStorageValue = async (newValue: T) => {
      await storage.setStringAsync(
        key,
        typeof newValue === 'string' ? newValue : JSON.stringify(newValue)
      );
      setValue(newValue);
    };

    return [value, setStorageValue, isStorageSynchd];
  };

  return { StorageProvider, useStorage };
};

// Memoize the creation of providers and hooks for each key
type StorageHook<T> = {
  StorageProvider: React.FC<{ children: React.ReactNode }>;
  useStorage: () => [T | undefined, (newValue: T) => Promise<void>, boolean];
};

export const getStorageHook = memoize(<T,>(key: string) => {
  return createStorageHook<T>(key);
});

export default getStorageHook;
