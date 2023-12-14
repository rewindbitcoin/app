//TODO: here there is a problem when I set a value again that was
//previously stored, then I might return another reference?
import memoize from 'lodash.memoize';
import React, {
  useState,
  useEffect,
  createContext,
  useContext,
  useRef,
  ReactNode
} from 'react';
import { storage } from '../lib/storage';

type StorageContextType<T> = {
  value: T | undefined;
  setValue: React.Dispatch<React.SetStateAction<T | undefined>>;
  hasFetched: React.MutableRefObject<boolean>;
};

const createStorageHook = <T,>(key: string): StorageHook<T> => {
  const StorageContext = createContext<StorageContextType<T> | undefined>(
    undefined
  );

  const StorageProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [value, setValue] = useState<T | undefined>();
    const hasFetched = useRef(false);

    useEffect(() => {
      const fetchValue = async () => {
        const savedValue = await storage.getStringAsync(key);

        if (typeof savedValue === 'string') {
          try {
            // Try parsing as JSON
            const parsedValue = JSON.parse(savedValue);
            setValue(parsedValue as T);
          } catch (error) {
            // If parsing fails, set as string
            setValue(savedValue as unknown as T);
          }
        }
        hasFetched.current = true;
      };
      fetchValue();
    }, []);

    return (
      <StorageContext.Provider value={{ value, setValue, hasFetched }}>
        {children}
      </StorageContext.Provider>
    );
  };

  const useStorage = (
    callback?: (value: T | undefined) => void
  ): [T | undefined, (newValue: T) => Promise<void>, boolean] => {
    const context = useContext(StorageContext);
    if (!context) {
      throw new Error(
        `useStorage must be used within a StorageProvider for key ${key}`
      );
    }

    const { value, setValue, hasFetched } = context;

    useEffect(() => {
      if (hasFetched.current && callback) {
        callback(value);
      }
    }, [value, callback]);

    const setStorageValue = async (newValue: T) => {
      await storage.setStringAsync(
        key,
        typeof newValue === 'string' ? newValue : JSON.stringify(newValue)
      );
      setValue(newValue);
    };

    return [value, setStorageValue, hasFetched.current];
  };

  return { StorageProvider, useStorage };
};

// Memoize the creation of providers and hooks for each key
type StorageHook<T> = {
  StorageProvider: React.FC<{ children: React.ReactNode }>;
  useStorage: (
    callback?: (value: T | undefined) => void
  ) => [T | undefined, (newValue: T) => Promise<void>, boolean];
};

export const getStorageHook = memoize(<T,>(key: string) => {
  return createStorageHook<T>(key);
});

export default getStorageHook;
