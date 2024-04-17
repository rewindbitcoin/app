/** returns undefined until it is retrieved whether the system has SecureStorage
 * avilability. Then, it returns a boolean
 */
import React, {
  createContext,
  useState,
  useEffect,
  useContext,
  ReactNode
} from 'react';
import { getSecureStorageInfoAsync } from '../lib/storage';
import type { AuthenticationType } from 'expo-local-authentication';

export type SecureStorageInfo = {
  canUseSecureStorage: boolean;
  authenticationTypes: AuthenticationType[];
};

// Create the context with an initial undefined value
export const SecureStorageInfoContext = createContext<SecureStorageInfo | null>(
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

  useEffect(() => {
    let isMounted = true;

    const checkSecureStorageInfo = async () => {
      const secureStorageInfo = await getSecureStorageInfoAsync();
      if (isMounted) {
        setSecureStorageInfo(secureStorageInfo);
      }
    };

    checkSecureStorageInfo();

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <SecureStorageInfoContext.Provider value={secureStorageInfo}>
      {children}
    </SecureStorageInfoContext.Provider>
  );
};

// Custom hook for accessing the context
export const useSecureStorageInfo = () => {
  const context = useContext(SecureStorageInfoContext);
  if (context === undefined) {
    throw new Error(
      'useSecureStorageInfo must be used within a SecureStorageInfoProvider'
    );
  }
  return context;
};
