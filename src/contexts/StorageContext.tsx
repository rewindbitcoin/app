import React, {
  useState,
  useEffect,
  createContext,
  useContext,
  ReactNode
} from 'react';
import { storage } from '../lib/storage';

type FactoryType = <T>(key: string) => {
  value: T | undefined;
  setValue: React.Dispatch<React.SetStateAction<T | undefined>>;
  isStorageSynchd: boolean;
};
const StorageContext = createContext<FactoryType | null>(null);

const StorageProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  console.log('StorageProvider');
  const factory = <T,>(key: string) => {
    console.log(`Creating setters for key ${key}`);
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
    return { value, setValue, isStorageSynchd };
  };
  return (
    <StorageContext.Provider value={factory}>
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

  const factory = context;
  const { value, setValue, isStorageSynchd } = factory<T>(key);

  const setStorageValue = async (newValue: T) => {
    await storage.setStringAsync(
      key,
      typeof newValue === 'string' ? newValue : JSON.stringify(newValue)
    );
    setValue(newValue);
  };

  return [value, setStorageValue, isStorageSynchd];
};

export { StorageProvider, useStorage };
