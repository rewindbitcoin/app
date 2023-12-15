import React, {
  useState,
  useEffect,
  createContext,
  useContext,
  ReactNode
} from 'react';
import { storage } from '../lib/storage';

//

type StorageState<T> = Record<string, { isSynchd: boolean; value: T }>;
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

const useStorage = <T,>(
  key: string
): [T | undefined, (newValue: T) => Promise<void>, boolean] => {
  const context = useContext(StorageContext);
  if (context === null) {
    throw new Error(`useStorage must be used within a StorageProvider`);
  }
  const { storageState, setStorageState } = context;

  useEffect(() => {
    //We only need to retrieve the value from Storage intially (when isSynchd
    //is not defined). After that, then we will rely on storageState[key].value
    //to not spam the storage with more requests that we already know the result
    if (!storageState[key]?.isSynchd) {
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
        }
        setStorageState(prevState => {
          //console.log(`setting isSynchd to true for ${key}`);
          return {
            ...prevState,
            [key]: { value: parsedValue, isSynchd: true }
          };
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
    setStorageState(prevState => ({
      ...prevState,
      [key]: { value: newValue, isSynchd: true }
    }));
  };

  return [
    storageState[key]?.value as T | undefined,
    setStorageValue,
    !!storageState[key]?.isSynchd
  ];
};

export { StorageProvider, useStorage };
