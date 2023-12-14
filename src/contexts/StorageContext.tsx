import React, {
  createContext,
  useState,
  useEffect,
  useContext,
  ReactNode
} from 'react';
import { storage } from '../lib/storage';

//Important: don't use objects or arrays since the reference would be checked
//below in the implementation to trigger updates
type StorageValueType = string | number | boolean;

interface StorageValue {
  value: StorageValueType;
  setValue: (newValue: StorageValueType) => Promise<void>;
}

interface StorageContextType {
  storage: { [key: string]: StorageValue };
  setStorageValue: (key: string, newValue: StorageValueType) => Promise<void>;
  isInitialized: boolean;
  isProviderMissing: boolean;
}

const defaultContext: StorageContextType = {
  storage: {},
  setStorageValue: async () => {},
  isInitialized: true,
  isProviderMissing: true
};

const StorageContext = createContext<StorageContextType>(defaultContext);

export const StorageProvider: React.FC<{ children: ReactNode }> = ({
  children
}) => {
  const [storageState, setStorageState] = useState<{
    [key: string]: StorageValueType;
  }>({});
  const [isInitialized, setInitilized] = useState(true);

  const setStorageValue = async (key: string, newValue: StorageValueType) => {
    await storage.set(key, newValue);
    setStorageState(prevState => ({ ...prevState, [key]: newValue }));
  };

  useEffect(() => {
    const loadValues = async () => {
      // Load values for each key in storageState
      try {
        for (const key in storageState) {
          const savedValue = await storage.getString(key);
          if (savedValue) {
            setStorageState(prevState => ({
              ...prevState,
              [key]: savedValue
            }));
          }
        }
      } catch (error) {
        console.error('Failed to load values:', error);
      }
      setInitilized(false);
    };

    loadValues();
  }, []);

  const contextValue: StorageContextType = {
    storage: Object.keys(storageState).reduce(
      (acc, key) => ({
        ...acc,
        [key]: {
          value: storageState[key],
          setValue: (newValue: StorageValueType) =>
            setStorageValue(key, newValue)
        }
      }),
      {}
    ),
    setStorageValue,
    isInitialized,
    isProviderMissing: false
  };

  return (
    <StorageContext.Provider value={contextValue}>
      {children}
    </StorageContext.Provider>
  );
};

export const useStorage = (key: string, initialValue: StorageValueType) => {
  const context = useContext(StorageContext);
  if (context.isProviderMissing) {
    throw new Error('Wrap this component with StorageProvider');
  }

  // Initialize state for the specific key
  const [value, setValue] = useState(() => {
    // If initialValue is provided, use it and consider the initial load as done.
    if (initialValue !== undefined) {
      context.setStorageValue(key, initialValue); // Set the initial value in storage
      return initialValue;
    }
    return context.storage[key]?.value;
  });

  // Update local state when the specific key in the context changes
  useEffect(() => {
    if (context.storage[key]?.value !== value) {
      setValue(context.storage[key].value);
    }
  }, [context.storage, key, value]);

  // Function to update the value in context and local state
  const setStorageValue = (newValue: StorageValueType) => {
    context.setStorageValue(key, newValue);
    setValue(newValue);
  };

  return [value, setStorageValue];
};

export default StorageContext;
