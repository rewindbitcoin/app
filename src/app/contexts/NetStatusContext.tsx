/**
 * Usage:
 *
 * Call as const netStatus = useNetStatus();
 *
 * netStatus provides:
 *
 * Setters for network operations to check:
 * - setExplorer: Sets an Esplora or Electrum client for regular checks.
 * - setGenerate204API: Sets main RewindBitcoin API to check its generate_204
 *   endpoint.
 * - setGenerate204API2: Sets secondary API for ensuring vault backups can be
 *   read from another host.
 * - setGenerate204APIExternal: Sets external API for ensuring the Internet
 *   is reachable. F.ex.: https://clients3.google.com/generate_204.
 *   read from another host.
 * - setExplorerMainnet: Sets Blockstream or popular blocks explorer for TAPE
 *   network fee checks.
 *
 * Statuses for each setter (if set):
 * - apiReachable: Status of the main API.
 * - api2Reachable: Status of the secondary API.
 * - explorerReachable: Status of the blockchain explorer.
 * - explorerMainnetReachable: Status of the mainnet explorer for TAPE fees.
 * - internetReachable: False if any set service fails.
 *
 * Services are checked every minute. If any service fails, checks occur every
 * 20s until restored.
 *
 * checkStatus: Instantly checks if all services are up. Toasts error/recovery
 * messages as needed. At most one error is shown (the most relevant one) to
 * avoid cluttering the UI. Note that error toasts also occur during regular
 * scheduled checks if any service fails.
 *
 * errorMessage: Returns the current error message, if any. This can be used to
 * display the error message permanently in a UI element, such as the
 * WalletHeader.
 *
 * Typical usage:
 * 1. Set required statuses: setExplorer, setGenerate204API, setGenerate204API2,
 *    setExplorerMainnet. Optionally setGenerate204APIExternal (using google.com
 *    servers for example)
 * 2. The hook auto-checks all statuses and shows error messages on failure.
 * 3. Before network operations, check relevant service status (e.g.,
 *    api2Reachable).
 * 4. If a network operation fails, await checkStatus().serviceStatus to verify
 *    service availability.
 * 5. If the service is down, the module will have already shown a generic error
 *    to avoid cluttering the UI. If the service is up, handle and toast the
 *    specific network operation failure externally.
 */

const RETRY_TIME_AFTER_OK = 60 * 1000;
const RETRY_TIME_AFTER_FAIL = 20 * 1000;
const ATTEMPTS = 5;

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
import type { Explorer } from '@bitcoinerlab/explorer';
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
  setGenerate204APIExternal: (
    setGenerate204APIExternal: string | undefined
  ) => void;
  setExplorer: (explorer: Explorer | undefined) => void;
  setExplorerMainnet: (explorerMainnet: Explorer | undefined) => void; //For Tape fees
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
  const [generate204APIExternal, setGenerate204APIExternal] = useState<
    string | undefined
  >(undefined);
  const [explorer, setExplorer] = useState<Explorer | undefined>(undefined);
  const [explorerMainnet, setExplorerMainnet] = useState<Explorer | undefined>(
    undefined
  );

  const [errorMessage, setErrorMessage] = useState<string | undefined>(
    undefined
  );
  const errorMessageRef = useRef<string | undefined>(undefined);
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
    console.log('NetStatusContext network check starts');
    if (AppState.currentState !== 'active') return;
    clearExistingInterval();

    let newErrorMessage: string | undefined = undefined;

    // Create an array of promises for the network reachability checks
    const checks = [
      generate204API ? checkNetworkReachability(generate204API) : false,
      generate204API2 ? checkNetworkReachability(generate204API2) : false,
      explorer ? explorer.isConnected() : false,
      explorerMainnet ? explorerMainnet.isConnected() : false,
      generate204APIExternal
        ? checkNetworkReachability(generate204APIExternal)
        : false
    ];
    // Run all the checks in parallel
    const [
      newApiReachable = false,
      newApi2Reachable = false,
      newExplorerReachable = false,
      newExplorerMainnetReachable = false,
      newApiExternalReachable = false
    ] = await Promise.all(checks);
    if (generate204API) {
      const startTime = Date.now();
      await checkNetworkReachability(generate204API);
      console.log(`TIME generate204API ${Date.now() - startTime} ms`);
    }
    if (explorer) {
      const startTime = Date.now();
      await explorer.isConnected();
      console.log(`TIME explorer ${Date.now() - startTime} ms`);
    }
    if (explorerMainnet) {
      const startTime = Date.now();
      await explorerMainnet.isConnected();
      console.log(`TIME explorerMainnet ${Date.now() - startTime} ms`);
    }

    if (generate204API && !newApiReachable)
      newErrorMessage = t('netStatus.apiNotReachableWarning');

    if (generate204API2 && !newApi2Reachable)
      newErrorMessage = t('netStatus.apiNotReachableWarning');

    if (explorer && !newExplorerReachable)
      newErrorMessage = t('netStatus.blockchainExplorerNotReachableWarning');

    if (explorerMainnet && !newExplorerMainnetReachable)
      newErrorMessage = t('netStatus.blockchainExplorerNotReachableWarning');

    const internetCheckRequested =
      !!generate204API ||
      !!generate204API2 ||
      !!generate204APIExternal ||
      !!explorer ||
      !!explorerMainnet;
    const newInternetReachable =
      newApiReachable ||
      newApi2Reachable ||
      newExplorerReachable ||
      newExplorerMainnetReachable ||
      newApiExternalReachable;
    console.log(
      'NetStatusContext network checks complete',
      JSON.stringify(
        {
          generate204API,
          internetCheckRequested,
          newInternetReachable,
          newApiReachable,
          newApi2Reachable,
          newExplorerReachable,
          newExplorerMainnetReachable,
          newApiExternalReachable
        },
        null,
        2
      )
    );

    if (!newInternetReachable && internetCheckRequested)
      newErrorMessage = t('netStatus.internetNotReachableWarning');

    if (newErrorMessage && errorMessageRef.current === undefined) {
      toast.show(newErrorMessage, { type: 'warning' });
      errorMessageRef.current = newErrorMessage;
    }
    if (newErrorMessage === undefined && errorMessageRef.current) {
      toast.show(t('netStatus.connectionRestoredInfo'), { type: 'success' });
      errorMessageRef.current = undefined;
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
    generate204API,
    generate204API2,
    generate204APIExternal,
    checkNetworkReachability,
    clearExistingInterval,
    explorer,
    explorerMainnet
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
      setExplorer,
      explorerMainnetReachable, //For Tape fees
      setExplorerMainnet, //Only set when needed: For Tape fees
      setGenerate204API,
      setGenerate204API2,
      setGenerate204APIExternal
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
