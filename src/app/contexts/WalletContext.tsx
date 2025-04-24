import {
  fetchVaultsStatuses,
  getUtxosData,
  type Vault,
  type Vaults,
  type VaultStatus,
  type VaultsStatuses,
  type UtxosData,
  getHotDescriptors,
  areVaultsSynched,
  HistoryData,
  getHistoryData,
  TxHex
} from '../lib/vaults';
import { useNavigation } from '@react-navigation/native';
import { WALLETS, type NavigationPropsByScreenId } from '../screens';
import * as Notifications from 'expo-notifications';
import { getExpoPushToken, watchVaults } from '../lib/watchtower';
import {
  walletTitle,
  type Accounts,
  type Signers,
  type Wallets
} from '../lib/wallets';
import { electrumParams, getAPIs } from '../lib/walletDerivedData';
import { networkMapping, NetworkId } from '../lib/network';
import {
  createUnvaultKey,
  getDefaultAccount,
  getMainAccount,
  getMasterNode
} from '../lib/vaultDescriptors';
import React, {
  createContext,
  type Context,
  ReactNode,
  useEffect,
  useState,
  useCallback,
  useRef
} from 'react';
import { shallowEqualObjects } from 'shallow-equal';
import type { Wallet } from '../lib/wallets';
import { SERIALIZABLE, deleteAsync } from '../../common/lib/storage';
import { useTranslation } from 'react-i18next';

import {
  DiscoveryFactory,
  type DiscoveryInstance,
  type TxAttribution
} from '@bitcoinerlab/discovery';
import type { FeeEstimates } from '../lib/fees';
import { Platform } from 'react-native';
import { batchedUpdates } from '../../common/lib/batchedUpdates';
import { fetchP2PVaults, getDataCipherKey } from '../lib/backup';

type DiscoveryExport = ReturnType<DiscoveryInstance['export']>;

import {
  WalletStatus,
  getStorageAccessStatus,
  getIsCorrupted
} from '../lib/status';

import { useStorage } from '../../common/hooks/useStorage';
import { useSecureStorageInfo } from '../../common/contexts/SecureStorageInfoContext';
import { useSettings } from '../hooks/useSettings';
import { useBtcFiat } from '../hooks/useBtcFiat';
import { useNetStatus } from '../hooks/useNetStatus';
import { useTipStatus } from '../hooks/useTipStatus';
import { useFeeEstimates } from '../hooks/useFeeEstimates';
import { useWalletState } from '../hooks/useWalletState';
import {
  Explorer,
  EsploraExplorer,
  ElectrumExplorer
} from '@bitcoinerlab/explorer';
import type { BlockStatus } from '@bitcoinerlab/explorer';
import { defaultSettings } from '../lib/settings';
import { getLocales } from 'expo-localization';

export const WalletContext: Context<WalletContextType | null> =
  createContext<WalletContextType | null>(null);

type TxHistory = Array<{
  txHex: TxHex;
  blockHeight: number;
  irreversible: boolean;
}>;

export type WalletContextType = {
  getNextChangeDescriptorWithIndex: (accounts: Accounts) => Promise<{
    descriptor: string;
    index: number;
  }>;
  getNextReceiveDescriptorWithIndex: (accounts: Accounts) => Promise<{
    descriptor: string;
    index: number;
  }>;
  fetchServiceAddress: () => Promise<string>;
  getUnvaultKey: () => Promise<string>;
  updateVaultStatus: (vaultId: string, vaultStatus: VaultStatus) => void;
  btcFiat: number | undefined;
  feeEstimates: FeeEstimates | undefined;
  tipStatus: BlockStatus | undefined;
  utxosData: UtxosData | undefined;
  historyData: HistoryData | undefined;
  signersStorageEngineMismatch: boolean;
  signers: Signers | undefined;
  accounts: Accounts | undefined;
  vaults: Vaults | undefined;
  vaultsStatuses: VaultsStatuses | undefined;
  networkId: NetworkId | undefined;
  fetchBlockTime: (blockHeight: number) => Promise<number | undefined>;
  pushTx: (txHex: string) => Promise<void>;
  syncWatchtowerRegistration: () => Promise<void>;
  fetchOutputHistory: ({
    descriptor,
    index
  }: {
    descriptor: string;
    index?: number;
  }) => Promise<TxHistory | undefined>;
  pushVaultRegisterWTAndUpdateStates: (vault: Vault) => Promise<void>;
  txPushAndUpdateStates: (txHex: string) => Promise<void>;
  syncBlockchain: () => void;
  syncingBlockchain: boolean;
  cBVaultsWriterAPI: string | undefined;
  faucetAPI: string | undefined;
  faucetURL: string | undefined;
  cBVaultsReaderAPI: string | undefined;
  blockExplorerURL: string | undefined;
  watchtowerAPI: string | undefined;
  wallets: Wallets | undefined;
  wallet: Wallet | undefined;
  walletStatus: WalletStatus;
  /** Whether the wallet needs to ask for a password and set it to retrieve
   * the signers */
  requiresPassword: boolean;
  logOut: () => Promise<void>;
  deleteWallet: (walletId: number) => Promise<void>;
  onWallet: ({
    wallet,
    newSigners,
    isImport,
    signersCipherKey
  }: {
    wallet: Wallet;
    newSigners?: Signers;
    isImport?: boolean;
    signersCipherKey?: Uint8Array;
  }) => Promise<void>;
  isFirstLogin: boolean;
  setVaultNotificationAcknowledged: (vaultId: string) => void;
};

const DEFAULT_VAULTS_STATUSES: VaultsStatuses = {};
const DEFAULT_ACCOUNTS: Accounts = {};
const DEFAULT_VAULTS: Vaults = {};
const WalletProviderRaw = ({
  children
}: {
  children: ReactNode;
  newWalletSigners?: Signers;
}) => {
  //This keeps track of the current active wallet.
  //There is a useEffect on "wallet" that updates the stored Wallets object too
  const [unsynchdWalletId, setWalletId] = useState<number>();
  //Keep also a ref version  of walletId so that in async functions we can
  //check after the await if the walletId changed
  const walletIdRef = useRef<number | undefined>();
  // This explorer is only used for retrieving
  // fees when using the TAPE network. It is shared for all wallets.
  const [explorerMainnet, setExplorerMainnet] = useState<Explorer | undefined>(
    undefined
  );
  const [walletsNewSigners, setNewSigners, clearNewSigners] =
    useWalletState<Signers>();
  const [walletsSignersCipherKey, setSignersCipherKey, clearSignersCipherKey] =
    useWalletState<Uint8Array>();
  const [walletsDataCipherKey, setDataCipherKey, clearDataCipherKey] =
    useWalletState<Uint8Array>();
  const [walletsDiscovery, setDiscovery, clearDiscovery] = useWalletState<
    DiscoveryInstance | undefined
  >();
  const [walletsUtxosData, setUtxosData, clearUtxosData] =
    useWalletState<UtxosData>();
  const [walletsHistoryData, setHistoryData, clearHistoryData] =
    useWalletState<HistoryData>();
  const [
    walletsSyncingBlockchain,
    setSyncingBlockchain,
    clearSynchingBlockchain
  ] = useWalletState<boolean>();

  const { btcFiat, updateBtcFiat } = useBtcFiat();

  const { secureStorageInfo } = useSecureStorageInfo();
  const { t } = useTranslation();
  const navigation = useNavigation<NavigationPropsByScreenId[typeof WALLETS]>();

  const goBackToWallets = useCallback(
    (walletId: number) => {
      //In react navigation v6 navigation.navigate behaves as if doing a
      //navigation.pop(2). So it unmounts this screen.
      //Note that on version v7 the behaviour will change. Since a reset of all
      //states and refs is necessary when leaving this screen, then make sure
      //
      //I will still be using the same behaviupur when i upgrade to v7
      //https://reactnavigation.org/docs/7.x/upgrading-from-6.x#the-navigate-method-no-longer-goes-back-use-popto-instead
      //
      // @ts-expect-error: Using popTo for future upgrade to v7
      if (navigation.popTo) navigation.popTo(WALLETS, { walletId });
      else navigation.navigate(WALLETS);
    },
    [navigation]
  );

  const [wallets, setWallets, , , walletsStorageStatus] = useStorage<Wallets>(
    `WALLETS`,
    SERIALIZABLE,
    {}
  );

  const wallet =
    unsynchdWalletId !== undefined ? wallets?.[unsynchdWalletId] : undefined;
  const walletId = wallet?.walletId; //walletId will be defined once the wallet is ready.

  const networkId = wallet?.networkId;
  const signersStorageEngine = wallet?.signersStorageEngine;
  const network = networkId && networkMapping[networkId];
  if (wallet && !network) throw new Error(`Invalid networkId ${networkId}`);

  const signersStorageEngineMismatch =
    (signersStorageEngine === 'MMKV' && Platform.OS === 'web') ||
    (signersStorageEngine === 'IDB' && Platform.OS !== 'web') ||
    (signersStorageEngine === 'SECURESTORE' &&
      !!secureStorageInfo &&
      secureStorageInfo.canUseSecureStorage === false);

  const { settings, settingsStorageStatus } = useSettings();
  const gapLimit = settings?.GAP_LIMIT;
  const networkTimeout = settings?.NETWORK_TIMEOUT;

  const {
    mainnetEsploraApi,
    mainnetElectrumApi,
    electrumAPI,
    esploraAPI,
    serviceAddressAPI,
    cBVaultsWriterAPI,
    faucetAPI,
    faucetURL,
    cBVaultsReaderAPI,
    watchtowerAPI,
    generate204API,
    generate204CbVaultsReaderAPI,
    generate204WatchtowerAPI,
    generate204APIExternal,
    blockExplorerURL
  } = getAPIs(networkId, settings);

  // Notifications are now stored in the wallet object

  const initSigners =
    !signersStorageEngineMismatch &&
    walletId !== undefined &&
    (wallet?.signersEncryption !== 'PASSWORD' ||
      walletsSignersCipherKey[walletId]);

  const [signers, , , clearSignersCache, signersStorageStatus] =
    useStorage<Signers>(
      initSigners ? `SIGNERS_${walletId}` : undefined,
      SERIALIZABLE,
      walletId === undefined ? undefined : walletsNewSigners[walletId],
      signersStorageEngine,
      walletId === undefined ? undefined : walletsSignersCipherKey[walletId],
      t('app.secureStorageAuthenticationPrompt')
    );

  const initialDiscoveryExportRef = useRef<
    DiscoveryExport | undefined | 'NOT_SYNCHD'
  >('NOT_SYNCHD');

  const initStorage =
    walletId !== undefined &&
    signersStorageStatus.errorCode === false &&
    (wallet?.encryption !== 'SEED_DERIVED' || walletsDataCipherKey[walletId]);

  const [
    discoveryExport,
    setDiscoveryExport,
    ,
    clearDiscoveryExportCache,
    discoveryExportStorageStatus
  ] = useStorage<DiscoveryExport>(
    initStorage ? `DISCOVERY_${walletId}` : undefined,
    SERIALIZABLE,
    undefined,
    undefined,
    walletId !== undefined ? walletsDataCipherKey[walletId] : undefined
  );

  if (discoveryExportStorageStatus.isSynchd) {
    if (initialDiscoveryExportRef.current === 'NOT_SYNCHD') {
      initialDiscoveryExportRef.current = discoveryExport;
    }
  } else initialDiscoveryExportRef.current = 'NOT_SYNCHD';
  const initialDiscoveryExport = initialDiscoveryExportRef.current;

  const discovery =
    walletId !== undefined ? walletsDiscovery[walletId] : undefined;

  //init discovery:
  //discoveryExport may be changing continuously (this is the data that
  //will be retrieved from disk next time the App is open). However the
  //discovery instance should be kept the same once the App is open.
  //So use initialDiscoveryExport
  useEffect(() => {
    if (
      settings?.NETWORK_TIMEOUT !== undefined &&
      walletId !== undefined &&
      electrumAPI &&
      esploraAPI &&
      network &&
      initialDiscoveryExport !== 'NOT_SYNCHD'
    ) {
      const explorer =
        Platform.OS === 'web'
          ? new EsploraExplorer({
              url: esploraAPI,
              timeout: settings.NETWORK_TIMEOUT
            })
          : new ElectrumExplorer({
              network,
              ...electrumParams(electrumAPI),
              timeout: settings.NETWORK_TIMEOUT
            });
      //explorer.connect performed in NetSTatusContext
      const { Discovery } = DiscoveryFactory(explorer, network);
      const newDiscovery =
        initialDiscoveryExport !== undefined
          ? new Discovery({ imported: initialDiscoveryExport })
          : new Discovery();

      setDiscovery(walletId, newDiscovery);
    }
    //Note there is no cleanup. Discovery is closed on logout
  }, [
    initialDiscoveryExport,
    walletId,
    electrumAPI,
    esploraAPI,
    network,
    setDiscovery,
    settings?.NETWORK_TIMEOUT
  ]);

  //Init mainnet explorer
  useEffect(() => {
    if (Platform.OS === 'web') {
      if (
        settings?.NETWORK_TIMEOUT !== undefined &&
        mainnetEsploraApi &&
        !explorerMainnet &&
        networkId === 'TAPE'
      ) {
        const newExplorerMainnet = new EsploraExplorer({
          url: mainnetEsploraApi,
          timeout: settings?.NETWORK_TIMEOUT
        }); //explorer.connect performed in NetSTatusContext
        setExplorerMainnet(newExplorerMainnet);
      }
    } else {
      const network = networkId && networkMapping[networkId];
      if (
        network &&
        mainnetElectrumApi &&
        !explorerMainnet &&
        networkId === 'TAPE'
      ) {
        const newExplorerMainnet = new ElectrumExplorer({
          network,
          ...electrumParams(mainnetElectrumApi)
        }); //explorer.connect performed in NetSTatusContext
        setExplorerMainnet(newExplorerMainnet);
      }
    }
  }, [
    mainnetEsploraApi,
    mainnetElectrumApi,
    explorerMainnet,
    networkId,
    settings?.NETWORK_TIMEOUT
  ]);

  const {
    reset: netStatusReset,
    init: netStatusInit,
    update: netStatusUpdate,
    apiReachable,
    netRequest,
    netToast,
    explorerReachable,
    explorerMainnetReachable
  } = useNetStatus();
  const netReady =
    apiReachable &&
    explorerReachable &&
    (networkId !== 'TAPE' || explorerMainnetReachable);

  useEffect(() => {
    //Wait until both explorers have been created
    if (discovery?.getExplorer() && (networkId !== 'TAPE' || explorerMainnet)) {
      //makes sure the netStatus is reset. A reset is already done on logOut.
      //But we do it here again just in case we are getting a new explorers
      //For example in case the user changes the Electrum Server on the Settings
      //Screen and this hook is therefore triggered with a new explorer.
      netStatusReset();
      netStatusInit({
        networkId,
        explorer: discovery.getExplorer(),
        generate204API,
        generate204CbVaultsReaderAPI,
        generate204WatchtowerAPI,
        //For Tape, we need to make sure blockstream esplora is working:
        explorerMainnet: networkId === 'TAPE' ? explorerMainnet : undefined,
        generate204APIExternal:
          //There's no need to check the internet with an external server (typically
          //using google) when using a REGTEST wallet
          networkId &&
          networkId !== 'REGTEST' &&
          Platform.OS !==
            'web' /* note that using web, we'll get into CORS issues on google servers,
          however rewind servers are ok because they have Access-Control-Allow-Origin' '*'
          in react-native (non-web), fetch does not check for CORS stuff
          */
            ? generate204APIExternal
            : undefined
      });
    }
  }, [
    discovery,
    networkId,
    generate204API,
    generate204CbVaultsReaderAPI,
    generate204APIExternal,
    generate204WatchtowerAPI,
    explorerMainnet,
    netStatusReset,
    netStatusInit
  ]);

  const { tipStatus, updateTipStatus } = useTipStatus();
  const tipHeight = tipStatus?.blockHeight;
  const isFeeEstimatesSynchdRef = useRef<boolean>(false);
  const {
    feeEstimates,
    updateFeeEstimates,
    isSynchd: isFeeEstimatesSynchd
  } = useFeeEstimates();
  //Make isFeeEstimatesSynchd a ref. We don't want re-renders based on that.
  isFeeEstimatesSynchdRef.current = isFeeEstimatesSynchd;

  const [vaults, setVaults, , clearVaultsCache, vaultsStorageStatus] =
    useStorage<Vaults>(
      initStorage ? `VAULTS_${walletId}` : undefined,
      SERIALIZABLE,
      DEFAULT_VAULTS,
      undefined,
      walletId !== undefined ? walletsDataCipherKey[walletId] : undefined
    );

  const [
    vaultsStatuses,
    setVaultsStatuses,
    ,
    clearVaultsStatusesCache,
    vaultsStatusesStorageStatus
  ] = useStorage<VaultsStatuses>(
    initStorage ? `VAULTS_STATUSES_${walletId}` : undefined,
    SERIALIZABLE,
    DEFAULT_VAULTS_STATUSES,
    undefined,
    walletId !== undefined ? walletsDataCipherKey[walletId] : undefined
  );

  const [accounts, setAccounts, , clearAccountsCache, accountsStorageStatus] =
    useStorage<Accounts>(
      initStorage ? `ACCOUNTS_${walletId}` : undefined,
      SERIALIZABLE,
      DEFAULT_ACCOUNTS,
      undefined,
      walletId !== undefined ? walletsDataCipherKey[walletId] : undefined
    );

  /**
   * Call this when the wallet is updated somehow: changes in vaults in
   * fetched data and so on.
   *
   * It computes derived data: utxosData and historyData and sets them.
   * It also stores in disk discovery.export()
   */
  const setUtxosHistoryExport = useCallback(
    async (
      vaults: Vaults,
      vaultsStatuses: VaultsStatuses,
      accounts: Accounts,
      tipHeight: number
    ) => {
      if (
        tipHeight === undefined ||
        !discovery ||
        !network ||
        walletId === undefined
      ) {
        throw new Error(
          'Cannot set utxos and history data: required data is missing'
        );
      }

      const descriptors = getHotDescriptors(
        vaults,
        vaultsStatuses,
        accounts,
        tipHeight
      );
      const utxos = discovery.getUtxos({ descriptors });
      const walletUtxosData = getUtxosData(utxos, vaults, network, discovery);
      const history = discovery.getHistory(
        { descriptors },
        true
      ) as Array<TxAttribution>;
      const walletHistoryData = getHistoryData(
        history,
        vaults,
        vaultsStatuses,
        discovery
      );
      batchedUpdates(() => {
        setUtxosData(walletId, walletUtxosData);
        setHistoryData(walletId, walletHistoryData);
      });
      //Save to disk.
      const exportedData = discovery.export();
      await setDiscoveryExport(exportedData);
    },
    [
      discovery,
      network,
      setUtxosData,
      setHistoryData,
      walletId,
      setDiscoveryExport
    ]
  );

  const fetchBlockTime = useCallback(
    async (blockHeight: number) => {
      return (await discovery?.getExplorer().fetchBlockStatus(blockHeight))
        ?.blockTime;
    },
    [discovery]
  );

  /**
   * pushTx not only pushes the tx but it also updates the discovery internal
   * data model with the info extracted from txHex. Network errors must
   * be handled on higher levels.
   *
   * Note pushTx leaves an updated discovery instance but does NOT set
   * discoveryExport, utxosData, historyData or any other derived data.
   */
  const pushTx = useCallback(
    async (txHex: string) => {
      if (!discovery)
        throw new Error(
          `Discovery not ready for pushTx while trying to push ${txHex}`
        );
      if (gapLimit === undefined)
        throw new Error(
          `gapLimit not ready for pushTx while trying to push ${txHex}`
        );
      await discovery.push({ txHex, gapLimit });
    },
    [discovery, gapLimit]
  );

  /**
   * This is useful when the wallet is expecting funds in a speciffic output
   * determined by descriptor (and index if ranged).
   *
   * By calling this function, the internal discovery data is updated and a
   * full blockchain sync (which is expensive) can be avoided.
   * Note that this function also updates other derived data:
   * discoveryExport, utxosData, historyData.
   *
   * It returns the history of the address (can be empty) or undefined if
   * an error was found.
   *
   * Typically called when expecting a faucet in the firstReceiveAddress or
   * when expecting some new money in a recently created address. Network errors
   * must be handled on higher levels.

   */
  const fetchOutputHistory = useCallback(
    async ({
      descriptor,
      index
    }: {
      descriptor: string;
      index?: number;
    }): Promise<TxHistory | undefined> => {
      if (!vaults || !vaultsStatuses || !accounts || tipHeight === undefined)
        throw new Error('fetchOutputHistory inputs missing');
      if (index === undefined && descriptor.includes('*'))
        throw new Error('Use fetchOutputHistory only for a single output');
      if (!discovery)
        throw new Error(
          `Discovery not ready for fetchTxHistory while trying to fetch descriptor ${descriptor}:${index}`
        );
      const descriptorWithIndex = {
        descriptor,
        ...(index !== undefined ? { index } : {})
      };
      const initialHistory = discovery.getHistory(descriptorWithIndex);
      await discovery.fetch(descriptorWithIndex);
      const history = discovery.getHistory(descriptorWithIndex) as TxHistory;
      if (initialHistory !== history)
        await setUtxosHistoryExport(
          vaults,
          vaultsStatuses,
          accounts,
          tipHeight
        );

      return history;
    },
    [
      discovery,
      setUtxosHistoryExport,
      vaults,
      vaultsStatuses,
      accounts,
      tipHeight
    ]
  );

  const storageAccessStatus = getStorageAccessStatus({
    signers,
    isSignersSynchd: signersStorageStatus.isSynchd,
    settingsErrorCode: settingsStorageStatus.errorCode,
    signersErrorCode: signersStorageStatus.errorCode,
    walletsErrorCode: walletsStorageStatus.errorCode,
    discoveryExportErrorCode: discoveryExportStorageStatus.errorCode,
    vaultsErrorCode: vaultsStorageStatus.errorCode,
    vaultsStatusesErrorCode: vaultsStatusesStorageStatus.errorCode,
    accountsErrorCode: accountsStorageStatus.errorCode
  });
  const isCorrupted = getIsCorrupted({
    wallet,
    signers,
    isSignersSynchd: signersStorageStatus.isSynchd,
    signersErrorCode: signersStorageStatus.errorCode,
    vaults,
    isVaultsSynchd: vaultsStorageStatus.isSynchd,
    vaultsStatuses,
    isVaultsStatusesSynchd: vaultsStatusesStorageStatus.isSynchd,
    accounts,
    isAccountsSynchd: accountsStorageStatus.isSynchd
  });

  /** When all wallet realated data is synchronized and without any errors.
   * Use this variable to add the wallet into the wallets storage
   */
  const dataReady =
    walletsStorageStatus.isSynchd &&
    discoveryExportStorageStatus.isSynchd &&
    signersStorageStatus.isSynchd &&
    vaultsStorageStatus.isSynchd &&
    vaultsStatusesStorageStatus.isSynchd &&
    accountsStorageStatus.isSynchd &&
    walletsStorageStatus.errorCode === false &&
    discoveryExportStorageStatus.errorCode === false &&
    signersStorageStatus.errorCode === false &&
    vaultsStorageStatus.errorCode === false &&
    vaultsStatusesStorageStatus.errorCode === false &&
    accountsStorageStatus.errorCode === false &&
    !isCorrupted;

  //isFirstLogin will be false until the data is ready.
  //For example readwrite errors will prevent this from being true.
  const isFirstLogin =
    dataReady && walletId !== undefined && !!walletsNewSigners[walletId];

  // Refs for notification listeners
  const notificationListener = useRef<Notifications.Subscription>();
  const responseListener = useRef<Notifications.Subscription>();

  /**
   * Sends an acknowledgment to the watchtower that a notification for a
   * specific vault has been received/seen by the app.
   * Fails silently with a console warning if the request fails.
   */
  const sendAckToWatchtower = useCallback(
    async (watchtowerAPI: string, vaultId: string) => {
      if (!networkTimeout) {
        console.warn(
          'Cannot acknowledge watchtower notification: networkTimeout not set.'
        );
        return;
      }
      try {
        const pushToken = await getExpoPushToken();
        if (!pushToken) {
          console.warn(
            'Cannot acknowledge watchtower notification: pushToken not available.'
          );
          return;
        }

        const ackEndpoint = `${watchtowerAPI}/ack`;
        const response = await fetch(ackEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ pushToken, vaultId }),
          signal: AbortSignal.timeout(networkTimeout)
        });

        if (!response.ok) {
          console.warn(
            `Failed to acknowledge watchtower notification for vault ${vaultId} at ${watchtowerAPI}: ${response.status} ${response.statusText}`
          );
        }
      } catch (error) {
        console.warn(
          `Error acknowledging watchtower notification for vault ${vaultId} at ${watchtowerAPI}:`,
          error
        );
      }
    },
    [networkTimeout]
  );

  /**
   * Handles incoming notification data from the watchtower service.
   * Validates the data, adds new notifications to the wallet state,
   * and triggers acknowledgments for existing notifications.
   */
  const handleWatchtowerNotification = useCallback(
    (data: Record<string, unknown>) => {
      if (data && typeof data === 'object') {
        const walletIdStr = data['walletId'];
        const watchtowerId = data['watchtowerId'];

        if (walletIdStr) {
          // Validate walletId is a string containing a non-negative integer
          const walletIdNum = parseInt(walletIdStr as string, 10);
          if (!isNaN(walletIdNum) && walletIdNum >= 0) {
            // Store the notification data in the wallet object
            if (wallets && walletIdNum !== undefined) {
              const currentWallet = wallets[walletIdNum];
              if (currentWallet && watchtowerId) {
                // Only update if this is a new notification or for a different vault
                const vaultId = data['vaultId'] as string;
                if (vaultId) {
                  const existingNotifications =
                    currentWallet.notifications || {};
                  const existingWatchtowerNotifications =
                    existingNotifications[watchtowerId as string] || {};

                  // Check if we already have a notification for this vault from
                  // this watchtower
                  if (existingWatchtowerNotifications[vaultId]) {
                    if (existingWatchtowerNotifications[vaultId].acked === true)
                      sendAckToWatchtower(watchtowerId as string, vaultId);
                  } else {
                    // Notification doesn't exist yet, add it.
                    // Validate required fields exist and are of correct type
                    const firstDetectedAt = data['firstDetectedAt'] as number;
                    const txid = data['txid'] as string;

                    if (
                      typeof firstDetectedAt === 'number' &&
                      typeof txid === 'string' &&
                      txid.length > 0
                    ) {
                      // Check if this vault was triggered from another device
                      const vaultStatus = vaultsStatuses?.[vaultId];
                      const triggerPushTime = vaultStatus?.triggerPushTime;
                    
                      // If there's no triggerPushTime or it's not close to firstDetectedAt,
                      // then this trigger came from another device
                      const PUSH_TIME_THRESHOLD = 60; // seconds
                      const wasTriggeredFromThisDevice = 
                        triggerPushTime !== undefined && 
                        Math.abs(triggerPushTime - firstDetectedAt) < PUSH_TIME_THRESHOLD;

                      if (!wasTriggeredFromThisDevice) {
                        goBackToWallets(walletIdNum);
                      }

                      // Create new wallet object with updated notifications
                      const updatedWallet = {
                        ...currentWallet,
                        notifications: {
                          ...existingNotifications,
                          [watchtowerId as string]: {
                            ...existingWatchtowerNotifications,
                            [vaultId]: {
                              firstAttemptAt: firstDetectedAt,
                              acked: false
                            }
                          }
                        }
                      };

                      // Update wallets storage
                      setWallets({
                        ...wallets,
                        [walletIdNum]: updatedWallet
                      });
                    } else {
                      console.warn('Invalid notification data received:', {
                        firstDetectedAt,
                        txid
                      });
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    [wallets, setWallets, sendAckToWatchtower]
  );

  /**
º  * Fetches unacknowledged notifications from the watchtower service.
   *
   * This function is critical for recovering notifications that were sent
   * while the app was not running (killed). When a notification arrives and the
   * app is closed:
   * 1. The OS shows a notification in the system tray
   * 2. If the user doesn't interact with this notification, the app has no way
   *    to know about it when launched later
   *
   * @param {string} watchtowerAPI - The base watchtower API URL for the specific network
   * @returns {Promise<boolean>} True if notifications were successfully fetched and processed,
   *                            false if there was an error or the service was unavailable
   */
  const fetchWatchtowerUnacked = useCallback(
    async (watchtowerAPI: string): Promise<boolean> => {
      if (!networkTimeout) {
        console.warn(
          'Cannot fetch unacknowledged notifications: missing network timeout'
        );
        return false;
      }

      try {
        // Get the push token
        const pushToken = await getExpoPushToken();
        if (!pushToken) {
          console.warn(
            'Cannot fetch unacknowledged notifications: no push token available'
          );
          return false;
        }

        // Construct the notifications endpoint for this network
        const notificationsEndpoint = `${watchtowerAPI}/notifications`;

        // Make the request to the watchtower API
        const response = await fetch(notificationsEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ pushToken }),
          signal: AbortSignal.timeout(networkTimeout)
        });

        if (!response.ok) {
          console.warn(
            `Failed to fetch unacknowledged notifications from ${notificationsEndpoint}: ${response.status} ${response.statusText}`
          );
          return false;
        }

        const data = await response.json();

        if (!data.notifications || !Array.isArray(data.notifications)) {
          console.warn(
            'Invalid response format for unacknowledged notifications'
          );
          return false;
        }

        // Process each notification
        for (const notification of data.notifications) {
          const {
            vaultId,
            walletId: notificationWalletId,
            watchtowerId,
            firstDetectedAt,
            txid
          } = notification;

          if (
            typeof vaultId === 'string' &&
            typeof notificationWalletId === 'string' &&
            typeof watchtowerId === 'string' &&
            typeof firstDetectedAt === 'number' &&
            typeof txid === 'string'
          ) {
            // Process the notification data using the handler
            handleWatchtowerNotification({
              vaultId,
              walletId: notificationWalletId,
              watchtowerId,
              firstDetectedAt,
              txid
            });
          }
        }

        // Successfully fetched and processed notifications
        return true;
      } catch (error) {
        // Don't throw, just log the warning
        console.warn(
          `Error fetching unacknowledged notifications from ${watchtowerAPI}:`,
          error
        );
        return false;
      }
    },
    [networkTimeout, handleWatchtowerNotification]
  );

  // Set up watchtower notification handling & polling for pending notifications
  useEffect(() => {
    if (!walletsStorageStatus.isSynchd || !settingsStorageStatus.isSynchd)
      return;

    // Check for any notifications that might have launched the app
    Notifications.getLastNotificationResponseAsync()
      .then(response => {
        if (response) {
          handleWatchtowerNotification(
            response.notification.request.content.data
          );
        }
      })
      .catch(error => {
        console.warn('Error getting last notification response:', error);
      });

    // Listen for notifications received while app is in foreground
    notificationListener.current =
      Notifications.addNotificationReceivedListener(notification => {
        handleWatchtowerNotification(notification.request.content.data);
      });

    // Listen for user interaction with notifications (tapping the notification)
    responseListener.current =
      Notifications.addNotificationResponseReceivedListener(response => {
        handleWatchtowerNotification(
          response.notification.request.content.data
        );
      });

    // Check pending notifications that may have arrived while the app was
    // closed (killed).
    // This is the only possible way to retrieve them if the app was killed
    // and the user did not tap on the notification.
    let pollingTimeout: NodeJS.Timeout | undefined;
    // Track which watchtower APIs failed to fetch notifications. Initially, all
    const failedWatchtowerAPIs = Object.values(wallets || [])
      .map(w => w.networkId)
      .filter((netId, i, arr) => netId && arr.indexOf(netId) === i) //del duplicates
      .map(netId => getAPIs(netId, settings).watchtowerAPI)
      .filter(Boolean) as string[];

    // Fetch notifications from all watchtower APIs
    Promise.all(
      [...failedWatchtowerAPIs].map(async watchtowerAPI => {
        const success = await fetchWatchtowerUnacked(watchtowerAPI);
        if (success) {
          const index = failedWatchtowerAPIs.indexOf(watchtowerAPI);
          if (index !== -1) failedWatchtowerAPIs.splice(index, 1);
        }
      })
    ).then(() => {
      if (failedWatchtowerAPIs.length > 0) {
        const poll = async () => {
          for (const watchtowerAPI of [...failedWatchtowerAPIs]) {
            const success = await fetchWatchtowerUnacked(watchtowerAPI);
            if (!pollingTimeout) return; // cancel if unmounted
            if (success) {
              const index = failedWatchtowerAPIs.indexOf(watchtowerAPI);
              if (index !== -1) failedWatchtowerAPIs.splice(index, 1);
            }
          }
          if (failedWatchtowerAPIs.length === 0) {
            if (pollingTimeout) clearTimeout(pollingTimeout);
            pollingTimeout = undefined;
            return;
          }
          pollingTimeout = setTimeout(poll, 60000); // Wait 60' for next attempt
        };
        pollingTimeout = setTimeout(poll, 60000); // poll failed WTs after 60'
      }
    });

    // Clean up notification listeners and polling interval on unmount
    return () => {
      // Clear polling interval if it exists
      if (pollingTimeout) {
        clearTimeout(pollingTimeout);
        pollingTimeout = undefined;
      }

      // Clean up notification listeners
      if (notificationListener.current) {
        notificationListener.current.remove();
        notificationListener.current = undefined;
      }
      if (responseListener.current) {
        responseListener.current.remove();
        responseListener.current = undefined;
      }
    };
  }, [
    fetchWatchtowerUnacked,
    settings,
    wallets,
    handleWatchtowerNotification,
    walletsStorageStatus.isSynchd,
    settingsStorageStatus.isSynchd
  ]);

  /**
   * Important, to logOut from wallet, wallet (and therefore walletId) must
   * be the current state. It's not possible to pass walletId as argument since
   * we must use the clear functions set in useStorage when created with the current
   * wallet
   */
  const logOut = useCallback(async () => {
    if (walletId !== undefined) {
      batchedUpdates(() => {
        // Clear cache, so that data must be read from disk again for the walletId.
        // This forces cipherKeys to be evaluated again to decrypt from disk
        // In other words, passwords must be set again
        clearSignersCache();
        clearVaultsCache();
        clearVaultsStatusesCache();
        clearDiscoveryExportCache();
        clearAccountsCache();
        //Clear other state:
        clearDiscovery(walletId);
        clearUtxosData(walletId);
        clearHistoryData(walletId);
        clearSynchingBlockchain(walletId);
        clearNewSigners(walletId);
        clearSignersCipherKey(walletId);
        clearDataCipherKey(walletId);
        setWalletId(undefined);
        walletIdRef.current = undefined;
        netStatusReset(); //Stop checking network, also close all explorer instances
      });
    }
  }, [
    netStatusReset,
    walletId,
    clearSignersCache,
    clearVaultsCache,
    clearVaultsStatusesCache,
    clearDiscoveryExportCache,
    clearAccountsCache,
    clearDiscovery,
    clearUtxosData,
    clearHistoryData,
    clearSynchingBlockchain,
    clearNewSigners,
    clearSignersCipherKey,
    clearDataCipherKey
  ]);

  const deleteWallet = useCallback(
    async (walletId: number) => {
      if (walletId !== wallet?.walletId)
        throw new Error(`Cannot delete non-active wallet ${walletId}`);
      if (!wallets) throw new Error(`Cannot delete non-existing wallets`);
      await logOut();
      const authenticationPrompt = t('app.secureStorageAuthenticationPrompt');
      await Promise.all([
        deleteAsync(
          `SIGNERS_${walletId}`,
          wallet.signersStorageEngine,
          authenticationPrompt
        ),
        deleteAsync(`DISCOVERY_${walletId}`),
        deleteAsync(`VAULTS_${walletId}`),
        deleteAsync(`VAULTS_STATUSES_${walletId}`),
        deleteAsync(`ACCOUNTS_${walletId}`)
      ]);
      const { [walletId]: walletToDelete, ...remainingWallets } = wallets;
      void walletToDelete;
      // This is the other only place this function can be called
      await setWallets(remainingWallets);
    },
    [logOut, t, wallet, setWallets, wallets]
  );

  const onWallet = useCallback(
    async ({
      wallet: walletDst,
      newSigners,
      signersCipherKey
    }: {
      wallet: Wallet;
      /**
       * This is the mnemonic, it's set only when creating new wallets
       */
      newSigners?: Signers;
      /**
       * This is the password
       * set it when creating new wallets with password or when loggin in with password
       */
      signersCipherKey?: Uint8Array;
    }) => {
      const walletId = walletDst.walletId;
      if (newSigners) {
        //Make sure we don't have values from previous app installs using the same id?
        const authenticationPrompt = t('app.secureStorageAuthenticationPrompt');
        await Promise.all([
          deleteAsync(
            `SIGNERS_${walletId}`,
            walletDst.signersStorageEngine,
            authenticationPrompt
          ),
          deleteAsync(`DISCOVERY_${walletId}`),
          deleteAsync(`VAULTS_${walletId}`),
          deleteAsync(`VAULTS_STATUSES_${walletId}`),
          deleteAsync(`ACCOUNTS_${walletId}`)
        ]);
      }
      //React 18 NOT on the new Architecture behaves as React 17:
      batchedUpdates(() => {
        //logOut(); //Log out from previous wallet - This is done now on "beforeRemove" event in WalletsHomeScreen
        setWalletId(prevWalletId => {
          //Net status depends on the wallet (explorer, ...); so reset it ONLY when it changes
          if (prevWalletId !== walletId) netStatusReset();
          return walletId;
        });
        walletIdRef.current = walletId;
        if (signersCipherKey) setSignersCipherKey(walletId, signersCipherKey);
        if (newSigners) setNewSigners(walletId, newSigners);
        if (wallets && walletDst !== wallets[walletId])
          setWallets({ ...wallets, [walletId]: walletDst });
      });
    },
    [
      //logOut,
      wallets,
      setWallets,
      t,
      setNewSigners,
      setSignersCipherKey,
      netStatusReset
    ]
  );

  useEffect(() => {
    if (
      walletId !== undefined &&
      signers &&
      network &&
      wallet.encryption === 'SEED_DERIVED'
    ) {
      const signer = signers[0];
      if (!signer) throw new Error('signer unavailable');
      const fetchDataCipherKey = async () => {
        const walletDataCipherKey = await getDataCipherKey({
          signer,
          network
        });
        setDataCipherKey(walletId, walletDataCipherKey);
      };
      fetchDataCipherKey();
    }
  }, [walletId, setDataCipherKey, signers, network, wallet?.encryption]);

  //Tries to initialize wallet utxos and history from the discovery object we
  //got from disk ASAP (only if not set)
  useEffect(() => {
    if (
      walletId !== undefined &&
      !walletsUtxosData[walletId] &&
      !walletsHistoryData[walletId] &&
      vaults &&
      vaultsStatuses &&
      accounts &&
      tipHeight !== undefined
    ) {
      setUtxosHistoryExport(vaults, vaultsStatuses, accounts, tipHeight);
    }
  }, [
    setUtxosHistoryExport,
    vaults,
    vaultsStatuses,
    accounts,
    tipHeight,
    walletId,
    walletsUtxosData,
    walletsHistoryData
  ]);

  const getNextChangeDescriptorWithIndex = useCallback(
    async (accounts: Accounts) => {
      if (!network) throw new Error('Network not ready');
      if (!Object.keys(accounts).length) throw new Error('Accounts not set');
      if (!discovery) throw new Error('Discovery not ready');
      const account = getMainAccount(accounts, network);
      const changeDescriptor = account.replace(/\/0\/\*/g, '/1/*');
      return {
        descriptor: changeDescriptor,
        index: discovery.getNextIndex({
          descriptor: changeDescriptor
        })
      };
    },
    [network, discovery]
  );

  const getNextReceiveDescriptorWithIndex = useCallback(
    async (accounts: Accounts) => {
      if (!network) throw new Error('Network not ready');
      if (!Object.keys(accounts).length) throw new Error('Accounts not set');
      if (!discovery) throw new Error('Discovery not ready');
      const account = getMainAccount(accounts, network);
      const receiveDescriptor = account;
      return {
        descriptor: receiveDescriptor,
        index: discovery.getNextIndex({
          descriptor: receiveDescriptor
        })
      };
    },
    [network, discovery]
  );

  const getUnvaultKey = useCallback(async () => {
    if (!network) throw new Error('Network not ready');
    if (!signers) throw new Error('Signers not ready');
    const signer = signers[0];
    if (!signer) throw new Error('signer unavailable');
    return await createUnvaultKey({ signer, network });
  }, [network, signers]);

  const fetchServiceAddress = useCallback(async () => {
    if (!serviceAddressAPI) {
      throw new Error(
        'System not ready to fetch the service address (serviceAddressAPI).'
      );
    }
    if (!networkTimeout) {
      throw new Error(
        'System not ready to fetch the service address (networkTimeout).'
      );
    }

    try {
      const response = await fetch(`${serviceAddressAPI}/get`, {
        signal: AbortSignal.timeout(networkTimeout)
      });
      if (!response.ok) {
        throw new Error(
          `Failed to fetch service address${response.statusText ? `: ${response.statusText}` : ''}`
        );
      }

      const data = await response.json();
      if (!data.address) {
        throw new Error('Invalid response: address field is missing.');
      }

      return data.address;
    } catch (error) {
      // Handle errors (e.g., network issues, invalid JSON, etc.)
      console.error('Error fetching service address:', error);
      throw error; // Re-throw the error if you want to handle it outside or show a message to the user
    }
  }, [serviceAddressAPI, networkTimeout]);

  //Did the user initiated the sync (true)? ir was it a scheduled one (false)?
  const isUserTriggeredSync = useRef<boolean>(false);
  const prevAccountsSyncRef = useRef<Accounts | undefined>();

  const watchtowerWalletName =
    wallet && wallets && walletTitle(wallet, wallets, t);

  const setVaultNotificationAcknowledged = useCallback(
    (vaultId: string) => {
      if (
        !watchtowerAPI ||
        !networkTimeout ||
        !wallets ||
        walletId === undefined
      )
        return;

      const wallet = wallets[walletId];
      if (!wallet) return;

      const currentNotification =
        wallet.notifications?.[watchtowerAPI]?.[vaultId];
      if (currentNotification?.acked === true) return;

      const updatedWallets = {
        ...wallets,
        [walletId]: {
          ...wallet,
          notifications: {
            ...wallet.notifications,
            [watchtowerAPI]: {
              ...wallet.notifications?.[watchtowerAPI],
              [vaultId]: {
                ...currentNotification,
                acked: true
              }
            }
          }
        }
      };

      setWallets(updatedWallets);
    },
    [watchtowerAPI, networkTimeout, wallets, walletId, setWallets]
  );

  /**
   * Registers vaults with the watchtower service and updates their
   * registration status.
   *
   * If configureNotifications has not been called this call has no effect.
   * If all vaults have already been registered this function has no effect.
   *
   * Updates the vaultsStatuses state if the registration process resulted in
   * changes.
   */
  const syncWatchtowerRegistration = useCallback(async () => {
    // Ensure all required data is available before proceeding
    if (!vaults || !vaultsStatuses || walletId === undefined) {
      console.warn('syncWatchtowerRegistration: Skipping due to missing data.');
      return;
    }

    try {
      if (!watchtowerAPI || !networkTimeout || !watchtowerWalletName)
        throw new Error('Required data for watchtower registration missing');
      const { result: newWatchedVaults } = await netRequest({
        id: 'watchtower',
        errorMessage: (message: string) =>
          t('app.watchtowerError', { message }),
        whenToastErrors: 'ON_NEW_ERROR',
        requirements: { watchtowerAPIReachable: true },
        func: () => {
          const rawLocale = settings?.LOCALE ?? defaultSettings.LOCALE;
          const locale =
            rawLocale === 'default'
              ? getLocales()[0]?.languageTag ?? 'en'
              : rawLocale;
          return watchVaults({
            watchtowerAPI,
            vaults,
            vaultsStatuses,
            networkTimeout,
            walletName: watchtowerWalletName,
            locale,
            walletId: walletId.toString()
          });
        }
      });

      let updatedVaultsStatuses = vaultsStatuses;
      if (newWatchedVaults?.length) {
        let alreadyMutated = false;
        for (const vaultId of newWatchedVaults) {
          const status = vaultsStatuses[vaultId];
          if (!status) throw new Error('Unset status for vaultId');
          if (!status.registeredWatchtowers?.includes(watchtowerAPI)) {
            if (!alreadyMutated) {
              alreadyMutated = true;
              updatedVaultsStatuses = { ...vaultsStatuses };
            }
            updatedVaultsStatuses[vaultId] = {
              ...status,
              registeredWatchtowers: [
                ...(status.registeredWatchtowers ?? []),
                watchtowerAPI
              ]
            };
          }
        }
      }

      // Only update state if the object reference changed, indicating a mutation
      if (
        updatedVaultsStatuses !== vaultsStatuses &&
        // Also make sure vaults are still synched after the await above
        // Not a big issue not setting vault statuses now (if unsynched). The
        // update will be done in the next cycle
        areVaultsSynched(vaults, vaultsStatuses)
      )
        setVaultsStatuses(updatedVaultsStatuses);
    } catch (error) {
      // Errors during registration are handled within registerWithWatchtower (via netRequest)
      // but catch any unexpected errors here.
      console.warn('Error during syncWatchtowerRegistration:', error);
    }
  }, [
    vaults,
    vaultsStatuses,
    walletId,
    setVaultsStatuses,
    netRequest,
    networkTimeout,
    settings?.LOCALE,
    t,
    watchtowerAPI,
    watchtowerWalletName
  ]);

  /**
   * Initiates the blockchain synchronization process. If netStatus has errors
   * it tries first to check the network .
   */
  const sync = useCallback(async () => {
    if (walletId === undefined) throw new Error('Cannot sync an unset wallet');

    // Track `prevAccounts` to detect changes and manage state between syncs.
    const prevAccounts = prevAccountsSyncRef.current;
    prevAccountsSyncRef.current = accounts;

    const isUserTriggered = isUserTriggeredSync.current;
    isUserTriggeredSync.current = false;
    const whenToastErrors = isUserTriggeredSync
      ? 'ON_ANY_ERROR'
      : 'ON_NEW_ERROR';

    const signer = signers?.[0];
    const network = networkId && networkMapping[networkId];

    if (
      watchtowerWalletName !== undefined &&
      dataReady &&
      networkId &&
      network &&
      gapLimit !== undefined &&
      networkTimeout !== undefined &&
      discovery &&
      vaults &&
      vaultsStatuses &&
      accounts &&
      // This condition below prevents unnecessary re-syncs after `accounts` are
      // initially created by this function (prevAccounts.length === 0), as new
      // accounts set here are already synced when created.
      (prevAccounts === undefined /*load a wallet after app is opened*/ ||
        Object.keys(prevAccounts).length !== 0 /*re-sync existing wallet*/ ||
        Object.keys(accounts).length === 0) /*create new wallet*/ &&
      //When a new vault is created, vaults, vaultsStatuses and accounts are not
      //atomically set in state at the same time.
      //Wait until both are set before proceeding. This is important because
      //updateVaultsStatuses upddate status based on vaults so they must be
      //synched
      areVaultsSynched(vaults, vaultsStatuses) &&
      signer &&
      cBVaultsReaderAPI &&
      watchtowerAPI
    ) {
      console.log(
        `[${new Date().toISOString()}] [Sync] Wallet: ${walletId} | NetReady: ${netReady} | UserTriggered: ${isUserTriggered} | network: ${networkId}`
      );

      if (netReady === false && isUserTriggered) {
        //This strategy only checks netStatus changes when we're sure the
        //network is down and the user is requesting it. This is because this is
        //an expensive operation and sync may also be called automatically on
        //dependencies of dataReady, netReady, callback functions and so on...
        //No prob if netStatusUpdate fails.
        const ns = await netStatusUpdate({ whenToastErrors });
        if (walletId !== walletIdRef.current) {
          //do this after each await
          setSyncingBlockchain(walletId, false);
          return;
        }
        //wait until next execution thread to allow netStatusUpdate
        //to update internal states, which will need to be ready for the netRequest
        //calls below:
        await new Promise(resolve => setTimeout(resolve, 100));
        if (walletId !== walletIdRef.current) {
          //do this after each await
          setSyncingBlockchain(walletId, false);
          return;
        }
        if (!ns?.explorerReachable) {
          //also don't continue if explorer is not reachable
          setSyncingBlockchain(walletId, false);
          return;
        }
      }

      try {
        updateBtcFiat({ networkTimeout, whenToastErrors }).catch(() => {
          // Intentionally not awaited or wrapped in a try-catch.
          // This call is meant to trigger a parallel update of the BTC rate.
          // Any errors will be handled and displayed via a
          // Toast / permanentErrorMessage by the async function itself.
        });
        //Toasts a warning error on failure but does not stop the sync
        if (!isFeeEstimatesSynchdRef.current)
          await updateFeeEstimates({ whenToastErrors });
        if (walletId !== walletIdRef.current) {
          //do this after each await
          setSyncingBlockchain(walletId, false);
          return;
        }
        const updatedTipHeight = (await updateTipStatus({ whenToastErrors }))
          ?.blockHeight;
        if (walletId !== walletIdRef.current) {
          //do this after each await
          setSyncingBlockchain(walletId, false);
          return;
        }
        if (!updatedTipHeight) {
          //also don't continue if we cannot get a valid updatedTipHeight
          setSyncingBlockchain(walletId, false);
          return;
        }
        //First get updatedVaults & updatedVaultsStatuses:

        //Toast a warning error on failure, but does not stop the sync
        const { result: p2pVaults } = await netRequest({
          id: 'p2pVaults',
          errorMessage: (message: string) =>
            t('app.syncP2PVaultsError', { message }),
          whenToastErrors,
          requirements: { apiReachable: true },
          func: () =>
            fetchP2PVaults({
              networkTimeout,
              signer,
              networkId,
              cBVaultsReaderAPI,
              vaults
            })
        });
        if (walletId !== walletIdRef.current) {
          //do this after each await
          setSyncingBlockchain(walletId, false);
          return;
        }

        let updatedVaults = vaults; //initially they are the same
        if (p2pVaults)
          Object.entries(p2pVaults).forEach(([key, p2pVault]) => {
            const currentVault = vaults[key];
            //A vault cannot mutate. It either exists or not, but once created
            //it will never change:
            if (p2pVault && !currentVault) {
              // Mutate updatedVaults because a new one has been detected
              updatedVaults = { ...updatedVaults };
              updatedVaults[key] = p2pVault;
            }
          });

        const { result: freshVaultsStatuses } = await netRequest({
          id: 'fetchVaultsStatuses',
          errorMessage: (message: string) =>
            t('app.syncNetworkError', { message }),
          whenToastErrors,
          requirements: { explorerReachable: true },
          func: () =>
            fetchVaultsStatuses(
              updatedVaults,
              vaultsStatuses,
              discovery.getExplorer()
            )
        });
        if (walletId !== walletIdRef.current) {
          //do this after each await
          setSyncingBlockchain(walletId, false);
          return;
        }
        if (!freshVaultsStatuses) {
          //also don't continue if fetching vaults statuses failed as this would
          //create unsynched vaults & vaultsStatuses
          setSyncingBlockchain(walletId, false);
          return;
        }
        let updatedVaultsStatuses = vaultsStatuses; //initially they are the same
        Object.entries(freshVaultsStatuses).forEach(([key, freshStatus]) => {
          const currentStatus = vaultsStatuses[key];
          //A vaultStatus can change in the future since it depends on user actions
          if (!shallowEqualObjects(currentStatus, freshStatus)) {
            // Mutate updatedVaultsStatuses because a change has been detected
            updatedVaultsStatuses = { ...updatedVaultsStatuses };
            updatedVaultsStatuses[key] = freshStatus;
          }
        });

        //set accounts if still not set
        let updatedAccounts = accounts;
        if (!Object.keys(updatedAccounts).length) {
          updatedAccounts = { ...accounts };
          if (signer.type !== 'SOFTWARE') {
            console.warn('Non-Software Wallets use default accounts for now');
            const defaultAccount = await getDefaultAccount(signers, network);
            if (walletId !== walletIdRef.current) {
              //do this after each await
              setSyncingBlockchain(walletId, false);
              return;
            }
            updatedAccounts[defaultAccount] = { discard: false };
          } else {
            if (!signer.mnemonic)
              throw new Error('mnemonic not set for soft wallet');
            const masterNode = getMasterNode(signer.mnemonic, network);
            const { status: fetchStandardStatus } = await netRequest({
              id: 'fetchStandardAccounts',
              errorMessage: (message: string) =>
                t('app.syncNetworkError', { message }),
              whenToastErrors,
              requirements: { explorerReachable: true },
              func: () =>
                discovery.fetchStandardAccounts({
                  masterNode,
                  gapLimit
                })
            });
            if (walletId !== walletIdRef.current) {
              //do this after each await
              setSyncingBlockchain(walletId, false);
              return;
            }
            if (fetchStandardStatus !== 'SUCCESS') {
              //also don't continue if discovery fails
              setSyncingBlockchain(walletId, false);
              return;
            }
            const usedAccounts = discovery.getUsedAccounts();
            if (usedAccounts.length)
              for (const usedAccount of usedAccounts)
                updatedAccounts[usedAccount] = { discard: false };
            else {
              const defaultAccount = await getDefaultAccount(signers, network);
              if (walletId !== walletIdRef.current) {
                //do this after each await
                setSyncingBlockchain(walletId, false);
                return;
              }
              updatedAccounts[defaultAccount] = { discard: false };
            }
          }
          setAccounts(updatedAccounts);
        }
        const descriptors = getHotDescriptors(
          updatedVaults,
          updatedVaultsStatuses,
          updatedAccounts,
          updatedTipHeight
        );
        const { status: fetchStatus } = await netRequest({
          id: 'syncFetch',
          errorMessage: (message: string) =>
            t('app.syncNetworkError', { message }),
          whenToastErrors,
          requirements: { explorerReachable: true },
          func: () => discovery.fetch({ descriptors, gapLimit })
        });
        if (walletId !== walletIdRef.current) {
          //do this after each await
          setSyncingBlockchain(walletId, false);
          return;
        }
        if (fetchStatus !== 'SUCCESS') {
          //also don't continue if discovery fails
          setSyncingBlockchain(walletId, false);
          return;
        }

        //Update states:
        batchedUpdates(() => {
          if (vaults !== updatedVaults) setVaults(updatedVaults);
          if (vaultsStatuses !== updatedVaultsStatuses)
            setVaultsStatuses(updatedVaultsStatuses);

          // setUtxosHistoryExport internally uses the recently fetched discovery
          // there's no need to wait since the async part is for storing data
          // on disk. This data is re-stored on each blockchain sync operation
          // anyway
          setUtxosHistoryExport(
            updatedVaults,
            updatedVaultsStatuses,
            updatedAccounts,
            updatedTipHeight
          );
        });
      } catch (error) {
        console.warn(error);
        //We don't care about errors of other wallets (probably trying to
        //do a network op on an expired wallet with closed explorer)
        if (walletId !== walletIdRef.current) {
          setSyncingBlockchain(walletId, false);
          return;
        }

        netToast(
          false,
          t('app.syncUnexpectedError', {
            message:
              error instanceof Error ? error.message : t('app.unknownError')
          })
        );
      }
    }

    setSyncingBlockchain(walletId, false);
  }, [
    watchtowerWalletName,
    netRequest,
    netToast,
    netStatusUpdate,
    dataReady,
    netReady,
    updateBtcFiat,
    updateFeeEstimates,
    updateTipStatus,
    setUtxosHistoryExport,
    setAccounts,
    setSyncingBlockchain,
    walletId,
    accounts,
    t,
    discovery,
    setVaults,
    setVaultsStatuses,
    vaults,
    vaultsStatuses,
    networkId,
    signers,
    cBVaultsReaderAPI,
    watchtowerAPI,
    gapLimit,
    networkTimeout
  ]);

  //When syncingBlockchain is set then trigger sync() which does all the
  //syncing task, sync() will set back syncingBlockchain[walletId] back to false
  //syncingBlockchain is set to true either by the user calling to
  //syncingBlockchain or automatically in a useEffect when walletId changes
  useEffect(() => {
    if (walletId !== undefined && walletsSyncingBlockchain[walletId]) sync();
  }, [walletsSyncingBlockchain, walletId, sync]);
  //This function is passed in the context so that users can sync
  const syncBlockchain = useCallback(() => {
    if (walletId !== undefined) {
      isUserTriggeredSync.current = true;
      setSyncingBlockchain(walletId, true);
    }
  }, [walletId, setSyncingBlockchain]);
  //Automatically set syncingBlockchain to true on new walletId: auto sync
  //on new wallet. Make sure explorer and api (vault checking) is reachable
  //since otherwise sync()
  //won't do anything as it's necessary.
  //Also it will auto-trigger update on a new block
  useEffect(() => {
    if (walletId !== undefined && dataReady && netReady) {
      setSyncingBlockchain(walletId, true);
    }
  }, [walletId, setSyncingBlockchain, dataReady, netReady, tipHeight]);

  /**
   * Pushes the vault, registers to the Watchtower (if device supports it and
   * if access was granted) and stores all associated
   * data locally:
   * It updates utxosData, history, vaults and vaultsStatuses without
   * requiring any additional fetch.
   * It also saves on disk discoveryExport.
   *
   * This function won't request user permissions for push notifications.
   *
   * This function may throw. try-catch it from outer blocks.
   *
   * If the push or saving state fail for any reason, then it throws.
   */
  const pushVaultRegisterWTAndUpdateStates = useCallback(
    async (vault: Vault): Promise<void> => {
      if (!vaults || !vaultsStatuses)
        throw new Error('vaults and vaultsStatuses should be defined');
      if (!accounts || tipHeight === undefined)
        throw new Error(
          `Cannot vaultPushAndUpdateStates without accounts: ${!!accounts} or tipHeight: ${!!tipHeight}`
        );
      if (walletId === undefined)
        throw new Error(
          'walletId undefined in pushVaultRegisterWTAndUpdateStates'
        );

      // Create new vault
      if (vaults[vault.vaultId])
        throw new Error(`Vault for ${vault.vaultId} already exists`);
      if (vaultsStatuses[vault.vaultId])
        throw new Error(`VaultStatus for ${vault.vaultId} already exists`);

      const newVaults = { ...vaults, [vault.vaultId]: vault };
      //let newVaultsStatuses = {
      const newVaultsStatuses = {
        ...vaultsStatuses,
        [vault.vaultId]: {
          vaultPushTime: Math.floor(Date.now() / 1000),
          vaultTxBlockHeight: 0
        }
      };

      await pushTx(vault.vaultTxHex);

      await Promise.all([
        setUtxosHistoryExport(
          newVaults,
          newVaultsStatuses,
          accounts,
          tipHeight
        ),
        //Note here setVaults, setVaultsStatuses, ...
        //are not atomically set, so when using vaults one
        //must make sure they are synched somehow - See Vaults.tsx for an
        //example what to do
        setVaults(newVaults),
        setVaultsStatuses(newVaultsStatuses)
      ]);
    },
    [
      walletId,
      pushTx,
      accounts,
      tipHeight,
      setUtxosHistoryExport,
      setVaults,
      setVaultsStatuses,
      vaults,
      vaultsStatuses
    ]
  );
  /**
   * Similar as vaultPushAndUpdateStates but for regular txs
   *
   * This function may throw. try-catch it from outer blocks.
   */
  const txPushAndUpdateStates = useCallback(
    async (txHex: string): Promise<void> => {
      if (!vaults || !vaultsStatuses)
        throw new Error('vaults and vaultsStatuses should be defined');
      if (!accounts || tipHeight === undefined)
        throw new Error(
          `Cannot txPushAndUpdateStates without accounts: ${!!accounts} or tipHeight: ${!!tipHeight}`
        );
      await pushTx(txHex);
      await setUtxosHistoryExport(vaults, vaultsStatuses, accounts, tipHeight);
    },
    [pushTx, accounts, tipHeight, setUtxosHistoryExport, vaults, vaultsStatuses]
  );

  const updateVaultStatus = useCallback(
    (vaultId: string, vaultStatus: VaultStatus) => {
      const currVaultStatus = vaultsStatuses?.[vaultId];
      if (!vaults || !accounts || !tipHeight)
        throw new Error('Cannot update statuses for non-initialized data');
      if (!currVaultStatus)
        throw new Error('Cannot update unexisting vault status');
      if (!shallowEqualObjects(currVaultStatus, vaultStatus)) {
        const newVaultsStatuses = { ...vaultsStatuses, [vaultId]: vaultStatus };
        //no need to await setUtxosHistoryExport since the await is only realated
        //to saving in disk dataExport, which is not really important since it
        //is just some initial point when opening a wallet before full sync
        setUtxosHistoryExport(vaults, newVaultsStatuses, accounts, tipHeight);
        setVaultsStatuses(newVaultsStatuses);
      }
    },
    [
      vaults,
      accounts,
      setUtxosHistoryExport,
      tipHeight,
      vaultsStatuses,
      setVaultsStatuses
    ]
  );

  const contextValue = {
    getUnvaultKey,
    getNextChangeDescriptorWithIndex,
    getNextReceiveDescriptorWithIndex,
    fetchServiceAddress,
    updateVaultStatus,
    btcFiat,
    signersStorageEngineMismatch,
    signers,
    accounts,
    vaults,
    vaultsStatuses,
    networkId,
    feeEstimates,
    tipStatus,
    utxosData: walletId !== undefined ? walletsUtxosData[walletId] : undefined,
    historyData:
      walletId !== undefined ? walletsHistoryData[walletId] : undefined,
    pushVaultRegisterWTAndUpdateStates,
    txPushAndUpdateStates,
    syncBlockchain,
    syncingBlockchain: !!(
      walletId !== undefined && walletsSyncingBlockchain[walletId]
    ),
    fetchBlockTime,
    pushTx,
    syncWatchtowerRegistration,
    fetchOutputHistory,
    cBVaultsWriterAPI,
    faucetAPI,
    faucetURL,
    cBVaultsReaderAPI,
    blockExplorerURL,
    watchtowerAPI,
    wallets,
    wallet,
    walletStatus: { isCorrupted, storageAccess: storageAccessStatus },
    requiresPassword:
      (walletId !== undefined &&
        wallet?.signersEncryption === 'PASSWORD' &&
        !walletsSignersCipherKey[walletId]) ||
      (typeof signersStorageStatus.errorCode !== 'boolean' &&
        signersStorageStatus.errorCode === 'DecryptError'),
    logOut,
    deleteWallet,
    onWallet,
    isFirstLogin,
    setVaultNotificationAcknowledged
  };
  return (
    <WalletContext.Provider value={contextValue}>
      {children}
    </WalletContext.Provider>
  );
};
export const WalletProvider = React.memo(WalletProviderRaw);
