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

const NET_ATTEMPTS = 2;
const EXPLORER_ATTEMPTS = 1;
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const checkNetworkReachability = async (url: string) => {
  let attempts = NET_ATTEMPTS;

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
};
const checkExplorerReachability = async (explorer: Explorer) => {
  let attempts = EXPLORER_ATTEMPTS;

  while (attempts > 0) {
    try {
      const connected = await explorer.isConnected();
      if (connected) return true;
      else await explorer.connect();
      if (attempts !== EXPLORER_ATTEMPTS) await sleep(200);
      attempts--;
    } catch (error) {
      if (attempts <= 1) return false;
      await sleep(200);
      attempts--;
    }
  }
  return false; // All attempts failed
};

const RETRY_TIME_AFTER_OK = 60 * 1000;
const RETRY_TIME_AFTER_FAIL = 20 * 1000;

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
import type { NetworkId } from '../lib/network';
const unstable_batchedUpdates = Platform.select({
  web: (cb: () => void) => {
    cb();
  },
  default: RN_unstable_batchedUpdates
});

type NotifiedErrorType = 'feeEstimates' | 'btcFiat' | 'tipStatus';
type NotifiedErrors = Record<
  NotifiedErrorType,
  {
    error: string | false;
    date: Date;
  }
>;
const notifiedErrorsInit: NotifiedErrors = {
  feeEstimates: { error: false, date: new Date() },
  btcFiat: { error: false, date: new Date() },
  tipStatus: { error: false, date: new Date() }
};

type InitParams = {
  explorer: Explorer | undefined;
  explorerMainnet: Explorer | undefined;
  generate204API: string | undefined;
  generate204API2: string | undefined;
  generate204APIExternal: string | undefined;
  networkId: NetworkId | undefined;
};

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
  networkId: NetworkId | undefined;
  explorerReachable: boolean | undefined;
  explorerMainnetReachable: boolean | undefined;
  explorer: Explorer | undefined;
  explorerMainnet: Explorer | undefined;
  reset: () => void;
  init: (params: InitParams) => void;
  update: () => Promise<
    | undefined
    | {
        errorMessage: string | undefined;
        internetReachable: boolean | undefined;
        apiReachable: boolean | undefined;
        api2Reachable: boolean | undefined;
        explorerReachable: boolean | undefined;
        explorerMainnetReachable: boolean | undefined;
      }
  >;
}

export const NetStatusContext = createContext<NetStatus | undefined>(undefined);

interface NetStatusProviderProps {
  children: React.ReactNode;
}

const NetStatusProvider: React.FC<NetStatusProviderProps> = ({ children }) => {
  const isUpdating = useRef<boolean>(false);
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
  const [networkId, setNetworkId] = useState<NetworkId | undefined>(undefined);
  const [explorer, setExplorer] = useState<Explorer | undefined>(undefined);
  const [explorerMainnet, setExplorerMainnet] = useState<Explorer | undefined>(
    undefined
  );

  const [errorMessage, setErrorMessage] = useState<string | undefined>(
    undefined
  );
  const errorMessageRef = useRef<string | undefined>(undefined);
  const checkIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const notifiedErrorsRef = useRef<NotifiedErrors>(notifiedErrorsInit);
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

  const clearExistingInterval = useCallback(() => {
    if (checkIntervalRef.current) {
      clearTimeout(checkIntervalRef.current);
      checkIntervalRef.current = null;
    }
  }, []);
  const reset = useCallback(() => {
    clearExistingInterval();
    errorMessageRef.current = undefined;
    notifiedErrorsRef.current = notifiedErrorsInit;
    setGenerate204API(undefined);
    setGenerate204API2(undefined);
    setGenerate204APIExternal(undefined);
    setNetworkId(undefined);
    setExplorer(undefined);
    setExplorerMainnet(undefined);
    setErrorMessage(undefined);
    setApiReachable(undefined);
    setApi2Reachable(undefined);
    setExplorerReachable(undefined);
    setExplorerMainnetReachable(undefined);
  }, [clearExistingInterval]);

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
      // Determines if the internet is reachable by checking multiple variables.
      // - If at least one of the variables is true, internetReachable will be true.
      // - If all variables are false, internetReachable will be false.
      // - If there is a mix of false and undefined, or if all are undefined, internetReachable will be undefined.

      const internetChecks = [];
      if (generate204API) internetChecks.push(apiReachable);
      if (generate204API2) internetChecks.push(api2Reachable);
      if (explorer) internetChecks.push(explorerReachable);
      if (explorerMainnet) internetChecks.push(explorerMainnetReachable);
      if (generate204APIExternal) internetChecks.push(apiExternalReachable);

      const internetReachable = internetChecks.includes(true)
        ? true
        : internetChecks.every(val => val === false)
          ? false
          : undefined;
      const internetCheckRequested = !!internetChecks.length;
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
        errorMessage = t(
          'netStatus.blockchainMainnetExplorerNotReachableWarning'
        );

      //internet reachability error trump any other errors
      if (internetReachable === false && internetCheckRequested)
        errorMessage = t('netStatus.internetNotReachableWarning');

      return errorMessage;
    },
    [generate204API, generate204API2, explorer, explorerMainnet, t]
  );

  const update = useCallback(async () => {
    if (AppState.currentState !== 'active') return;
    clearExistingInterval();

    // Create an array of promises for the network reachability checks
    const checks = [
      generate204API ? checkNetworkReachability(generate204API) : undefined,
      generate204API2 ? checkNetworkReachability(generate204API2) : undefined,
      explorer ? checkExplorerReachability(explorer) : undefined,
      explorerMainnet ? checkExplorerReachability(explorerMainnet) : undefined,
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
    if (checkIntervalRef.current === null)
      checkIntervalRef.current = setTimeout(update, nextCheckDelay);

    return {
      errorMessage,
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
    clearExistingInterval,
    explorer,
    explorerMainnet
  ]);

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
      if (notifiedErrorsRef.current[errorType].error !== error) {
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
        if (error === false) {
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
          await update();
        }
      }
    },
    [
      t,
      toast,
      update,
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
    update(); // Initial check

    const appStateSubscription = AppState.addEventListener(
      'change',
      nextAppState => {
        if (nextAppState === 'active') {
          update();
        }
      }
    );
    return () => {
      appStateSubscription.remove();
      clearExistingInterval();
    };
  }, [update, clearExistingInterval]);

  const init = useCallback(
    async ({
      explorer,
      explorerMainnet,
      generate204API,
      generate204API2,
      generate204APIExternal,
      networkId
    }: InitParams) => {
      setExplorer(explorer);
      setExplorerMainnet(explorerMainnet);
      setGenerate204API(generate204API);
      setGenerate204API2(generate204API2);
      setGenerate204APIExternal(generate204APIExternal);
      setNetworkId(networkId);
    },
    []
  );

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
      networkId,
      explorer,
      explorerMainnet,
      explorerMainnetReachable, //For Tape fees
      init,
      reset,
      update
    }),
    [
      reset,
      init,
      update,
      networkId,

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
