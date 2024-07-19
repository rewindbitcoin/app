const RETRY_TIME_AFTER_OK = 20 * 1000;
const RETRY_TIME_AFTER_FAIL = 5 * 1000;
const ATTEMPTS = 5;

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  createContext,
  useMemo
} from 'react';
import { Platform } from 'react-native';
import {
  AppState,
  unstable_batchedUpdates as RN_unstable_batchedUpdates
} from 'react-native';
const unstable_batchedUpdates = Platform.select({
  web: (cb: () => void) => {
    cb();
  },
  default: RN_unstable_batchedUpdates
});

export interface NetStatus {
  isInternetReachable: boolean;
  isApiReachable?: boolean;
}

export const NetStatusContext = createContext<NetStatus | undefined>(undefined);

interface NetStatusProviderProps {
  apiUrl: string;
  children: React.ReactNode;
}

const NetStatusProvider: React.FC<NetStatusProviderProps> = ({
  apiUrl,
  children
}) => {
  const [isInternetReachable, setInternetReachable] = useState(false);
  const [isApiReachable, setApiReachable] = useState(false);
  const checkInterval = useRef<NodeJS.Timeout | null>(null);

  const clearExistingInterval = useCallback(() => {
    if (checkInterval.current) {
      clearTimeout(checkInterval.current);
      checkInterval.current = null;
    }
  }, []);

  const checkNetworkReachability = useCallback(async (url: string) => {
    let attempts = ATTEMPTS;

    while (attempts > 0) {
      try {
        const response = await fetch(url);
        if (response.status === 204) return true;
        await sleep(200);
        attempts--;
      } catch (error) {
        if (attempts <= 1) return false;
        await sleep(200);
        attempts--;
      }
    }
    return false; // All attempts failed
  }, []);

  const checkStatus = useCallback(async () => {
    if (AppState.currentState !== 'active') return;
    clearExistingInterval();

    const apiReachable = await checkNetworkReachability(apiUrl);

    if (apiReachable) {
      unstable_batchedUpdates(() => {
        setApiReachable(true);
        setInternetReachable(true);
      });
    } else {
      setApiReachable(false);
      const internetReachable = await checkNetworkReachability(
        'https://clients3.google.com/generate_204'
      );
      setInternetReachable(internetReachable);
    }

    // Schedule the next check
    const nextCheckDelay = apiReachable
      ? RETRY_TIME_AFTER_OK
      : RETRY_TIME_AFTER_FAIL;
    checkInterval.current = setTimeout(checkStatus, nextCheckDelay);
  }, [apiUrl, checkNetworkReachability, clearExistingInterval]);

  useEffect(() => {
    checkStatus(); // Initial check

    const appStateSubscription = AppState.addEventListener(
      'change',
      nextAppState => {
        if (nextAppState === 'active') {
          checkStatus();
        }
      }
    );

    return () => {
      appStateSubscription.remove();
      clearExistingInterval();
    };
  }, [checkStatus, clearExistingInterval]);

  const value = useMemo(
    () => ({
      isInternetReachable,
      isApiReachable
    }),
    [isInternetReachable, isApiReachable]
  );

  return (
    <NetStatusContext.Provider value={value}>
      {children}
    </NetStatusContext.Provider>
  );
};

export default NetStatusProvider;
