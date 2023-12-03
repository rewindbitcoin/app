import React, {
  createContext,
  useState,
  useEffect,
  useContext,
  ReactNode
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type SubUnit = 'sat' | 'mbit' | 'bit';
export type Currency = 'USD' | 'EUR' | 'GBP';
export type Locale = 'en-US' | 'es-ES';

interface Settings {
  GAP_LIMIT: number;
  MIN_FEE_RATE: number;
  MIN_LOCK_BLOCKS: number;
  MAX_LOCK_BLOCKS: number;
  INITIAL_LOCK_BLOCKS: number;
  SAMPLES: number;
  PRESIGNED_FEE_RATE_CEILING: number;
  INITIAL_CONFIRMATION_TIME: number;
  MIN_RECOVERABLE_RATIO: number;
  SUB_UNIT: SubUnit;
  CURRENCY: Currency;
  LOCALE: Locale;
}

interface SettingsContextProps {
  settings: Settings;
  setSettings: (settings: Partial<Settings>) => void;
  isLoading: boolean;
  isProviderMissing: boolean;
}

// Default values for the context
const defaultSettings: Settings = {
  GAP_LIMIT: 3,
  MIN_FEE_RATE: 1,
  MIN_LOCK_BLOCKS: 1,
  MAX_LOCK_BLOCKS: 30 * 24 * 6,
  INITIAL_LOCK_BLOCKS: 7 * 24 * 6,
  //TODO: set it to larger values in production
  SAMPLES: 10,
  //TODO: this should be 5 * 1000; I set it to 10 for testnet tests
  //PRESIGNED_FEE_RATE_CEILING: 5 * 1000, //22-dec-2017 fee rates were 1000. TODO: Set this to 5000 which is 5x 22-dec-2017
  PRESIGNED_FEE_RATE_CEILING: 2,
  // 2 hours
  INITIAL_CONFIRMATION_TIME: 2 * 60 * 60,
  //TODO: set it to 2/3 in the production case
  //MIN_RECOVERABLE_RATIO: '2/3' // express it in string so that it can be printed. Must be 0 > MIN_RECOVERABLE_RATIO > 1
  MIN_RECOVERABLE_RATIO: 1 / 100,
  SUB_UNIT: 'sat',
  LOCALE: 'en-US',
  CURRENCY: 'USD'
};

// Create the context
const SettingsContext = createContext<SettingsContextProps>({
  settings: defaultSettings,
  setSettings: () => {},
  isLoading: true,
  isProviderMissing: true
});

// Provider component
export const SettingsProvider: React.FC<{ children: ReactNode }> = ({
  children
}) => {
  const [settings, setSettingsState] = useState<Settings>(defaultSettings);
  const [isLoading, setLoading] = useState(true); // State to track loading status

  // Function to update settings and save to AsyncStorage
  const setSettings = async (newSettings: Partial<Settings>) => {
    setSettingsState(currentSettings => {
      const updatedSettings = { ...currentSettings, ...newSettings };
      const stringifiedUpdatedSettings = JSON.stringify(updatedSettings);
      // Only update if newSettings are different from currentSettings
      if (JSON.stringify(currentSettings) === stringifiedUpdatedSettings) {
        return currentSettings;
      }

      AsyncStorage.setItem('settings', stringifiedUpdatedSettings);
      return updatedSettings;
    });
  };

  // Load settings from AsyncStorage on startup
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const savedSettings = await AsyncStorage.getItem('settings');
        if (savedSettings) {
          setSettingsState(JSON.parse(savedSettings));
        }
      } catch (error) {
        console.error('Failed to load settings:', error);
      }
      setLoading(false); // Update loading status after settings are loaded
    };

    loadSettings();
  }, []);

  return (
    <SettingsContext.Provider
      value={{ settings, setSettings, isLoading, isProviderMissing: false }}
    >
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => {
  const context = useContext(SettingsContext);
  if (context.isProviderMissing) {
    throw new Error('Wrap this component with SettingsProvider');
  }
  return context;
};

export default SettingsContext;
