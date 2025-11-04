// Copyright (C) 2025 Jose-Luis Landabaso - https://rewindbitcoin.com
// Licensed under the GNU GPL v3 or later. See the LICENSE file for details.

/** returns undefined until it is retrieved whether the system has SecureStorage
 * avilability. Then, it returns a boolean
 */

import isEqual from 'lodash.isequal';
import React, {
  createContext,
  useState,
  useEffect,
  useContext,
  ReactNode,
  useCallback
} from 'react';
import { getSecureStorageInfoAsync } from '../lib/storage';
import type { AuthenticationType } from 'expo-local-authentication';
import { AppState } from 'react-native';

export type SecureStorageInfo = {
  canUseSecureStorage: boolean;
  authenticationTypes: AuthenticationType[];
};

type SecureStorageContextType = {
  secureStorageInfo: SecureStorageInfo | null;
  fetchSecureStorageInfo: () => Promise<SecureStorageInfo>;
};

// Create the context with an initial undefined value
const SecureStorageInfoContext = createContext<SecureStorageContextType | null>(
  null
);

interface SecureStorageInfoProviderProps {
  children: ReactNode;
}

export const SecureStorageInfoProvider: React.FC<
  SecureStorageInfoProviderProps
> = ({ children }) => {
  const [secureStorageInfo, setSecureStorageInfo] =
    useState<SecureStorageInfo | null>(null);

  // Function to fetch secure storage information
  const fetchSecureStorageInfo = useCallback(async () => {
    const info = await getSecureStorageInfoAsync();
    // Only update state if the new info is different from the current state
    setSecureStorageInfo(prevInfo => {
      return isEqual(prevInfo, info) ? prevInfo : info;
    });
    return info;
  }, []);

  const contextValue = {
    secureStorageInfo,
    fetchSecureStorageInfo
  };

  useEffect(() => {
    // Initial fetch
    fetchSecureStorageInfo();

    // Setup an event listener for app state changes
    // This includes the user going to Settings and turn on/off FaceId and
    // go back to the app and also this includes the user declining the
    // OS dialog popup (returning from the OS native modal also triggers a nextAppState)
    const subscription = AppState.addEventListener('change', nextAppState => {
      if (nextAppState === 'active') {
        fetchSecureStorageInfo();
      }
    });

    // Cleanup the event listener
    return () => {
      subscription.remove();
    };
  }, [fetchSecureStorageInfo]);

  return (
    <SecureStorageInfoContext.Provider value={contextValue}>
      {children}
    </SecureStorageInfoContext.Provider>
  );
};

// Custom hook for accessing the context
export const useSecureStorageInfo = () => {
  const context = useContext(SecureStorageInfoContext);
  if (!context) {
    throw new Error(
      'useSecureStorageInfo must be used within a SecureStorageInfoProvider'
    );
  }
  return context;
};
