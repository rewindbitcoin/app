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
 * Statuses for each setter (if set). undefined if still unknown.
 * - apiReachable: Status of the main API.
 * - api2Reachable: Status of the secondary API.
 * - explorerReachable: Status of the blockchain explorer.
 * - explorerMainnetReachable: Status of the mainnet explorer for TAPE fees.
 * - internetReachable: False if any set service fails.
 *
 * Services are checked every minute. If any service fails, checks occur every
 * 20s until restored.
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
 * 4. If the service is down, the module will have already shown a generic error
 *    to avoid cluttering the UI.
 * 5. Use notifyNetErrorAsync to set other more particular network errors.
 */

type NotifiedErrorType = 'feeEstimates' | 'btcFiat' | 'tipStatus';
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
  notifyNetErrorAsync: ({
    errorType,
    error
  }: {
    errorType: NotifiedErrorType;
    error: string | false;
  }) => Promise<void>;
  internetReachable: boolean | undefined;
  apiReachable: boolean | undefined;
  api2Reachable: boolean | undefined;
  explorerReachable: boolean | undefined;
  explorerMainnetReachable: boolean | undefined;
  setGenerate204API: (generate204API: string | undefined) => void;
  setGenerate204API2: (generate204API2: string | undefined) => void;
  setGenerate204APIExternal: (
    setGenerate204APIExternal: string | undefined
  ) => void;
  setExplorer: (explorer: Explorer | undefined) => void;
  setExplorerMainnet: (explorerMainnet: Explorer | undefined) => void; //For Tape fees
  explorer: Explorer | undefined;
  explorerMainnet: Explorer | undefined;
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
  const [apiReachable, setApiReachable] = useState<boolean | undefined>();
  const [api2Reachable, setApi2Reachable] = useState<boolean | undefined>();
  const [apiExternalReachable, setApiExternalReachable] = useState<
    boolean | undefined
  >();
  const [explorerReachable, setExplorerReachable] = useState<
    boolean | undefined
  >();
  const [explorerMainnetReachable, setExplorerMainnetReachable] = useState<
    boolean | undefined
  >();
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

  const deriveInternetReachable = useCallback(
    ({
      apiReachable,
      api2Reachable,
      explorerReachable,
      explorerMainnetReachable,
      apiExternalReachable
    }: {
      apiReachable: boolean | undefined;
      api2Reachable: boolean | undefined;
      explorerReachable: boolean | undefined;
      explorerMainnetReachable: boolean | undefined;
      apiExternalReachable: boolean | undefined;
    }) => {
      const internetReachable =
        apiReachable ||
        api2Reachable ||
        explorerReachable ||
        explorerMainnetReachable ||
        apiExternalReachable;
      const internetCheckRequested =
        !!generate204API ||
        !!generate204API2 ||
        !!generate204APIExternal ||
        !!explorer ||
        !!explorerMainnet;
      return { internetCheckRequested, internetReachable };
    },
    [
      generate204API,
      generate204API2,
      generate204APIExternal,
      explorer,
      explorerMainnet
    ]
  );

  const deriveErrorMessage = useCallback(
    ({
      apiReachable,
      api2Reachable,
      explorerReachable,
      explorerMainnetReachable,
      internetCheckRequested,
      internetReachable
    }: {
      apiReachable: boolean | undefined;
      api2Reachable: boolean | undefined;
      explorerReachable: boolean | undefined;
      explorerMainnetReachable: boolean | undefined;
      internetCheckRequested: boolean | undefined;
      internetReachable: boolean | undefined;
    }) => {
      let errorMessage: string | undefined = undefined;

      //sorts notifierErrors from old to new. new notified errors trump
      //old ones
      const sortedNotifiedErrors = Object.entries(
        notifiedErrorsRef.current
      ).sort(([, a], [, b]) => a.date.getTime() - b.date.getTime());

      sortedNotifiedErrors.forEach(([, notifiedError]) => {
        if (notifiedError.error) errorMessage = notifiedError.error;
      });

      //api errors or explorer errors will trump any speciffic errors
      if (generate204API && apiReachable === false)
        errorMessage = t('netStatus.apiNotReachableWarning');

      if (generate204API2 && api2Reachable === false)
        errorMessage = t('netStatus.apiNotReachableWarning');

      if (explorer && explorerReachable === false)
        errorMessage = t('netStatus.blockchainExplorerNotReachableWarning');

      if (explorerMainnet && explorerMainnetReachable === false)
        errorMessage = t('netStatus.blockchainExplorerNotReachableWarning');

      //internet reachability error trump any other errors
      if (internetReachable === false && internetCheckRequested)
        errorMessage = t('netStatus.internetNotReachableWarning');

      return errorMessage;
    },
    [generate204API, generate204API2, explorer, explorerMainnet, t]
  );

  const updateNetStatus = useCallback(async () => {
    if (AppState.currentState !== 'active') return;
    clearExistingInterval();

    // Create an array of promises for the network reachability checks
    const checks = [
      generate204API ? checkNetworkReachability(generate204API) : undefined,
      generate204API2 ? checkNetworkReachability(generate204API2) : undefined,
      explorer ? explorer.isConnected() : undefined,
      explorerMainnet ? explorerMainnet.isConnected() : undefined,
      generate204APIExternal
        ? checkNetworkReachability(generate204APIExternal)
        : undefined
    ];
    // Run all the checks in parallel
    const [
      apiReachable,
      api2Reachable,
      explorerReachable,
      explorerMainnetReachable,
      apiExternalReachable
    ] = await Promise.all(checks);

    const { internetReachable, internetCheckRequested } =
      deriveInternetReachable({
        apiReachable,
        api2Reachable,
        explorerReachable,
        explorerMainnetReachable,
        apiExternalReachable
      });

    const errorMessage = deriveErrorMessage({
      apiReachable,
      api2Reachable,
      explorerReachable,
      explorerMainnetReachable,
      internetCheckRequested,
      internetReachable
    });

    if (errorMessage && errorMessageRef.current !== errorMessage) {
      toast.show(errorMessage, { type: 'warning' });
      errorMessageRef.current = errorMessage;
    }
    if (errorMessage === undefined && errorMessageRef.current) {
      toast.show(t('netStatus.connectionRestoredInfo'), { type: 'success' });
      errorMessageRef.current = undefined;
    }

    unstable_batchedUpdates(() => {
      setErrorMessage(errorMessage);
      setExplorerReachable(explorerReachable);
      setExplorerMainnetReachable(explorerMainnetReachable);
      setApiReachable(apiReachable);
      setApi2Reachable(api2Reachable);
      setApiExternalReachable(apiExternalReachable);
    });

    // Schedule the next check
    const nextCheckDelay = errorMessage
      ? RETRY_TIME_AFTER_FAIL
      : RETRY_TIME_AFTER_OK;
    checkInterval.current = setTimeout(updateNetStatus, nextCheckDelay);

    return {
      internetReachable,
      apiReachable,
      api2Reachable,
      explorerReachable,
      explorerMainnetReachable //For Tape fees
    };
  }, [
    deriveInternetReachable,
    deriveErrorMessage,
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

  const notifiedErrorsRef = useRef<
    Record<
      NotifiedErrorType,
      {
        error: string | false;
        date: Date;
      }
    >
  >({
    feeEstimates: { error: false, date: new Date() },
    btcFiat: { error: false, date: new Date() },
    tipStatus: { error: false, date: new Date() }
  });

  /**
   * Sets speciffic network errors externally. internet, api or explorer errors
   * will trump speciffic errors.
   *
   * Use this to notify permanent network errors. For example, if the fees are
   * badly retrieved (after retrying) then notify this, since the app won't be
   * able to operate correctly without those. Same for btc/USD rates, or tip status...
   *
   * Dont use this to notify spurious errors such as in pushing a tx that fails.
   * Use toastifyErrorAsync instead.
   *
   * At most only one notified error is set (the last one). This is because the
   * WalletHeader component will show at most one permanent error. Otherwise it
   * gets crowded.
   */
  const notifyNetErrorAsync = useCallback(
    async ({
      errorType,
      error
    }: {
      errorType: NotifiedErrorType;
      error: string | false;
    }) => {
      notifiedErrorsRef.current[errorType] = {
        error,
        date: new Date()
      };
      const { internetReachable, internetCheckRequested } =
        deriveInternetReachable({
          apiReachable,
          api2Reachable,
          explorerReachable,
          explorerMainnetReachable,
          apiExternalReachable
        });
      //TODO: now call deriveErrorMessage, deriveErrorMessage should takle into
      //account notifiedErrorsRef
      if (!error) {
        const errorMessage = deriveErrorMessage({
          apiReachable,
          api2Reachable,
          explorerReachable,
          explorerMainnetReachable,
          internetCheckRequested,
          internetReachable
        });

        if (errorMessage && errorMessageRef.current !== errorMessage) {
          toast.show(errorMessage, { type: 'warning' });
          errorMessageRef.current = errorMessage;
        }
        if (errorMessage === undefined && errorMessageRef.current) {
          toast.show(t('netStatus.connectionRestoredInfo'), {
            type: 'success'
          });
          errorMessageRef.current = undefined;
        }
        setErrorMessage(errorMessage);
      } else {
        await updateNetStatus();
      }
    },
    [
      t,
      toast,
      updateNetStatus,
      deriveErrorMessage,
      deriveInternetReachable,
      apiReachable,
      api2Reachable,
      explorerReachable,
      explorerMainnetReachable,
      apiExternalReachable
    ]
  );

  useEffect(() => {
    updateNetStatus(); // Initial check

    const appStateSubscription = AppState.addEventListener(
      'change',
      nextAppState => {
        if (nextAppState === 'active') {
          updateNetStatus();
        }
      }
    );

    return () => {
      appStateSubscription.remove();
      clearExistingInterval();
    };
  }, [updateNetStatus, clearExistingInterval]);

  const value = useMemo(
    () => ({
      errorMessage,
      notifyNetErrorAsync,
      internetReachable: deriveInternetReachable({
        apiReachable,
        api2Reachable,
        explorerReachable,
        explorerMainnetReachable,
        apiExternalReachable
      }).internetReachable,
      apiReachable,
      api2Reachable,
      explorerReachable,
      setExplorer,
      explorer,
      explorerMainnet,
      explorerMainnetReachable, //For Tape fees
      setExplorerMainnet, //Only set when needed: For Tape fees
      setGenerate204API,
      setGenerate204API2,
      setGenerate204APIExternal
    }),
    [
      explorer,
      explorerReachable,

      explorerMainnet,
      explorerMainnetReachable,

      errorMessage,

      notifyNetErrorAsync,

      apiReachable,
      api2Reachable,
      apiExternalReachable,
      deriveInternetReachable
    ]
  );

  return (
    <NetStatusContext.Provider value={value}>
      {children}
    </NetStatusContext.Provider>
  );
};

export default NetStatusProvider;
