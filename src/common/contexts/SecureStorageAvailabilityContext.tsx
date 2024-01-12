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
import { canUseSecureStorageAsync } from '../lib/storage';

// Create the context with an initial undefined value
export const SecureStorageAvailabilityContext = createContext<
  boolean | undefined
>(undefined);

interface SecureStorageAvailabilityProviderProps {
  children: ReactNode;
}

export const SecureStorageAvailabilityProvider: React.FC<
  SecureStorageAvailabilityProviderProps
> = ({ children }) => {
  const [canUseSecureStorageAvailability, setCanUseSecureStorageAvailability] =
    useState<boolean>(false);

  useEffect(() => {
    let isMounted = true;

    const checkSecureStorageAvailability = async () => {
      try {
        const isAvailable = await canUseSecureStorageAsync();
        if (isMounted) {
          setCanUseSecureStorageAvailability(isAvailable);
        }
      } catch (error) {
        console.error('Error checking secure storage availability:', error);
        if (isMounted) {
          setCanUseSecureStorageAvailability(false);
        }
      }
    };

    checkSecureStorageAvailability();

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <SecureStorageAvailabilityContext.Provider
      value={canUseSecureStorageAvailability}
    >
      {children}
    </SecureStorageAvailabilityContext.Provider>
  );
};

// Custom hook for accessing the context
export const useSecureStorageAvailability = () => {
  const context = useContext(SecureStorageAvailabilityContext);
  if (context === undefined) {
    throw new Error(
      'useSecureStorageAvailability must be used within a SecureStorageAvailabilityProvider'
    );
  }
  return context;
};
