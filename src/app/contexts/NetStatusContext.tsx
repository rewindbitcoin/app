/**
 * Hook: `useNetStatus`
 *
 * **Usage:**
 *
 * ```typescript
 * const netStatus = useNetStatus();
 * ```
 *
 * `netStatus` provides network statuses and methods for network operations.
 *
 * **Properties:**
 *
 * - `apiReachable`: Status of the main API. `true` if reachable, `false` if
 *   not, and `undefined` if unknown.
 * - `api2Reachable`: Status of the secondary API. `true` if reachable, `false`
 *   if not, and `undefined` if unknown.
 * - `explorerReachable`: Status of the blockchain explorer. `true` if
 *   reachable, `false` if not, and `undefined` if unknown.
 * - `explorerMainnetReachable`: Status of the mainnet explorer for TAPE fees.
 *   `true` if reachable, `false` if not, and `undefined` if unknown.
 * - `internetReachable`: Overall internet status. `false` if all configured
 *   services are unreachable, `true` if at least one is reachable, and
 *   `undefined` if the status is unknown.
 * - `errorMessage`: The current error message, if any. This message is kept to
 *   a single one to avoid cluttering the UI. Prioritization is important:
 *   - More general errors (e.g., "Internet not reachable") are shown first.
 *   - Specific errors (e.g., "Explorer not reachable") are shown only if more
 *     general errors are not present.
 *   - A specific error passed with an `id` in `netRequest` is only shown if
 *     the requirement is met (e.g., the explorer is reachable, and the
 *     internet is reachable). This ensures that the most prominent error is
 *     the one displayed, even if multiple errors occur simultaneously.
 *
 * **Methods:**
 *
 * - `init(params: InitParams)`: Initializes the network status with the given
 *   configuration parameters.
 * - `reset()`: Resets all network statuses and clears any error messages,
 *   restoring the hook to its initial state.
 * - `netRequest<T>(options: { id?: string, func: () => Promise<T>,
 *   requirements?: Requirements, errorMessage?: string }): Promise<T |
 *   undefined>`:
 *    - Executes a network operation (`func`), handling errors automatically
 *      based on the provided requirements.
 *    - A toast with an error message is ALWAYS displayed if the func throws.
 *    - A toast with a success message is ALWAYS displayed when
 *      internetReachable turns false to true.
 *    - A toast is NOT shown if requirements are not met.
 *    - A toast is NOT shown if id is passed and the same errorMessage would be
 *      returned.
 *    - Parameters:
 *        - `id`: Optional identifier for the operation, used to track
 *          "permanent" errors and prevent repeated notifications.
 *          If id is not passed then the error is always notified and the
 *          errorMessage returned is not affected by this error.
 *        - `func`: The asynchronous function representing the network
 *          operation to perform.
 *        - `requirements`: An optional set of conditions that must be met
 *          before executing `func` (e.g., certain services must be reachable).
 *        - `errorMessage`: Optional custom error message to display if `func`
 *          fails. If not passed, then the thrown Error message is used or
 *          t('app.unknownError') in this order.
 *    - Returns the result of `func` if successful, or `undefined` if an error
 *      occurs or if the requirements are not met.
 *
 * **Behavior:**
 *
 * - Services are checked every minute. If a service fails, checks occur every
 *   20 seconds until restored.
 * - When a netRequest fails, services are checked immediatelly to discard a
 *   more general error.
 * - Errors are logged and can be accessed via `errorMessage`. If a service's
 *   status changes, the error message is updated based on prioritization.
 * - Network operations (`netRequest`) can be configured to execute only if
 *   specific services are reachable, and errors can be managed to avoid
 *   redundant notifications.
 *
 * **Typical Usage:**
 *
 * 1. Initialize the network status using `init` with the required configuration.
 * 2. Perform network operations using `netRequest`, which handles errors and
 *    conditions automatically.
 * 3. Monitor the `internetReachable` status to ensure connectivity across
 *    required services.
 */

const NET_ATTEMPTS = 2;
const EXPLORER_ATTEMPTS = 1;
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const checkNetworkReachability = async (url: string) => {
  let attempts = NET_ATTEMPTS;

  while (attempts > 0) {
    try {
      console.log('TRACE checkNetworkReachability (204) isConnected', { url });
      const response = await fetch(url);
      console.log('TRACE checkNetworkReachability (204) isConnected DONE', {
        url,
        status: response.status
      });
      if (response.status === 204) return true;
      await sleep(200);
      attempts--;
    } catch (error) {
      if (attempts <= 1) {
        console.warn(error);
        return false;
      }
      await sleep(200);
      attempts--;
    }
  }
  return false; // All attempts failed
};
const checkExplorerReachability = async (
  explorer: Explorer,
  traceInfo?: string
) => {
  let attempts = EXPLORER_ATTEMPTS;

  while (attempts > 0) {
    try {
      console.log('TRACE checkExplorerReachability isConnected', { traceInfo });
      const connected = await explorer.isConnected();
      console.log('TRACE checkExplorerReachability isConnected DONE', {
        traceInfo,
        connected
      });

      if (connected) return true;
      else {
        const startTime = new Date().getTime(); // Capture the start time
        console.log(
          'TRACE checkExplorerReachability connect (was not connected)',
          { traceInfo }
        );

        await explorer.connect();

        const connectEndTime = new Date().getTime(); // Time after connect attempt
        console.log(
          `TRACE checkExplorerReachability connect DONE (took ${connectEndTime - startTime}ms)`,
          { traceInfo }
        );

        console.log(
          'TRACE checkExplorerReachability isConnected after correct connect',
          { traceInfo }
        );

        const connected = await explorer.isConnected();

        const checkEndTime = new Date().getTime(); // Time after isConnected check
        console.log(
          `TRACE checkExplorerReachability isConnected after correct connect DONE (took ${checkEndTime - connectEndTime}ms)`,
          { traceInfo }
        );

        if (connected) return true;
      }
      if (attempts !== EXPLORER_ATTEMPTS) await sleep(200);
      attempts--;
    } catch (error) {
      if (attempts <= 1) {
        console.warn(error);
        return false;
      }
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
import { AppState } from 'react-native';
import type { NetworkId } from '../lib/network';
import { batchedUpdates } from '~/common/lib/batchedUpdates';

type NotifiedErrors = Record<
  string,
  {
    errorMessage: string | false;
    requirements?: {
      explorerReachable?: boolean;
      explorerMainnetReachable?: boolean;
      apiReachable?: boolean;
      api2Reachable?: boolean;
    };
    date: Date;
  }
>;

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
  netRequest: <T>({
    id,
    func,
    requirements,
    errorMessage
  }: {
    id?: string;
    func: () => Promise<T>;
    requirements?: {
      explorerReachable?: boolean;
      explorerMainnetReachable?: boolean;
      apiReachable?: boolean;
      api2Reachable?: boolean;
    };
    errorMessage?: string;
  }) => Promise<{
    result: T | undefined;
    status: 'SUCCESS' | 'REQUIREMENTS_NOT_MET' | 'ERROR';
  }>;
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
  const updateTimeOut = useRef<NodeJS.Timeout | null>(null);
  /**
   * these are the current errors (and already notified)
   */
  const notifiedErrorsRef = useRef<NotifiedErrors>({});
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

  const clearUpdateTimeOut = useCallback(() => {
    if (updateTimeOut.current) {
      clearTimeout(updateTimeOut.current);
      updateTimeOut.current = null;
    }
  }, []);
  const reset = useCallback(() => {
    clearUpdateTimeOut();
    errorMessageRef.current = undefined;
    notifiedErrorsRef.current = {};
    batchedUpdates(() => {
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
    });
  }, [clearUpdateTimeOut]);

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

  const toastQueueRef = useRef<Array<string>>([]);
  /**
   * Manages toasts by displaying success messages or queuing error messages.
   * Closes all error messages on a success event.
   *
   * @param success Indicates whether the toast is for a success or error message.
   * @param message The message to display in the toast.
   */
  const managedToast = useCallback(
    (success: boolean, message: string) => {
      if (success) {
        toastQueueRef.current.forEach(id => {
          if (toast.isOpen(id)) toast.hide(id);
        });
        toastQueueRef.current = [];
        toast.show(message, { type: 'success' });
      } else {
        const newToastId = toast.show(message, { type: 'warning' });
        toastQueueRef.current.push(newToastId);
      }
    },
    [toast]
  );

  /**
   * computes and returns the new error message. It also keeps track of the last
   * computed one. If there was an error previously and not now anymore, then it
   * toasts a success message
   */
  const handleError = useCallback(
    ({
      notifiedErrors,
      apiReachable,
      api2Reachable,
      explorerReachable,
      explorerMainnetReachable,
      apiExternalReachable
    }: {
      notifiedErrors: NotifiedErrors;
      apiReachable: boolean | undefined;
      api2Reachable: boolean | undefined;
      explorerReachable: boolean | undefined;
      explorerMainnetReachable: boolean | undefined;
      apiExternalReachable: boolean | undefined;
    }) => {
      const { internetReachable, internetCheckRequested } =
        deriveInternetReachable({
          apiReachable,
          api2Reachable,
          explorerReachable,
          explorerMainnetReachable,
          apiExternalReachable
        });

      let errorMessage: string | undefined = undefined;

      //sorts notifierErrors from old to new. new notified errors trump
      //old ones
      const sortedNotifiedErrors = Object.entries(notifiedErrors).sort(
        ([, a], [, b]) => a.date.getTime() - b.date.getTime()
      );

      sortedNotifiedErrors.forEach(([, notifiedError]) => {
        if (notifiedError.errorMessage)
          errorMessage = notifiedError.errorMessage;
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

      //internet reachability error trumps any other errors
      if (internetReachable === false && internetCheckRequested)
        errorMessage = t('netStatus.internetNotReachableWarning');

      if (errorMessage && errorMessageRef.current !== errorMessage) {
        managedToast(false, errorMessage);
        errorMessageRef.current = errorMessage;
      }
      if (errorMessage === undefined && errorMessageRef.current) {
        managedToast(true, t('netStatus.connectionRestoredInfo'));
        errorMessageRef.current = undefined;
      }
      return { internetReachable, errorMessage };
    },
    [
      explorer,
      explorerMainnet,
      generate204API,
      generate204API2,
      deriveInternetReachable,
      t,
      managedToast
    ]
  );

  const update = useCallback(async () => {
    clearUpdateTimeOut();
    if (AppState.currentState !== 'active') {
      console.warn('Device is not active; postponing netStatus update');
      //Don't perform updates when the device is not active, but Schedule
      //new ones until it is.
      updateTimeOut.current = setTimeout(update, RETRY_TIME_AFTER_OK);
      return;
    }

    // Create an array of promises for the network reachability checks
    const checks = [
      generate204API ? checkNetworkReachability(generate204API) : undefined,
      generate204API2 ? checkNetworkReachability(generate204API2) : undefined,
      explorer
        ? checkExplorerReachability(explorer, 'walletExplorer')
        : undefined,
      explorerMainnet
        ? checkExplorerReachability(explorerMainnet, 'mainnetExplorer')
        : undefined,
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

    //Clear errors when the requirement is not met anymore
    for (const id of Object.keys(notifiedErrorsRef.current)) {
      const notifiedError = notifiedErrorsRef.current[id];
      if (!notifiedError) throw new Error('notifiedError should be defined');
      const requirements = notifiedError.requirements;
      if (
        (requirements?.explorerReachable && !explorerReachable) ||
        (requirements?.explorerMainnetReachable && !explorerMainnetReachable) ||
        (requirements?.apiReachable && !apiReachable) ||
        (requirements?.api2Reachable && !api2Reachable)
      ) {
        delete notifiedErrorsRef.current[id];
      }
    }

    const { internetReachable, errorMessage } = handleError({
      notifiedErrors: notifiedErrorsRef.current,
      apiReachable,
      api2Reachable,
      explorerReachable,
      explorerMainnetReachable,
      apiExternalReachable
    });

    batchedUpdates(() => {
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
    if (updateTimeOut.current === null)
      updateTimeOut.current = setTimeout(update, nextCheckDelay);

    return {
      errorMessage,
      internetReachable,
      apiReachable,
      api2Reachable,
      explorerReachable,
      explorerMainnetReachable //For Tape fees
    };
  }, [
    handleError,
    generate204API,
    generate204API2,
    generate204APIExternal,
    clearUpdateTimeOut,
    explorer,
    explorerMainnet
  ]);

  const netRequest = useCallback(
    async <T,>({
      id,
      func,
      requirements,
      errorMessage
    }: {
      /**
       * don't pass an id if you don't want this error to be permanent. permanent
       * errors are provided in the context as errorMessage and will be typically
       * shown in the Wallet Header in a prominent color in a permanent manner.
       *
       * when an "id" is passed then the error is only notified once
       */
      id?: string;
      func: () => Promise<T>;
      /**
       * which services are pre-required.
       * Only run func if the requirements are met.
       * Also, only notify speciffic errors if the
       * required services are up and running.
       */
      requirements?: {
        explorerReachable?: boolean;
        explorerMainnetReachable?: boolean;
        apiReachable?: boolean;
        api2Reachable?: boolean;
      };
      errorMessage?: string;
    }): Promise<{
      result: T | undefined;
      status: 'SUCCESS' | 'REQUIREMENTS_NOT_MET' | 'ERROR';
    }> => {
      if (
        ((requirements?.explorerReachable && explorerReachable) ||
          !requirements?.explorerReachable) &&
        ((requirements?.explorerMainnetReachable && explorerMainnetReachable) ||
          !requirements?.explorerMainnetReachable) &&
        ((requirements?.apiReachable && apiReachable) ||
          !requirements?.apiReachable) &&
        ((requirements?.api2Reachable && api2Reachable) ||
          !requirements?.api2Reachable)
      ) {
        try {
          const result = await func();
          if (id && notifiedErrorsRef.current[id]) {
            //If there was an error related to this id, then clear it
            //and handle the change:
            delete notifiedErrorsRef.current[id];
            const { errorMessage } = handleError({
              notifiedErrors: notifiedErrorsRef.current,
              apiReachable,
              api2Reachable,
              explorerReachable,
              explorerMainnetReachable,
              apiExternalReachable
            });
            setErrorMessage(errorMessage);
          }
          return { result, status: 'SUCCESS' };
        } catch (error) {
          errorMessage =
            errorMessage ||
            (error instanceof Error && error.message) ||
            t('app.unknownError');

          if (id) {
            const notifiedError = notifiedErrorsRef.current[id];
            if (notifiedError?.errorMessage !== errorMessage) {
              notifiedErrorsRef.current[id] = {
                ...(requirements ? { requirements } : {}),
                errorMessage,
                date: new Date()
              };
              //The error will be "toasted" in update
              //don't return the 'ERROR' without awaiting the update to avoid a
              //strange situation in which the function is reported as failure
              //but we don't see the error notification for a while.
              await update();
            }
          } else managedToast(false, errorMessage);

          return { result: undefined, status: 'ERROR' };
        }
      } else return { result: undefined, status: 'REQUIREMENTS_NOT_MET' };
    },
    [
      handleError,
      update,
      t,
      managedToast,
      apiExternalReachable,
      apiReachable,
      api2Reachable,
      explorerReachable,
      explorerMainnetReachable
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
      clearUpdateTimeOut();
    };
  }, [update, clearUpdateTimeOut]);

  const init = useCallback(
    ({
      explorer,
      explorerMainnet,
      generate204API,
      generate204API2,
      generate204APIExternal,
      networkId
    }: InitParams) => {
      batchedUpdates(() => {
        setExplorer(explorer);
        setExplorerMainnet(explorerMainnet);
        setGenerate204API(generate204API);
        setGenerate204API2(generate204API2);
        setGenerate204APIExternal(generate204APIExternal);
        setNetworkId(networkId);
      });
    },
    []
  );

  const value = useMemo(
    () => ({
      errorMessage,
      netRequest,
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
      netRequest,

      reset,
      init,
      update,
      networkId,

      explorer,
      explorerReachable,

      explorerMainnet,
      explorerMainnetReachable,

      errorMessage,

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
