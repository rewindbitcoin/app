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
 * It also connects / closes explorer instances. connect is done on the network
 * status check automatically and closed on reset.
 *
 * **Properties:**
 *
 * - `apiReachable`: Status of the main API. `true` if reachable, `false` if
 *   not, and `undefined` if unknown.
 * - `cBVaultsReaderAPIReachable`: Status of the secondary API. `true` if reachable, `false`
 *   if not, and `undefined` if unknown.
 * - `explorerReachable`: Status of the blockchain explorer. `true` if
 *   reachable, `false` if not, and `undefined` if unknown.
 * - `explorerMainnetReachable`: Status of the mainnet explorer for TAPE fees.
 *   `true` if reachable, `false` if not, and `undefined` if unknown.
 * - `internetReachable`: Overall internet status. `false` if all configured
 *   services are unreachable, `true` if at least one is reachable, and
 *   `undefined` if the status is unknown.
 * - `permanentErrorMessage`: The current error message, if any. This message is
 *    kept to a single one to avoid cluttering the UI. Prioritization is important:
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
 *
 * - `reset()`: Resets all network statuses and clears any error messages,
 *   restoring the hook to its initial state. It also disconnects all explorers.
 *
 * - `netRequest<T>(options: { id?: string, func: () => Promise<T>,
 *   requirements?: Requirements, errorMessage?: string }): Promise<T |
 *   undefined>`:
 *
 *    When not passing an `id`:
 *      - this function simply try-cathes the func and toasts the errorMessage
 *        passed if it throws.
 *      - It does not admit requirements and whenToastErrors must be 'ON_ANY_ERROR'.
 *        requirements are not admitted to simplify the usage of this "dumb mode".
 *
 *    When passing an `id` this function "has memory":
 *      - If required services are down it returns `result` undefined with
 *        status REQUIREMENTS_NOT_MET.
 *      - If required services are Up, netRequest try-cathes `func`.
 *        If it throws it will check if the required services are still Up and
 *        based on services Up/down and requirements it will compute and toast
 *        the permanentErrorMessage.
 *
 *    - Parameters:
 *        - `id`: Optional identifier for the operation, used to track
 *          "permanent" errors and prevent repeated notifications when using
 *          'ON_NEW_ERROR'.
 *          If id is not passed then the error is always notified and the
 *          permanentErrorMessage is not affected by this error.
 *        - `func`: The asynchronous function representing the network
 *          operation to perform.
 *        - `requirements`: An optional set of conditions that must be met
 *          before executing `func` (e.g., certain services must be reachable).
 *          This only applies when id is set.
 *        - `errorMessage`: Optional custom error message to display if `func`
 *          fails. If not passed, then the thrown Error message is used or
 *          t('app.unknownError') in this order.
 *
 *    - Returns the result of `func` if successful, result=undefined with
 *      Status: `ERROR` if an error occurs or status 'REQUIREMENTS_NOT_MET' if
 *      the Requirements are not met.
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
const EXPLORER_ATTEMPTS = 2;
const RETRY_TIME_AFTER_OK = 60 * 1000;
const RETRY_TIME_AFTER_FAIL = 20 * 1000;
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
import { AppState } from 'react-native';
import type { NetworkId } from '../lib/network';
import { batchedUpdates } from '~/common/lib/batchedUpdates';
import { useSettings } from '../hooks/useSettings';

type Requirements = {
  explorerReachable?: boolean;
  explorerMainnetReachable?: boolean;
  apiReachable?: boolean;
  cBVaultsReaderAPIReachable?: boolean;
  watchtowerAPIReachable?: boolean;
};
type NotifiedErrors = Record<
  string,
  {
    errorMessage: string | false;
    requirements?: Requirements;
    date: Date;
  }
>;

type InitParams = {
  explorer: Explorer | undefined;
  explorerMainnet: Explorer | undefined;
  generate204API: string | undefined;
  generate204CbVaultsReaderAPI: string | undefined;
  generate204WatchtowerAPI: string | undefined;
  generate204APIExternal: string | undefined;
  networkId: NetworkId | undefined;
};

export interface NetStatus {
  permanentErrorMessage: string | undefined;
  netRequest: <T>({
    id,
    func,
    requirements,
    whenToastErrors,
    errorMessage
  }: {
    id?: string;
    func: () => Promise<T>;
    requirements?: {
      explorerReachable?: boolean;
      explorerMainnetReachable?: boolean;
      apiReachable?: boolean;
      cBVaultsReaderAPIReachable?: boolean;
      watchtowerAPIReachable?: boolean;
    };
    whenToastErrors: 'ON_NEW_ERROR' | 'ON_ANY_ERROR';
    errorMessage?: string | ((message: string) => string);
  }) => Promise<{
    result: T | undefined;
    status: 'SUCCESS' | 'REQUIREMENTS_NOT_MET' | 'ERROR' | 'NEW_SESSION';
  }>;
  internetReachable: boolean | undefined;
  apiReachable: boolean | undefined;
  cBVaultsReaderAPIReachable: boolean | undefined;
  watchtowerAPIReachable: boolean | undefined;
  networkId: NetworkId | undefined;
  explorerReachable: boolean | undefined;
  explorerMainnetReachable: boolean | undefined;
  explorer: Explorer | undefined;
  explorerMainnet: Explorer | undefined;
  reset: () => void;
  init: (params: InitParams) => void;
  netToast: (success: boolean, message: string) => void;
  update: ({
    whenToastErrors
  }: {
    whenToastErrors: 'ON_NEW_ERROR' | 'ON_ANY_ERROR';
  }) => Promise<
    | undefined
    | {
        permanentErrorMessage: string | undefined;
        internetReachable: boolean | undefined;
        apiReachable: boolean | undefined;
        cBVaultsReaderAPIReachable: boolean | undefined;
        watchtowerAPIReachable: boolean | undefined;
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
  const [isInit, setIsInit] = useState<boolean>(false);
  const [generate204API, setGenerate204API] = useState<string | undefined>(
    undefined
  );
  const [generate204CbVaultsReaderAPI, setGenerate204CbVaultsReaderAPI] =
    useState<string | undefined>(undefined);
  const [generate204APIExternal, setGenerate204APIExternal] = useState<
    string | undefined
  >(undefined);
  const [generate204WatchtowerAPI, setGenerate204WatchtowerAPI] = useState<
    string | undefined
  >(undefined);
  const [networkId, setNetworkId] = useState<NetworkId | undefined>(undefined);
  const [explorer, setExplorer] = useState<Explorer | undefined>(undefined);
  const [explorerMainnet, setExplorerMainnet] = useState<Explorer | undefined>(
    undefined
  );

  const [permanentErrorMessage, setPermanentErrorMessage] = useState<
    string | undefined
  >(undefined);
  const permanentErrorMessageRef = useRef<string | undefined>(undefined);
  const updateTimeOut = useRef<NodeJS.Timeout | null>(null);
  /**
   * these are the current errors (and already notified)
   */
  const notifiedErrorsRef = useRef<NotifiedErrors>({});
  const [apiReachable, setApiReachable] = useState<boolean | undefined>();
  const [cBVaultsReaderAPIReachable, setCbVaultsReaderAPIReachable] = useState<
    boolean | undefined
  >();
  const [apiExternalReachable, setApiExternalReachable] = useState<
    boolean | undefined
  >();
  const [watchtowerAPIReachable, setWatchtowerAPIReachable] = useState<
    boolean | undefined
  >();
  const [explorerReachable, setExplorerReachable] = useState<
    boolean | undefined
  >();
  const [explorerMainnetReachable, setExplorerMainnetReachable] = useState<
    boolean | undefined
  >();

  const { settings } = useSettings();

  const networkTimeout = settings?.NETWORK_TIMEOUT;
  const checkNetworkReachability = useCallback(
    async (url: string) => {
      const session = sessionRef.current;
      let remainingAttempts = NET_ATTEMPTS;

      if (!networkTimeout)
        throw new Error('Settings not ready or NETWORK_TIMEOUT invalid');

      while (remainingAttempts > 0) {
        try {
          const response = await fetch(url, {
            signal: AbortSignal.timeout(networkTimeout)
          });
          if (session !== sessionRef.current) return false;
          if (response.status === 204) return true;
          await sleep(200);
          if (session !== sessionRef.current) return false;
          remainingAttempts--;
        } catch (error) {
          console.log(
            `Failed network reachability check for ${url}, with remaining attempts ${remainingAttempts - 1}: `,
            error
          );
          if (remainingAttempts <= 1) {
            return false;
          }
          await sleep(200);
          if (session !== sessionRef.current) return false;
          remainingAttempts--;
        }
      }
      return false; // All attempts failed
    },
    [networkTimeout]
  );

  const checkExplorerReachability = useCallback(
    async (explorer: Explorer, traceInfo?: string): Promise<boolean> => {
      const session = sessionRef.current;
      let remainingAttempts = EXPLORER_ATTEMPTS;

      while (remainingAttempts > 0) {
        try {
          const connected = await explorer.isConnected();
          if (session !== sessionRef.current) return false;

          if (connected) {
            //Esplora clients need to be initalized so that isClosed()
            //returns false even if they are always connected
            if (explorer.isClosed()) explorer.connect();
            return true;
          } else {
            if (!explorer.isClosed()) {
              explorer.close();
            }
            await explorer.connect();
            if (session !== sessionRef.current) return false;
            return true;
          }
        } catch (error) {
          console.log(
            `Failed explorer reachability check for ${traceInfo}, with remaining attempts ${remainingAttempts - 1}: `,
            error
          );
          if (remainingAttempts <= 1) {
            return false;
          }
          await sleep(200);
          if (session !== sessionRef.current) return false;
          remainingAttempts--;
        }
      }
      return false; // All attempts failed
    },
    []
  );

  //Closes automatically connections when resetting the components
  const prevExplorerRef = useRef<Explorer | undefined>();
  useEffect(() => {
    const prevExplorer = prevExplorerRef.current;
    const close = async () => {
      if (!explorer && prevExplorer)
        try {
          if (!prevExplorer.isClosed()) prevExplorer.close();
        } catch (err) {
          console.error('Error closing explorer:', err);
        }
    };
    close();
    prevExplorerRef.current = explorer;
  }, [explorer]);
  const prevExplorerMainnetRef = useRef<Explorer | undefined>();
  useEffect(() => {
    const prevExplorerMainnet = prevExplorerMainnetRef.current;
    const close = async () => {
      if (!explorerMainnet && prevExplorerMainnet)
        try {
          if (!prevExplorerMainnet.isClosed()) prevExplorerMainnet.close();
        } catch (err) {
          console.error('Error closing explorerMainnet:', err);
        }
    };
    close();
    prevExplorerMainnetRef.current = explorerMainnet;
  }, [explorerMainnet]);

  const clearUpdateTimeOut = useCallback(() => {
    if (updateTimeOut.current) {
      clearTimeout(updateTimeOut.current);
      updateTimeOut.current = null;
    }
  }, []);

  const sessionRef = useRef<number>(0);
  const reset = useCallback(() => {
    //Update the session number. If the session changes after a async operation
    //then, we don't care anymore about it.
    sessionRef.current++;
    clearUpdateTimeOut();
    toastQueueRef.current.forEach(q => {
      if (toast.isOpen(q.id)) toast.hide(q.id);
    });
    toastQueueRef.current = [];
    permanentErrorMessageRef.current = undefined;
    notifiedErrorsRef.current = {};
    batchedUpdates(() => {
      setGenerate204API(undefined);
      setGenerate204CbVaultsReaderAPI(undefined);
      setGenerate204WatchtowerAPI(undefined);
      setGenerate204APIExternal(undefined);
      setNetworkId(undefined);
      setExplorer(undefined);
      setExplorerMainnet(undefined);
      setPermanentErrorMessage(undefined);
      setApiReachable(undefined);
      setCbVaultsReaderAPIReachable(undefined);
      setWatchtowerAPIReachable(undefined);
      setExplorerReachable(undefined);
      setExplorerMainnetReachable(undefined);
      setIsInit(false);
    });
  }, [clearUpdateTimeOut, toast]);

  const deriveInternetReachable = useCallback(
    ({
      apiReachable,
      cBVaultsReaderAPIReachable,
      watchtowerAPIReachable,
      explorerReachable,
      explorerMainnetReachable,
      apiExternalReachable
    }: {
      apiReachable: boolean | undefined;
      cBVaultsReaderAPIReachable: boolean | undefined;
      watchtowerAPIReachable: boolean | undefined;
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
      if (generate204CbVaultsReaderAPI)
        internetChecks.push(cBVaultsReaderAPIReachable);
      if (generate204WatchtowerAPI) internetChecks.push(watchtowerAPIReachable);
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
      generate204CbVaultsReaderAPI,
      generate204WatchtowerAPI,
      generate204APIExternal,
      explorer,
      explorerMainnet
    ]
  );

  const toastQueueRef = useRef<Array<{ id: string; message: string }>>([]);
  /**
   * Manages toasts by displaying success messages or queuing error messages.
   * Closes all error messages on a success event.
   *
   * @param success Indicates whether the toast is for a success or error message.
   * @param message The message to display in the toast.
   */
  const isToastInCurrentFrameRef = useRef<boolean>(false);
  const netToast = useCallback(
    async (success: boolean, message: string) => {
      // If already called within the same execution context, wait for the
      // next animation frame. This prevents consecutive calls to netToast
      // within the same frame from showing duplicate toasts, as they will
      // wait until the next frame to execute.
      //
      // This approach is necessary because react-native-toast-notifications
      // only sets "open = true" after an animation frame. As a result,
      // isOpen was returning false if checked within the same frame
      // after a show():
      // https://github.com/arnnis/react-native-toast-notifications/blob/e0ed48e1098359d933c84c9c6dbaafe13810ea68/src/toast-container.tsx#L57
      while (isToastInCurrentFrameRef.current)
        await new Promise(requestAnimationFrame);
      isToastInCurrentFrameRef.current = true;
      // Reset the flag at the end of the current frame
      requestAnimationFrame(() => {
        isToastInCurrentFrameRef.current = false;
      });

      if (success) {
        toastQueueRef.current.forEach(q => {
          if (toast.isOpen(q.id)) toast.hide(q.id);
        });
        toastQueueRef.current = [];
        toast.show(message, { type: 'success' });
      } else {
        toastQueueRef.current.forEach(q => {
          if (toast.isOpen(q.id) && q.message === message) {
            toast.hide(q.id);
          }
        });
        const newToastId = toast.show(message, { type: 'warning' });
        toastQueueRef.current.push({ id: newToastId, message });
      }
    },
    [toast]
  );

  /**
   * computes and returns the new error message. It also keeps track of the last
   * computed one. It toasts the error if necessary and, if there was an error
   * previously and not now anymore, then it toasts a success message
   */
  const handleError = useCallback(
    ({
      whenToastErrors,
      notifiedErrors,
      apiReachable,
      cBVaultsReaderAPIReachable,
      watchtowerAPIReachable,
      explorerReachable,
      explorerMainnetReachable,
      apiExternalReachable
    }: {
      whenToastErrors: 'ON_ANY_ERROR' | 'ON_NEW_ERROR';
      notifiedErrors: NotifiedErrors;
      apiReachable: boolean | undefined;
      cBVaultsReaderAPIReachable: boolean | undefined;
      watchtowerAPIReachable: boolean | undefined;
      explorerReachable: boolean | undefined;
      explorerMainnetReachable: boolean | undefined;
      apiExternalReachable: boolean | undefined;
    }) => {
      const { internetReachable, internetCheckRequested } =
        deriveInternetReachable({
          apiReachable,
          cBVaultsReaderAPIReachable,
          watchtowerAPIReachable,
          explorerReachable,
          explorerMainnetReachable,
          apiExternalReachable
        });

      let permanentErrorMessage: string | undefined = undefined;

      //sorts notifierErrors from old to new. new notified errors trump
      //old ones
      const sortedNotifiedErrors = Object.entries(notifiedErrors).sort(
        ([, a], [, b]) => a.date.getTime() - b.date.getTime()
      );

      sortedNotifiedErrors.forEach(([, notifiedError]) => {
        if (notifiedError.errorMessage)
          permanentErrorMessage = notifiedError.errorMessage;
      });

      //api errors or explorer errors will trump any specific errors
      if (generate204API && apiReachable === false)
        permanentErrorMessage = t('netStatus.apiNotReachableWarning');

      if (generate204WatchtowerAPI && watchtowerAPIReachable === false)
        permanentErrorMessage = t('netStatus.watchtowerNotReachableWarning');

      if (generate204CbVaultsReaderAPI && cBVaultsReaderAPIReachable === false)
        permanentErrorMessage = t(
          'netStatus.communityBackupsdNotReachableWarning'
        );

      if (explorer && explorerReachable === false)
        permanentErrorMessage = t(
          'netStatus.blockchainExplorerNotReachableWarning'
        );

      if (explorerMainnet && explorerMainnetReachable === false)
        permanentErrorMessage = t(
          'netStatus.blockchainMainnetExplorerNotReachableWarning'
        );

      //internet reachability error trumps any other errors
      if (internetReachable === false && internetCheckRequested)
        permanentErrorMessage = t('netStatus.internetNotReachableWarning');

      if (
        permanentErrorMessage &&
        (whenToastErrors === 'ON_ANY_ERROR' ||
          permanentErrorMessageRef.current !== permanentErrorMessage)
      ) {
        netToast(false, permanentErrorMessage);
        permanentErrorMessageRef.current = permanentErrorMessage;
      }
      if (
        permanentErrorMessage === undefined &&
        permanentErrorMessageRef.current
      ) {
        netToast(true, t('netStatus.connectionRestoredInfo'));
        permanentErrorMessageRef.current = undefined;
      }
      return { internetReachable, permanentErrorMessage };
    },
    [
      explorer,
      explorerMainnet,
      generate204API,
      generate204CbVaultsReaderAPI,
      generate204WatchtowerAPI,
      deriveInternetReachable,
      t,
      netToast
    ]
  );

  const areRequiredServicesUp = useCallback(
    ({
      requirements,
      explorerReachable,
      explorerMainnetReachable,
      apiReachable,
      cBVaultsReaderAPIReachable,
      watchtowerAPIReachable
    }: {
      requirements: Requirements | undefined;
      explorerReachable: boolean | undefined;
      explorerMainnetReachable: boolean | undefined;
      apiReachable: boolean | undefined;
      cBVaultsReaderAPIReachable: boolean | undefined;
      watchtowerAPIReachable: boolean | undefined;
    }) => {
      return (
        ((requirements?.explorerReachable && explorerReachable) ||
          !requirements?.explorerReachable) &&
        ((requirements?.explorerMainnetReachable && explorerMainnetReachable) ||
          !requirements?.explorerMainnetReachable) &&
        ((requirements?.apiReachable && apiReachable) ||
          !requirements?.apiReachable) &&
        ((requirements?.cBVaultsReaderAPIReachable &&
          cBVaultsReaderAPIReachable) ||
          !requirements?.cBVaultsReaderAPIReachable) &&
        ((requirements?.watchtowerAPIReachable && watchtowerAPIReachable) ||
          !requirements?.watchtowerAPIReachable)
      );
    },
    []
  );

  const update = useCallback(
    async ({
      whenToastErrors
    }: {
      whenToastErrors: 'ON_NEW_ERROR' | 'ON_ANY_ERROR';
    }) => {
      if (!isInit) return; //update will be called on reset(). Ignore it.
      const session = sessionRef.current;
      clearUpdateTimeOut();
      if (AppState.currentState === 'background') {
        console.warn(
          'Device is in the background; postponing netStatus update'
        );
        //Don't perform updates when the device is not active, but Schedule
        //new ones until it is.
        updateTimeOut.current = setTimeout(
          () => update({ whenToastErrors: 'ON_NEW_ERROR' }),
          RETRY_TIME_AFTER_OK
        );
        return;
      }

      console.log(
        `[${new Date().toISOString()}] [NetStatus] Update for: ${
          [
            'generate204API',
            'generate204CbVaultsReaderAPI',
            'generate204WatchtowerAPI',
            'walletExplorer',
            'mainnetExplorer',
            'generate204APIExternal'
          ]
            .filter(
              (_service, index) =>
                [
                  generate204API,
                  generate204CbVaultsReaderAPI,
                  generate204WatchtowerAPI,
                  explorer,
                  explorerMainnet,
                  generate204APIExternal
                ][index]
            )
            .join(', ') || 'No services defined'
        }`
      );

      // Create an array of promises for the network reachability checks
      const checks = [
        generate204API ? checkNetworkReachability(generate204API) : undefined,
        generate204CbVaultsReaderAPI
          ? checkNetworkReachability(generate204CbVaultsReaderAPI)
          : undefined,
        generate204WatchtowerAPI
          ? checkNetworkReachability(generate204WatchtowerAPI)
          : undefined,
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
        cBVaultsReaderAPIReachable,
        watchtowerAPIReachable,
        explorerReachable,
        explorerMainnetReachable,
        apiExternalReachable
      ] = await Promise.all(checks);
      if (session !== sessionRef.current) {
        console.log('Stoping scheduled network checks after wallet change');
        if (updateTimeOut.current === null) {
          updateTimeOut.current = setTimeout(
            () => update({ whenToastErrors: 'ON_NEW_ERROR' }),
            RETRY_TIME_AFTER_OK
          );
        }
        return;
      }

      //Clear errors when the required services are NOT Up anymore
      //This is the way to indicate that, in fact, this speciff error is due
      //to a more generic error in one of its requirements
      for (const id of Object.keys(notifiedErrorsRef.current)) {
        const notifiedError = notifiedErrorsRef.current[id];
        if (!notifiedError) throw new Error('notifiedError should be defined');
        const requirements = notifiedError.requirements;
        if (
          !areRequiredServicesUp({
            requirements,
            explorerReachable,
            explorerMainnetReachable,
            apiReachable,
            cBVaultsReaderAPIReachable,
            watchtowerAPIReachable
          })
        )
          delete notifiedErrorsRef.current[id];
      }

      const { internetReachable, permanentErrorMessage } = handleError({
        whenToastErrors,
        notifiedErrors: notifiedErrorsRef.current,
        apiReachable,
        cBVaultsReaderAPIReachable,
        watchtowerAPIReachable,
        explorerReachable,
        explorerMainnetReachable,
        apiExternalReachable
      });

      batchedUpdates(() => {
        setPermanentErrorMessage(permanentErrorMessage);
        setExplorerReachable(explorerReachable);
        setExplorerMainnetReachable(explorerMainnetReachable);
        setApiReachable(apiReachable);
        setCbVaultsReaderAPIReachable(cBVaultsReaderAPIReachable);
        setWatchtowerAPIReachable(watchtowerAPIReachable);
        setApiExternalReachable(apiExternalReachable);
      });

      // Schedule the next check
      const nextCheckDelay = permanentErrorMessage
        ? RETRY_TIME_AFTER_FAIL
        : RETRY_TIME_AFTER_OK;
      if (updateTimeOut.current === null)
        updateTimeOut.current = setTimeout(
          () => update({ whenToastErrors: 'ON_NEW_ERROR' }),
          nextCheckDelay
        );

      return {
        permanentErrorMessage,
        internetReachable,
        apiReachable,
        cBVaultsReaderAPIReachable,
        watchtowerAPIReachable,
        explorerReachable,
        explorerMainnetReachable //For Tape fees
      };
    },
    [
      isInit,
      checkNetworkReachability,
      checkExplorerReachability,
      areRequiredServicesUp,
      handleError,
      generate204API,
      generate204CbVaultsReaderAPI,
      generate204WatchtowerAPI,
      generate204APIExternal,
      clearUpdateTimeOut,
      explorer,
      explorerMainnet
    ]
  );

  const netRequest = useCallback(
    async <T,>({
      id,
      func,
      requirements,
      whenToastErrors,
      errorMessage
    }: {
      /**
       * don't pass an id if you don't want this error to be permanent. permanent
       * errors are provided in the context as errorMessage and will be typically
       * shown in the Wallet Header in a prominent color in a permanent manner.
       */
      id?: string;
      func: () => Promise<T>;
      /**
       * which services are pre-required.
       * Only run func if the requirements are met.
       * Also, only notify specific errors if the
       * required services are up and running.
       */
      requirements?: {
        explorerReachable?: boolean;
        explorerMainnetReachable?: boolean;
        apiReachable?: boolean;
        cBVaultsReaderAPIReachable?: boolean;
        watchtowerAPIReachable?: boolean;
      };
      whenToastErrors: 'ON_NEW_ERROR' | 'ON_ANY_ERROR';
      errorMessage?: string | ((message: string) => string);
    }): Promise<{
      result: T | undefined;
      status: 'SUCCESS' | 'REQUIREMENTS_NOT_MET' | 'ERROR' | 'NEW_SESSION';
    }> => {
      if (whenToastErrors === 'ON_NEW_ERROR' && id === undefined)
        throw new Error(
          'When not setting an id, then toasts should be shown on any error'
        );
      if (requirements && id === undefined)
        throw new Error("Don't pass requirements if not passing id");
      if (!errorMessage)
        console.warn(
          'Passing a translated, human readable error message is recommended'
        );
      const session = sessionRef.current;
      if (
        areRequiredServicesUp({
          requirements,
          explorerReachable,
          explorerMainnetReachable,
          apiReachable,
          cBVaultsReaderAPIReachable,
          watchtowerAPIReachable
        })
      ) {
        try {
          const result = await func();
          if (session !== sessionRef.current) {
            return { result: undefined, status: 'NEW_SESSION' };
          }
          if (id && notifiedErrorsRef.current[id]) {
            //If there was an error related to this id, then clear it since
            //func was succesful, and handle the change:
            delete notifiedErrorsRef.current[id];
            const { permanentErrorMessage } = handleError({
              whenToastErrors,
              notifiedErrors: notifiedErrorsRef.current,
              apiReachable,
              cBVaultsReaderAPIReachable,
              watchtowerAPIReachable,
              explorerReachable,
              explorerMainnetReachable,
              apiExternalReachable
            });
            setPermanentErrorMessage(permanentErrorMessage);
          }
          return { result, status: 'SUCCESS' };
        } catch (error) {
          //We don't care about errors of other sessions (probably trying to
          //do a network op on an expired session)
          if (session !== sessionRef.current) {
            return { result: undefined, status: 'NEW_SESSION' };
          }
          const message =
            (error instanceof Error && error.message) || t('app.unknownError');
          const finalErrorMessage: string =
            (typeof errorMessage === 'function'
              ? errorMessage(message)
              : errorMessage) || message;
          console.warn('netRequest failed:', error, {
            id,
            finalErrorMessage,
            requirements
          });

          if (id) {
            const notifiedError = notifiedErrorsRef.current[id];
            if (notifiedError?.errorMessage !== finalErrorMessage) {
              notifiedErrorsRef.current[id] = {
                ...(requirements ? { requirements } : {}),
                errorMessage: finalErrorMessage,
                date: new Date()
              };

              //The error will be "toasted" in update. It will be displayed as
              //  - if, after net checks, required services are up:
              //  toast the specific errorMessage.
              //  - if, after net checks, required services are NOT up:
              //  toast a more generic net error.
              await update({ whenToastErrors });
              if (session !== sessionRef.current) {
                return { result: undefined, status: 'NEW_SESSION' };
              }
            }
          } else {
            netToast(false, finalErrorMessage);

            ////An error may be "toasted" im update.
            //const servicesStatus = await update({ whenToastErrors });
            //if (session !== sessionRef.current)
            //  return { result: undefined, status: 'NEW_SESSION' };

            //if (
            //  servicesStatus &&
            //  areRequiredServicesUp({ requirements, ...servicesStatus })
            //)
            //  //if udpate did not toast an error related to our requirements,
            //  //then we must toast it, since the function throwed
            //  netToast(false, errorMessage);
          }

          return { result: undefined, status: 'ERROR' };
        }
      } else return { result: undefined, status: 'REQUIREMENTS_NOT_MET' };
    },
    [
      handleError,
      areRequiredServicesUp,
      update,
      t,
      netToast,
      apiExternalReachable,
      apiReachable,
      cBVaultsReaderAPIReachable,
      watchtowerAPIReachable,
      explorerReachable,
      explorerMainnetReachable
    ]
  );

  useEffect(() => {
    update({ whenToastErrors: 'ON_NEW_ERROR' }); // Initial check

    let prevAppState = AppState.currentState; // Track the previous app state
    const appStateSubscription = AppState.addEventListener(
      'change',
      nextAppState => {
        // Note: iOS may briefly transition to 'inactive' during a Face ID
        // prompt. To prevent unnecessary updates, only trigger updates when
        // transitioning from 'background' to 'active'.
        if (prevAppState === 'background' && nextAppState === 'active') {
          console.log(
            'NetStatus: triggering an update after app restored from the background',
            `Previous: ${prevAppState}, Current: ${nextAppState}`
          );
          update({ whenToastErrors: 'ON_NEW_ERROR' });
        }
        prevAppState = nextAppState;
      }
    );
    return () => {
      appStateSubscription.remove();
      clearUpdateTimeOut();
    };
  }, [isInit, update, clearUpdateTimeOut]);

  const init = useCallback(
    ({
      explorer,
      explorerMainnet,
      generate204API,
      generate204CbVaultsReaderAPI,
      generate204WatchtowerAPI,
      generate204APIExternal,
      networkId
    }: InitParams) => {
      batchedUpdates(() => {
        setExplorer(explorer);
        setExplorerMainnet(explorerMainnet);
        setGenerate204API(generate204API);
        setGenerate204CbVaultsReaderAPI(generate204CbVaultsReaderAPI);
        setGenerate204WatchtowerAPI(generate204WatchtowerAPI);
        setGenerate204APIExternal(generate204APIExternal);
        setNetworkId(networkId);
        setIsInit(true);
      });
    },
    []
  );

  const value = useMemo(
    () => ({
      permanentErrorMessage,
      netRequest,
      internetReachable: deriveInternetReachable({
        apiReachable,
        cBVaultsReaderAPIReachable,
        watchtowerAPIReachable,
        explorerReachable,
        explorerMainnetReachable,
        apiExternalReachable
      }).internetReachable,
      apiReachable,
      cBVaultsReaderAPIReachable,
      watchtowerAPIReachable,
      explorerReachable,
      networkId,
      explorer,
      explorerMainnet,
      explorerMainnetReachable, //For Tape fees
      init,
      reset,
      update,
      netToast
    }),
    [
      netRequest,

      reset,
      init,
      update,
      netToast,
      networkId,

      explorer,
      explorerReachable,

      explorerMainnet,
      explorerMainnetReachable,

      permanentErrorMessage,

      apiReachable,
      cBVaultsReaderAPIReachable,
      watchtowerAPIReachable,
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
