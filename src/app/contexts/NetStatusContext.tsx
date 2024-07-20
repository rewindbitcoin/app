const RETRY_TIME_AFTER_OK = 20 * 1000;
const RETRY_TIME_AFTER_FAIL = 5 * 1000;
const ATTEMPTS = 5;

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
import { useToast } from '../../common/ui';

import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  createContext,
  useMemo
} from 'react';
import { useTranslation } from 'react-i18next';
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
  errorMessage: string | undefined;
  checkStatus: () => Promise<
    | undefined //when AppState.currentState !== 'active'
    | {
        internetReachable: boolean;
        apiReachable: boolean;
        api2Reachable: boolean;
        explorerReachable: boolean;
        explorerMainnetReachable: boolean;
      }
  >;
  internetReachable: boolean;
  apiReachable: boolean;
  api2Reachable: boolean;
  explorerReachable: boolean;
  explorerMainnetReachable: boolean;
  setGenerate204API: (generate204API: string | undefined) => void;
  setGenerate204API2: (generate204API2: string | undefined) => void;
  setExplorerCheckFunction: (fn: (() => Promise<boolean>) | undefined) => void;
  //For Tape fees:
  setExplorerMainnetCheckFunction: (
    fn: (() => Promise<boolean>) | undefined
  ) => void;
}

export const NetStatusContext = createContext<NetStatus | undefined>(undefined);

interface NetStatusProviderProps {
  children: React.ReactNode;
}

const NetStatusProvider: React.FC<NetStatusProviderProps> = ({ children }) => {
  const { t } = useTranslation();
  const toast = useToast();
  const [generate204API, setGenerate204API] = useState<string | undefined>(
    undefined
  );
  const [generate204API2, setGenerate204API2] = useState<string | undefined>(
    undefined
  );
  const [explorerCheckFunction, setExplorerCheckFunction] = useState<
    (() => Promise<boolean>) | undefined
  >(undefined);
  const [explorerMainnetCheckFunction, setExplorerMainnetCheckFunction] =
    useState<(() => Promise<boolean>) | undefined>(undefined); //For Tape fees

  const [errorMessage, setErrorMessage] = useState<string | undefined>(
    undefined
  );
  const [internetReachable, setInternetReachable] = useState(false);
  const [apiReachable, setApiReachable] = useState(false);
  const [api2Reachable, setApi2Reachable] = useState(false);
  const [explorerReachable, setExplorerReachable] = useState(false);
  const [explorerMainnetReachable, setExplorerMainnetReachable] =
    useState(false);
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

    let newErrorMessage: string | undefined = undefined;

    const newApiReachable = generate204API
      ? await checkNetworkReachability(generate204API)
      : false;
    if (generate204API && !newApiReachable)
      newErrorMessage = t('netStatus.apiNotReachableWarning');

    const newApi2Reachable = generate204API2
      ? await checkNetworkReachability(generate204API2)
      : false;
    if (generate204API2 && !newApi2Reachable)
      newErrorMessage = t('netStatus.apiNotReachableWarning');

    const newExplorerReachable = explorerCheckFunction
      ? await explorerCheckFunction()
      : false;
    if (explorerCheckFunction && !newExplorerReachable)
      newErrorMessage = t('netStatus.blockchainExplorerNotReachableWarning');

    const newExplorerMainnetReachable = explorerMainnetCheckFunction
      ? await explorerMainnetCheckFunction()
      : false;
    if (explorerMainnetCheckFunction && !newExplorerMainnetReachable)
      newErrorMessage = t('netStatus.blockchainExplorerNotReachableWarning');

    const newInternetReachable =
      newApiReachable ||
      newApi2Reachable ||
      newExplorerReachable ||
      newExplorerMainnetReachable ||
      (await checkNetworkReachability(
        'https://clients3.google.com/generate_204'
      ));
    if (!newInternetReachable)
      newErrorMessage = t('netStatus.internetNotReachableWarning');

    if (newErrorMessage && errorMessage === undefined) {
      toast.show(newErrorMessage, { type: 'error' });
    }
    if (newErrorMessage === undefined && errorMessage) {
      toast.show(t('netStatus.connectionRestoredInfo'), { type: 'success' });
    }

    unstable_batchedUpdates(() => {
      setErrorMessage(newErrorMessage);
      setExplorerReachable(newExplorerReachable);
      setExplorerMainnetReachable(newExplorerMainnetReachable);
      setApiReachable(newApiReachable);
      setApi2Reachable(newApi2Reachable);
      setInternetReachable(newInternetReachable);
    });

    // Schedule the next check
    const nextCheckDelay = newErrorMessage
      ? RETRY_TIME_AFTER_FAIL
      : RETRY_TIME_AFTER_OK;
    checkInterval.current = setTimeout(checkStatus, nextCheckDelay);
    return {
      internetReachable: newInternetReachable,
      apiReachable: newApiReachable,
      api2Reachable: newApi2Reachable,
      explorerReachable: newExplorerReachable,
      explorerMainnetReachable: newExplorerMainnetReachable //For Tape fees
    };
  }, [
    t,
    toast,
    errorMessage,
    generate204API,
    generate204API2,
    checkNetworkReachability,
    clearExistingInterval,
    explorerCheckFunction,
    explorerMainnetCheckFunction
  ]);

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
      errorMessage,
      checkStatus,
      internetReachable,
      apiReachable,
      api2Reachable,
      explorerReachable,
      explorerMainnetReachable, //For Tape fees
      setExplorerCheckFunction,
      setExplorerMainnetCheckFunction, //For Tape fees
      setGenerate204API,
      setGenerate204API2
    }),
    [
      errorMessage,
      checkStatus,
      internetReachable,
      apiReachable,
      api2Reachable,
      explorerReachable,
      explorerMainnetReachable
    ]
  );

  return (
    <NetStatusContext.Provider value={value}>
      {children}
    </NetStatusContext.Provider>
  );
};

export default NetStatusProvider;
