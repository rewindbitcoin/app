//FIXME: on App state refetch from the watchtower...
//FIXME: on App state and on App start dismiss all...
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
import { v4 as uuid } from 'uuid';
import { useNavigation } from '@react-navigation/native';
import { WALLETS } from '../screens';
import {
  type Subscription,
  addNotificationReceivedListener,
  addNotificationResponseReceivedListener,
  getLastNotificationResponseAsync
} from 'expo-notifications';
import {
  watchVaults,
  canReceiveNotifications,
  fetchWatchtowerUnackedNotifications,
  sendAckToWatchtower
} from '../lib/watchtower';
import {
  walletTitle as walletTitleFn,
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
import { SERIALIZABLE, STRING, deleteAsync } from '../../common/lib/storage';
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
  orphanedWatchtowerWalletUUIDs: Set<string>;
  clearOrphanedWatchtowerWalletUUIDs: () => Promise<void>;
  //pushToken: undefined before being read from storage,
  //null when read from storage but the vaule had never been set yet.
  pushToken: string | undefined;
  setPushToken: (token: string) => Promise<void>;
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
  syncWatchtowerRegistration: (pushToken: string) => Promise<void>;
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
  logOut: () => void;
  deleteWallet: (idToDelete: number) => Promise<void>;
  onWallet: ({
    wallet,
    newSigners,
    isGenerated,
    signersCipherKey
  }: {
    wallet: Wallet;
    newSigners?: Signers;
    isGenerated?: boolean;
    signersCipherKey?: Uint8Array;
  }) => Promise<void>;
  isFirstLogin: boolean;
  isGenerated: boolean;
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
  const [orphanedWatchtowerWalletUUIDs, setOrphanedWatchtowerWalletUUIDs] =
    useState<Set<string>>(new Set());
  //activeWallet keeps track of the current wallet.
  //There is a useEffect on "activeWallet" that updates the stored Wallets objec
  //too.
  //This is set before the activeWallet is added to walletsStorage. Reason is we
  //first need to make sure biometrics work properly.
  //walletsStorage is only set after isWalletDiskSynched (and SecureStorage worked).
  const [activeWallet, setActiveWallet] = useState<Wallet>();
  //Serves to keep a ref version of walletId so that in async functions we can
  //check after the await if the activeWallet.walletId changed
  const walletIdRef = useRef<number>();
  // This explorer is only used for retrieving
  // fees when using the TAPE network. It is shared for all wallets.
  const [explorerMainnet, setExplorerMainnet] = useState<Explorer | undefined>(
    undefined
  );
  const [walletsNewSigners, setNewSigners, clearNewSigners] =
    useWalletState<Signers>();
  // the password:
  const [walletsSignersCipherKey, setSignersCipherKey, clearSignersCipherKey] =
    useWalletState<Uint8Array>();
  //walletsDataCipherKey is the encryption key for all data.
  //Data is encryped with XChaCha20-Poly1305 using a key
  //derived from the mnemonic.
  //The mnemonic itself is stored in SecureStorage. We can also encrypt
  //it further with a password: signersCipherKey. signersCipherKey is different
  //than walletsDataCipherKey. walletsDataCipherKey is only stored in memory.
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
  const navigation = useNavigation();

  // pushToken type will be undefined while not read, '' if read but never set
  // or a non-empty string if set
  const [pushToken, setPushToken] = useStorage<string>(
    'PUSH_TOKEN',
    STRING,
    ''
  );

  const goBackToWallets = useCallback(() => {
    //In react navigation v6 navigation.navigate behaves as if doing a
    //navigation.pop(<number>). So it unmounts the current screen.
    //Note that on version v7 the behaviour will change. Since a reset of all
    //states and refs is necessary when leaving this screen, then make sure
    //I will still be using the same behaviour when i upgrade to v7
    //https://reactnavigation.org/docs/7.x/upgrading-from-6.x#the-navigate-method-no-longer-goes-back-use-popto-instead
    //
    // @ts-expect-error: Using popTo for future upgrade to v7
    if (navigation.popTo) navigation.popTo(WALLETS);
    else navigation.navigate(WALLETS);
  }, [navigation]);

  const [wallets, setWallets, , , walletsStorageStatus] = useStorage<Wallets>(
    `WALLETS`,
    SERIALIZABLE,
    {}
  );

  //console.log('TRACE', Platform.OS, JSON.stringify(wallets, null, 2));

  // Add this effect to handle backwards compatibility
  // (wallets prior to Apr 29, 2025, created without uuid)
  useEffect(() => {
    if (wallets) {
      let needsUpdate = false;
      const updatedWallets = { ...wallets };
      Object.entries(updatedWallets).forEach(([idStr, storedWallet]) => {
        const id = parseInt(idStr, 10);
        if (!storedWallet.walletUUID) {
          needsUpdate = true;
          updatedWallets[id] = { ...storedWallet, walletUUID: uuid() };
        }
      });
      if (needsUpdate) setWallets(updatedWallets);
    }
  }, [wallets, setWallets]);

  const signersStorageEngineMismatch =
    (activeWallet?.signersStorageEngine === 'MMKV' && Platform.OS === 'web') ||
    (activeWallet?.signersStorageEngine === 'IDB' && Platform.OS !== 'web') ||
    (activeWallet?.signersStorageEngine === 'SECURESTORE' &&
      secureStorageInfo?.canUseSecureStorage === false);

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
  } = getAPIs(activeWallet?.networkId, settings);

  // Notifications are now stored in the wallet object

  // Password
  const signersCipherKey =
    activeWallet && walletsSignersCipherKey[activeWallet.walletId];
  const canInitSigners =
    activeWallet?.walletId === walletIdRef.current &&
    !signersStorageEngineMismatch &&
    (activeWallet?.signersEncryption === 'NONE' ||
      (activeWallet?.signersEncryption === 'PASSWORD' && !!signersCipherKey));

  // First thing i need to retrieve is signers
  // then, once the signers is retrieved i'll be able to retrieve the rest,
  // which depends on the signers cipher key which is used to encrypt the
  // rest of the data
  const [signers, , , clearSignersCache, signersStorageStatus] =
    useStorage<Signers>(
      canInitSigners ? `SIGNERS_${activeWallet.walletId}` : undefined,
      SERIALIZABLE,
      activeWallet && walletsNewSigners[activeWallet.walletId], //default val
      activeWallet?.signersStorageEngine,
      signersCipherKey, // cipher key
      t('app.secureStorageAuthenticationPrompt')
    );
  // When to init `DISCOVERY_${walletId}`, `VAULTS_${walletId}`,
  //`VAULTS_STATUSES_${walletId}` and `ACCOUNTS_${walletId}`
  const canInitCipheredDataStorage =
    activeWallet?.walletId === walletIdRef.current &&
    signersStorageStatus.isDiskSynchd &&
    signersStorageStatus.errorCode === false &&
    (activeWallet?.encryption === 'NONE' ||
      (activeWallet?.encryption === 'SEED_DERIVED' &&
        !!walletsDataCipherKey[activeWallet.walletId]));

  const [
    discoveryExport,
    setDiscoveryExport,
    ,
    clearDiscoveryExportCache,
    discoveryExportStorageStatus
  ] = useStorage<DiscoveryExport>(
    canInitCipheredDataStorage
      ? `DISCOVERY_${activeWallet.walletId}`
      : undefined,
    SERIALIZABLE,
    undefined,
    undefined,
    activeWallet && walletsDataCipherKey[activeWallet.walletId]
  );

  const initialDiscoveryExportRef = useRef<
    DiscoveryExport | undefined | 'NOT_SYNCHD'
  >('NOT_SYNCHD');
  if (discoveryExportStorageStatus.isSynchd) {
    if (initialDiscoveryExportRef.current === 'NOT_SYNCHD') {
      initialDiscoveryExportRef.current = discoveryExport;
    }
  } else initialDiscoveryExportRef.current = 'NOT_SYNCHD';
  const initialDiscoveryExport = initialDiscoveryExportRef.current;

  const discovery = activeWallet && walletsDiscovery[activeWallet.walletId];

  //init discovery:
  //discoveryExport may be changing continuously (this is the data that
  //will be retrieved from disk next time the App is open). However the
  //discovery instance should be kept the same once the App is open.
  //So use initialDiscoveryExport
  useEffect(() => {
    const network =
      activeWallet?.networkId && networkMapping[activeWallet.networkId];
    if (
      settings?.NETWORK_TIMEOUT !== undefined &&
      activeWallet?.walletId !== undefined &&
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
      //explorer.connect performed in NetStatusContext
      const { Discovery } = DiscoveryFactory(explorer, network);
      const newDiscovery =
        initialDiscoveryExport !== undefined
          ? new Discovery({ imported: initialDiscoveryExport })
          : new Discovery();

      setDiscovery(activeWallet.walletId, newDiscovery);
    }
    //Note there is no cleanup. Discovery is closed on logout
  }, [
    initialDiscoveryExport,
    activeWallet?.walletId,
    electrumAPI,
    esploraAPI,
    activeWallet?.networkId,
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
        activeWallet?.networkId === 'TAPE'
      ) {
        const newExplorerMainnet = new EsploraExplorer({
          url: mainnetEsploraApi,
          timeout: settings?.NETWORK_TIMEOUT
        }); //explorer.connect performed in NetSTatusContext
        setExplorerMainnet(newExplorerMainnet);
      }
    } else {
      const network =
        activeWallet?.networkId && networkMapping[activeWallet.networkId];
      if (
        network &&
        mainnetElectrumApi &&
        !explorerMainnet &&
        activeWallet.networkId === 'TAPE'
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
    activeWallet?.networkId,
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
    (activeWallet?.networkId !== 'TAPE' || explorerMainnetReachable);

  useEffect(() => {
    //Wait until both explorers have been created
    if (
      discovery?.getExplorer() &&
      (activeWallet?.networkId !== 'TAPE' || explorerMainnet)
    ) {
      //makes sure the netStatus is reset. A reset is already done on logOut.
      //But we do it here again just in case we are getting a new explorers
      //For example in case the user changes the Electrum Server on the Settings
      //Screen and this hook is therefore triggered with a new explorer.
      netStatusReset();
      netStatusInit({
        networkId: activeWallet?.networkId,
        explorer: discovery.getExplorer(),
        generate204API,
        generate204CbVaultsReaderAPI,
        generate204WatchtowerAPI,
        //For Tape, we need to make sure blockstream esplora is working:
        explorerMainnet:
          activeWallet?.networkId === 'TAPE' ? explorerMainnet : undefined,
        generate204APIExternal:
          //There's no need to check the internet with an external server (typically
          //using google) when using a REGTEST wallet
          activeWallet?.networkId &&
          activeWallet.networkId !== 'REGTEST' &&
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
    activeWallet?.networkId,
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
      canInitCipheredDataStorage
        ? `VAULTS_${activeWallet.walletId}`
        : undefined,
      SERIALIZABLE,
      DEFAULT_VAULTS,
      undefined,
      activeWallet && walletsDataCipherKey[activeWallet.walletId]
    );

  const [
    vaultsStatuses,
    setVaultsStatuses,
    ,
    clearVaultsStatusesCache,
    vaultsStatusesStorageStatus
  ] = useStorage<VaultsStatuses>(
    canInitCipheredDataStorage
      ? `VAULTS_STATUSES_${activeWallet.walletId}`
      : undefined,
    SERIALIZABLE,
    DEFAULT_VAULTS_STATUSES,
    undefined,
    activeWallet && walletsDataCipherKey[activeWallet.walletId]
  );

  const [accounts, setAccounts, , clearAccountsCache, accountsStorageStatus] =
    useStorage<Accounts>(
      canInitCipheredDataStorage
        ? `ACCOUNTS_${activeWallet.walletId}`
        : undefined,
      SERIALIZABLE,
      DEFAULT_ACCOUNTS,
      undefined,
      activeWallet && walletsDataCipherKey[activeWallet.walletId]
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
      const network =
        activeWallet?.networkId && networkMapping[activeWallet.networkId];
      if (
        tipHeight === undefined ||
        !discovery ||
        !network ||
        activeWallet?.walletId === undefined
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
        setUtxosData(activeWallet.walletId, walletUtxosData);
        setHistoryData(activeWallet.walletId, walletHistoryData);
      });
      //Save to disk.
      const exportedData = discovery.export();
      await setDiscoveryExport(exportedData);
    },
    [
      discovery,
      activeWallet?.networkId,
      setUtxosData,
      setHistoryData,
      activeWallet?.walletId,
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
    signersStorageEngine: activeWallet?.signersStorageEngine,
    isSignersDiskSynchd: signersStorageStatus.isDiskSynchd,
    settingsErrorCode: settingsStorageStatus.errorCode,
    signersErrorCode: signersStorageStatus.errorCode,
    walletsErrorCode: walletsStorageStatus.errorCode,
    discoveryExportErrorCode: discoveryExportStorageStatus.errorCode,
    vaultsErrorCode: vaultsStorageStatus.errorCode,
    vaultsStatusesErrorCode: vaultsStatusesStorageStatus.errorCode,
    accountsErrorCode: accountsStorageStatus.errorCode
  });
  const isCorrupted = getIsCorrupted({
    wallet: activeWallet,
    signers,
    isSignersDiskSynchd: signersStorageStatus.isDiskSynchd,
    signersErrorCode: signersStorageStatus.errorCode,
    vaults,
    isVaultsSynchd: vaultsStorageStatus.isSynchd,
    vaultsStatuses,
    isVaultsStatusesSynchd: vaultsStatusesStorageStatus.isSynchd,
    accounts,
    isAccountsSynchd: accountsStorageStatus.isSynchd
  });

  /** When all wallet related data is synchronized and without any errors.
   * Use this variable to add the wallet into the wallets storage
   */
  const isWalletDiskSynched =
    activeWallet?.walletId === walletIdRef.current &&
    walletsStorageStatus.isDiskSynchd &&
    discoveryExportStorageStatus.isDiskSynchd &&
    signersStorageStatus.isDiskSynchd &&
    vaultsStorageStatus.isDiskSynchd &&
    vaultsStatusesStorageStatus.isDiskSynchd &&
    accountsStorageStatus.isDiskSynchd &&
    walletsStorageStatus.errorCode === false &&
    discoveryExportStorageStatus.errorCode === false &&
    signersStorageStatus.errorCode === false &&
    vaultsStorageStatus.errorCode === false &&
    vaultsStatusesStorageStatus.errorCode === false &&
    accountsStorageStatus.errorCode === false &&
    !isCorrupted;

  useEffect(() => {
    if (isWalletDiskSynched) {
      if (!activeWallet) throw new Error('wallet should be set when ready');
      if (!wallets) throw new Error('wallets should be set when ready');
      if (!shallowEqualObjects(activeWallet, wallets[activeWallet.walletId])) {
        setWallets({ ...wallets, [activeWallet.walletId]: activeWallet });
      }
    }
  }, [setWallets, isWalletDiskSynched, activeWallet, wallets]);

  /**
   * Handles incoming notification data from the watchtower service.
   * Validates the data, adds new notifications to the wallet state,
   * and triggers acknowledgments for existing notifications.
   */
  const handleWatchtowerNotification = useCallback(
    (
      pushToken: string,
      data: Record<string, unknown>,
      /** for debugging purposes: who called handleWatchtowerNotification **/
      source:
        | 'PRESENT_IN_TRAY'
        | 'FETCH'
        | 'OPENED'
        | 'FOREGROUND_LISTENER'
        | 'TAPPED'
    ) => {
      if (!data || typeof data !== 'object') {
        console.warn(
          `Malformed data in notification: ${JSON.stringify(data, null, 2)} from ${source}.`
        );
        return;
      }

      const watchtowerId = data['watchtowerId'];
      if (typeof watchtowerId !== 'string' || watchtowerId === '') {
        console.warn(
          `Malformed watchtowerId in notification: ${watchtowerId} from ${source}.`
        );
        return;
      }

      const walletUUID = data['walletUUID'];
      if (typeof walletUUID !== 'string' || walletUUID === '') {
        console.warn(
          `Malformed walletUUID in notification: ${walletUUID} from ${source}.`
        );
        return;
      }

      const vaultId = data['vaultId'] as string;
      if (typeof vaultId !== 'string' || vaultId === '') {
        console.warn(
          `Malformed vaultId in notification: ${vaultId} from ${source}.`
        );
        return;
      }

      const firstDetectedAt = data['firstDetectedAt'];
      if (typeof firstDetectedAt !== 'number') {
        console.warn(
          `Malformed firstDetectedAt in notification: ${firstDetectedAt} from ${source}.`
        );
        return;
      }

      const txid = data['txid'];
      if (typeof txid !== 'string' || txid === '') {
        console.warn(`Malformed txid in notification: ${txid} from ${source}.`);
        return;
      }

      // Find the wallet with matching UUID
      const matchingWallet = Object.values(wallets || {}).find(
        matchingWallet => matchingWallet.walletUUID === walletUUID
      );

      // Handle unknown wallet UUIDs (from deleted wallets or old installations)
      if (!matchingWallet) {
        console.warn(
          `Received notification for unknown wallet UUID: ${walletUUID} from ${source}. This could be from a deleted wallet or old installation.`
        );
        sendAckToWatchtower({
          pushToken,
          watchtowerAPI: watchtowerId,
          vaultId,
          networkTimeout
        });
        setOrphanedWatchtowerWalletUUIDs(prev => new Set(prev).add(walletUUID));
        goBackToWallets();
      } else {
        const existingNotifications = matchingWallet.notifications || {};
        const existingWatchtowerNotifications =
          existingNotifications[watchtowerId] || {};

        // Check if we already have a notification for this vault from
        // this watchtower
        if (existingWatchtowerNotifications[vaultId]) {
          if (existingWatchtowerNotifications[vaultId].acked === true)
            sendAckToWatchtower({
              pushToken,
              watchtowerAPI: watchtowerId,
              vaultId,
              networkTimeout
            });
        } else {
          // Notification doesn't exist yet, add it.
          // Check if this vault was triggered from another device
          const vaultStatus = vaultsStatuses?.[vaultId];
          const triggerPushTime = vaultStatus?.triggerPushTime;

          // If there's no triggerPushTime or it's not close to firstDetectedAt,
          // then this trigger came from another device
          const PUSH_TIME_THRESHOLD = 5 * 60; // in seconds
          const wasTriggeredFromThisDevice =
            triggerPushTime !== undefined &&
            Math.abs(triggerPushTime - firstDetectedAt) < PUSH_TIME_THRESHOLD;

          if (!wasTriggeredFromThisDevice) {
            console.warn(
              `Going back to wallets for notification not triggered from this device from ${source}`
            );
            goBackToWallets();
          }

          // Create new wallet object with updated notifications
          const updatedWallet = {
            ...matchingWallet,
            notifications: {
              ...existingNotifications,
              [watchtowerId]: {
                ...existingWatchtowerNotifications,
                [vaultId]: {
                  firstAttemptAt: firstDetectedAt,
                  acked: false
                }
              }
            }
          };

          // Update wallets storage
          batchedUpdates(() => {
            setWallets({
              ...wallets,
              [matchingWallet.walletId]: updatedWallet
            });
            if (updatedWallet.walletId === activeWallet?.walletId)
              setActiveWallet(updatedWallet);
          });
        }
      }
    },
    [
      activeWallet?.walletId,
      wallets,
      setWallets,
      networkTimeout,
      goBackToWallets,
      vaultsStatuses
    ]
  );

  const clearOrphanedWatchtowerWalletUUIDs = useCallback(async () => {
    //FIXME: If you want to dismiss, then dismiss all of them??
    setOrphanedWatchtowerWalletUUIDs(new Set());
  }, []);

  // Refs for notification listeners
  const notificationListenerRef = useRef<Subscription>();
  const responseListenerRef = useRef<Subscription>();

  // Set up watchtower notification handling & polling for pending notifications
  const lastNotificationResponseHandledRef = useRef<boolean>(false);
  // Possible values for watchtowerPollTimeoutRef:
  //   'PENDING'  - Polling has not started yet.
  //   'CHECKING' - Currently performing the initial polling (determining if
  //   all APIs are OK or if further polling is needed).
  //   'COMPLETE' - All watchtower APIs have been checked and no further
  //   polling is required.
  //   NodeJS.Timeout - A polling retry is scheduled and waiting to run.
  const watchtowerPollTimeoutRef = useRef<
    NodeJS.Timeout | 'PENDING' | 'CHECKING' | 'COMPLETE'
  >('PENDING');

  useEffect(() => {
    if (
      !pushToken ||
      !walletsStorageStatus.isSynchd ||
      !settingsStorageStatus.isSynchd ||
      !canReceiveNotifications
    )
      return;

    // Handle the notification (tap) that may have launched the app.
    // getLastNotificationResponseAsync() only returns a response if the user
    // actually tapped a notification to open the app. It will resolve to null
    // if the app was started by any other means (e.g. launched from the home
    // screen or brought to the foreground via the app switcher).
    //
    // Note: tapping a notification automatically removes it from the OS
    // notification center, so getPresentedNotificationsAsync
    // won’t include that tapped alert.
    // Also getPresentedNotificationsAsync does not include data!
    if (lastNotificationResponseHandledRef.current === false) {
      getLastNotificationResponseAsync()
        .then(response => {
          if (response) {
            handleWatchtowerNotification(
              pushToken,
              response.notification.request.content.data,
              'OPENED'
            );
          }
          lastNotificationResponseHandledRef.current = true;
        })
        .catch(error => {
          console.warn('Error getting last notification response:', error);
          lastNotificationResponseHandledRef.current = true;
        });
    }
    // Listen for notifications received while app is in foreground
    notificationListenerRef.current = addNotificationReceivedListener(
      notification => {
        handleWatchtowerNotification(
          pushToken,
          notification.request.content.data,
          'FOREGROUND_LISTENER'
        );
      }
    );

    // Listen for user interaction with notifications (tapping the notification)
    responseListenerRef.current = addNotificationResponseReceivedListener(
      response => {
        handleWatchtowerNotification(
          pushToken,
          response.notification.request.content.data,
          'TAPPED'
        );
      }
    );

    // Check pending notifications that may have arrived while the app was
    // closed (killed).
    // This is the only possible way to retrieve them if the app was killed
    // (force-stopped) and the user did not tap on the notification.

    // One cold fallback for force-stop / killed silent gap
    // (only needed because OS won’t deliver when force-stopped/killed)
    //FIXME: move this on outer scope and add an abort controller that
    //also controls the polling
    function runFetchAndPoll(pushToken: string) {
      // Track which networks are we using.
      const watchtowerNetworkIdsToCheck = Object.values(wallets || [])
        .map(w => w.networkId)
        .filter((netId, i, arr) => netId && arr.indexOf(netId) === i); // del duplicates
      if (watchtowerPollTimeoutRef.current === 'PENDING' && wallets) {
        // Defensive: prevents duplicate polling if effect runs again before poll starts

        watchtowerPollTimeoutRef.current = 'CHECKING';
        // start with all networks marked “failed”
        let failedNetworkIds = [...watchtowerNetworkIdsToCheck];
        const poll = async () => {
          for (const networkId of [...failedNetworkIds]) {
            const watchtowerAPI = getAPIs(networkId, settings).watchtowerAPI;
            if (watchtowerAPI === undefined)
              throw new Error(
                `Network ${networkId} does not have a valid watchtower api`
              );
            const unackedNotifications =
              await fetchWatchtowerUnackedNotifications({
                pushToken,
                networkTimeout,
                watchtowerAPI
              });

            if (unackedNotifications !== null) {
              // Process each unacked notification
              for (const notification of unackedNotifications) {
                handleWatchtowerNotification(
                  pushToken,
                  notification, // Pass the whole notification object
                  'FETCH'
                );
              }
              failedNetworkIds = failedNetworkIds.filter(a => a !== networkId); // remove from failed list
            }
          }
          // if anything still failed, retry in 60s
          if (failedNetworkIds.length > 0)
            watchtowerPollTimeoutRef.current = setTimeout(poll, 60000);
          else watchtowerPollTimeoutRef.current = 'COMPLETE';
        };
        // do the first fetch right away
        poll();
      }
    }
    runFetchAndPoll(pushToken);

    // Clean up notification listeners and polling interval on unmount
    return () => {
      // Clean up notification listeners
      if (notificationListenerRef.current) {
        notificationListenerRef.current.remove();
        notificationListenerRef.current = undefined;
      }
      if (responseListenerRef.current) {
        responseListenerRef.current.remove();
        responseListenerRef.current = undefined;
      }
    };
  }, [
    pushToken,
    settings,
    networkTimeout,
    wallets,
    handleWatchtowerNotification,
    walletsStorageStatus.isSynchd,
    settingsStorageStatus.isSynchd
  ]);

  //Clean up of polling done only once:
  useEffect(() => {
    return () => {
      if (
        watchtowerPollTimeoutRef.current !== 'PENDING' &&
        watchtowerPollTimeoutRef.current !== 'COMPLETE'
      ) {
        clearTimeout(watchtowerPollTimeoutRef.current);
        watchtowerPollTimeoutRef.current = 'COMPLETE';
      }
    };
  }, []);

  /**
   * Important, to logOut from wallet, wallet (and therefore walletId) must
   * be the current state. It's not possible to pass walletId as argument since
   * we must use the clear functions set in useStorage when created with the current
   * wallet
   */
  const logOut = useCallback(() => {
    if (activeWallet?.walletId !== undefined) {
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
        clearDiscovery(activeWallet.walletId);
        clearUtxosData(activeWallet.walletId);
        clearHistoryData(activeWallet.walletId);
        clearSynchingBlockchain(activeWallet.walletId);
        clearNewSigners(activeWallet.walletId);
        clearSignersCipherKey(activeWallet.walletId);
        clearDataCipherKey(activeWallet.walletId);
        setActiveWallet(undefined);
        walletIdRef.current = undefined;
        prevAccountsSyncRef.current = undefined;
        initialDiscoveryExportRef.current = 'NOT_SYNCHD';
        isUserTriggeredSync.current = false;
        isFeeEstimatesSynchdRef.current = false;
        isGeneratedRef.current = false;
        netStatusReset(); //Stop checking network, also close all explorer instances
      });
    }
  }, [
    netStatusReset,
    activeWallet?.walletId,
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
    async (idToDelete: number) => {
      if (idToDelete !== activeWallet?.walletId)
        throw new Error(`Cannot delete non-active wallet ${idToDelete}`);
      if (!wallets) throw new Error(`Cannot delete non-existing wallets`);
      const authenticationPrompt = t('app.secureStorageAuthenticationPrompt');
      logOut(); //clears the cache - Super important!!!
      await Promise.all([
        deleteAsync(
          `SIGNERS_${idToDelete}`,
          activeWallet.signersStorageEngine,
          authenticationPrompt
        ),
        deleteAsync(`DISCOVERY_${idToDelete}`),
        deleteAsync(`VAULTS_${idToDelete}`),
        deleteAsync(`VAULTS_STATUSES_${idToDelete}`),
        deleteAsync(`ACCOUNTS_${idToDelete}`)
      ]);
      const { [idToDelete]: walletToDelete, ...remainingWallets } = wallets;
      void walletToDelete;
      let walletsPromise: Promise<void> | undefined;

      batchedUpdates(() => {
        setActiveWallet(undefined);
        walletsPromise = setWallets(remainingWallets);
      });
      if (!walletsPromise) throw new Error('walletsPromise not set');
      await walletsPromise;
    },
    [
      logOut,
      t,
      activeWallet?.walletId,
      activeWallet?.signersStorageEngine,
      setWallets,
      wallets
    ]
  );

  /**
   * isGeneratedRef.current will be true when the mnemonic is created in the App
   * (not imported). This does not need to be state since rendering does not
   * depend on it. It will be used in useFaucet together with isFirstLogin,
   * which is the state that conditions the rendering.
   */
  const isGeneratedRef = useRef<boolean>(false);
  const onWallet = useCallback(
    async ({
      wallet: walletDst,
      newSigners: newSignersDst,
      signersCipherKey: signersCipherKeyDst,
      isGenerated
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
      /**
       * isGenerated will be true when the mnemonic is created in the App
       * (not imported)
       */
      isGenerated?: boolean;
    }) => {
      if (
        walletIdRef.current !== undefined &&
        walletIdRef.current !== walletDst.walletId
      ) {
        console.warn('Wallet swap request without previous logOut');
        logOut();
      }
      if (
        walletIdRef.current !== undefined &&
        wallets &&
        !wallets[walletIdRef.current] //this means the wallet was not really created.
      ) {
        console.warn('Wallet creation attempt with previous one uncleared.');
        logOut();
      }
      walletIdRef.current = walletDst.walletId;
      if (newSignersDst) {
        //Make sure we don't have values from previous app installs using the same id?
        const authenticationPrompt = t('app.secureStorageAuthenticationPrompt');
        await Promise.all([
          deleteAsync(
            `SIGNERS_${walletDst.walletId}`,
            walletDst.signersStorageEngine,
            authenticationPrompt
          ),
          deleteAsync(`DISCOVERY_${walletDst.walletId}`),
          deleteAsync(`VAULTS_${walletDst.walletId}`),
          deleteAsync(`VAULTS_STATUSES_${walletDst.walletId}`),
          deleteAsync(`ACCOUNTS_${walletDst.walletId}`)
        ]);
        if (walletIdRef.current !== walletDst.walletId) {
          logOut();
          return;
        }
        //in addition to deleteAsync caches are cleared with logOut - see above
      }
      batchedUpdates(() => {
        if (newSignersDst) setNewSigners(walletDst.walletId, newSignersDst);
        setSignersCipherKey(walletDst.walletId, signersCipherKeyDst);
        if (typeof isGenerated !== 'undefined')
          isGeneratedRef.current = isGenerated;
        setActiveWallet(prevWallet => {
          //Net status depends on the wallet (explorer, ...); so reset it ONLY when it changes
          if (prevWallet && prevWallet.walletId !== walletDst.walletId)
            netStatusReset();
          return walletDst;
        });
      });
    },
    [t, setNewSigners, setSignersCipherKey, netStatusReset, logOut, wallets]
  );

  //isFirstLogin will be false until the data is ready.
  //For example readwrite errors will prevent this from being true.
  const isFirstLogin =
    isWalletDiskSynched &&
    !!activeWallet &&
    !!walletsNewSigners[activeWallet.walletId];

  useEffect(() => {
    const network =
      activeWallet?.networkId && networkMapping[activeWallet.networkId];
    if (
      activeWallet?.walletId !== undefined &&
      signers &&
      network &&
      activeWallet?.encryption === 'SEED_DERIVED'
    ) {
      const signer = signers[0];
      if (!signer) throw new Error('signer unavailable');
      const fetchDataCipherKey = async () => {
        const walletDataCipherKey = await getDataCipherKey({
          signer,
          network
        });
        if (activeWallet?.walletId !== walletIdRef.current) return;
        setDataCipherKey(activeWallet?.walletId, walletDataCipherKey);
      };
      fetchDataCipherKey();
    }
  }, [
    activeWallet?.walletId,
    activeWallet?.encryption,
    setDataCipherKey,
    signers,
    activeWallet?.networkId
  ]);

  //Tries to initialize wallet utxos and history from the discovery object we
  //got from disk ASAP (only if not set)
  useEffect(() => {
    if (
      activeWallet?.walletId !== undefined &&
      !walletsUtxosData[activeWallet.walletId] &&
      !walletsHistoryData[activeWallet.walletId] &&
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
    activeWallet?.walletId,
    walletsUtxosData,
    walletsHistoryData
  ]);

  const getNextChangeDescriptorWithIndex = useCallback(
    async (accounts: Accounts) => {
      const network =
        activeWallet?.networkId && networkMapping[activeWallet.networkId];
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
    [activeWallet?.networkId, discovery]
  );

  const getNextReceiveDescriptorWithIndex = useCallback(
    async (accounts: Accounts) => {
      const network =
        activeWallet?.networkId && networkMapping[activeWallet.networkId];
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
    [activeWallet?.networkId, discovery]
  );

  const getUnvaultKey = useCallback(async () => {
    const network =
      activeWallet?.networkId && networkMapping[activeWallet.networkId];
    if (!network) throw new Error('Network not ready');
    if (!signers) throw new Error('Signers not ready');
    const signer = signers[0];
    if (!signer) throw new Error('signer unavailable');
    return await createUnvaultKey({ signer, network });
  }, [activeWallet?.networkId, signers]);

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

  const walletTitle =
    activeWallet && wallets && walletTitleFn(activeWallet, wallets, t);

  const setVaultNotificationAcknowledged = useCallback(
    (vaultId: string) => {
      if (!watchtowerAPI || !wallets || !activeWallet)
        throw new Error(
          "Couldn't setVaultNotificationAcknowledged. Not ready."
        );
      const currentNotification =
        activeWallet.notifications?.[watchtowerAPI]?.[vaultId];
      if (currentNotification?.acked === true) return;

      const updatedActiveWallet = {
        ...activeWallet,
        notifications: {
          ...activeWallet.notifications,
          [watchtowerAPI]: {
            ...activeWallet.notifications?.[watchtowerAPI],
            [vaultId]: {
              ...currentNotification,
              acked: true
            }
          }
        }
      };
      const updatedWallets = {
        ...wallets,
        [activeWallet.walletId]: updatedActiveWallet
      };

      batchedUpdates(() => {
        setActiveWallet(updatedActiveWallet);
        setWallets(updatedWallets);
      });
    },
    [watchtowerAPI, wallets, activeWallet, setWallets]
  );

  /**
   * Registers vaults with the watchtower service and updates their
   * registration status (registeredWatchtowers field in vaultStatus).
   *
   * If all vaults have already been registered this function has no effect.
   *
   * Updates the vaultsStatuses state if the registration process resulted in
   * changes.
   */
  const syncWatchtowerRegistration = useCallback(
    async (pushToken: string) => {
      // Ensure all required data is available before proceeding
      if (!vaults || !vaultsStatuses || activeWallet?.walletId === undefined) {
        console.warn(
          'syncWatchtowerRegistration: Skipping due to missing data.'
        );
        return;
      }

      const walletUUID = activeWallet?.walletUUID;
      try {
        if (!watchtowerAPI || !networkTimeout || !walletTitle || !walletUUID)
          throw new Error('Required data for watchtower registration missing');
        const { result: newWatchedVaults } = await netRequest({
          errorMessage: (message: string) =>
            t('app.watchtowerError', { message }),
          whenToastErrors: 'ON_ANY_ERROR',
          func: () => {
            const rawLocale = settings?.LOCALE ?? defaultSettings.LOCALE;
            const locale =
              rawLocale === 'default'
                ? getLocales()[0]?.languageTag ?? 'en'
                : rawLocale;
            return watchVaults({
              pushToken,
              watchtowerAPI,
              vaults,
              vaultsStatuses,
              networkTimeout,
              walletName: walletTitle,
              locale,
              walletUUID
            });
          }
        });

        let updatedVaultsStatuses = vaultsStatuses;
        if (newWatchedVaults?.length) {
          let alreadyMutated = false;
          for (const vaultId of newWatchedVaults) {
            const status = vaultsStatuses[vaultId];
            if (!status)
              throw new Error('Unset status for vaultId: ' + vaultId);
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
    },
    [
      activeWallet?.walletUUID,
      vaults,
      vaultsStatuses,
      activeWallet?.walletId,
      setVaultsStatuses,
      netRequest,
      networkTimeout,
      settings?.LOCALE,
      t,
      watchtowerAPI,
      walletTitle
    ]
  );

  /**
   * Initiates the blockchain synchronization process. If netStatus has errors
   * it tries first to check the network .
   */
  const sync = useCallback(async () => {
    if (activeWallet?.walletId === undefined)
      throw new Error('Cannot sync an unset wallet');

    // Track `prevAccounts` to detect changes and manage state between syncs.
    const prevAccounts = prevAccountsSyncRef.current;
    prevAccountsSyncRef.current = accounts;

    const isUserTriggered = isUserTriggeredSync.current;
    isUserTriggeredSync.current = false;
    const whenToastErrors = isUserTriggeredSync
      ? 'ON_ANY_ERROR'
      : 'ON_NEW_ERROR';

    const signer = signers?.[0];
    const network =
      activeWallet.networkId && networkMapping[activeWallet.networkId];

    if (
      walletTitle !== undefined &&
      isWalletDiskSynched &&
      activeWallet.networkId &&
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
        `[${new Date().toISOString()}] [Sync] Wallet: ${activeWallet.walletId} | NetReady: ${netReady} | UserTriggered: ${isUserTriggered} | network: ${activeWallet.networkId}`
      );

      if (netReady === false && isUserTriggered) {
        //This strategy only checks netStatus changes when we're sure the
        //network is down and the user is requesting it. This is because this is
        //an expensive operation and sync may also be called automatically on
        //dependencies of isWalletDiskSynched, netReady, callback functions and so on...
        //No prob if netStatusUpdate fails.
        const ns = await netStatusUpdate({ whenToastErrors });
        if (activeWallet.walletId !== walletIdRef.current) {
          //do this after each await
          setSyncingBlockchain(activeWallet.walletId, false);
          return;
        }
        //wait until next execution thread to allow netStatusUpdate
        //to update internal states, which will need to be ready for the netRequest
        //calls below:
        await new Promise(resolve => setTimeout(resolve, 100));
        if (activeWallet.walletId !== walletIdRef.current) {
          //do this after each await
          setSyncingBlockchain(activeWallet.walletId, false);
          return;
        }
        if (!ns?.explorerReachable) {
          //also don't continue if explorer is not reachable
          setSyncingBlockchain(activeWallet.walletId, false);
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
        if (activeWallet.walletId !== walletIdRef.current) {
          //do this after each await
          setSyncingBlockchain(activeWallet.walletId, false);
          return;
        }
        const updatedTipHeight = (await updateTipStatus({ whenToastErrors }))
          ?.blockHeight;
        if (activeWallet.walletId !== walletIdRef.current) {
          //do this after each await
          setSyncingBlockchain(activeWallet.walletId, false);
          return;
        }
        if (!updatedTipHeight) {
          //also don't continue if we cannot get a valid updatedTipHeight
          setSyncingBlockchain(activeWallet.walletId, false);
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
              networkId: activeWallet.networkId,
              cBVaultsReaderAPI,
              vaults
            })
        });
        if (activeWallet.walletId !== walletIdRef.current) {
          //do this after each await
          setSyncingBlockchain(activeWallet.walletId, false);
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
        if (activeWallet.walletId !== walletIdRef.current) {
          //do this after each await
          setSyncingBlockchain(activeWallet.walletId, false);
          return;
        }
        if (!freshVaultsStatuses) {
          //also don't continue if fetching vaults statuses failed as this would
          //create unsynched vaults & vaultsStatuses
          setSyncingBlockchain(activeWallet.walletId, false);
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
            if (activeWallet.walletId !== walletIdRef.current) {
              //do this after each await
              setSyncingBlockchain(activeWallet.walletId, false);
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
            if (activeWallet.walletId !== walletIdRef.current) {
              //do this after each await
              setSyncingBlockchain(activeWallet.walletId, false);
              return;
            }
            if (fetchStandardStatus !== 'SUCCESS') {
              //also don't continue if discovery fails
              setSyncingBlockchain(activeWallet.walletId, false);
              return;
            }
            const usedAccounts = discovery.getUsedAccounts();
            if (usedAccounts.length)
              for (const usedAccount of usedAccounts)
                updatedAccounts[usedAccount] = { discard: false };
            else {
              const defaultAccount = await getDefaultAccount(signers, network);
              if (activeWallet.walletId !== walletIdRef.current) {
                //do this after each await
                setSyncingBlockchain(activeWallet.walletId, false);
                return;
              }
              updatedAccounts[defaultAccount] = { discard: false };
            }
          }
          //TAGsijufnviudsgndsf
          //Early setAccounts so that the buttons show up and quick faucet.
          //Set it even if utxos are not set yet (using setUtxosHistoryExport).
          //However, undo this setAccounts if something goes wrong below.
          //Keep it ONLY after discovery.fetch below is ok;
          //otherwise we may end up setting partial states:
          //  -accounts set
          //  -accounts corresponding fetched utxos NOT set:
          //    fetched utxos are stored in discovery with setUtxosHistoryExport
          //This problem can appear when logging out immediatelly after
          //new fauceted wallet. The faucet is triggered on "accounts" change
          //but then the discovery object is never set. Next time we open
          //the wallet, there'll be a mismatch and discovery will complain
          //when trying to compute balances of unfetched utxos.
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
        if (activeWallet.walletId !== walletIdRef.current) {
          //do this after each await
          batchedUpdates(() => {
            setSyncingBlockchain(activeWallet.walletId, false);
            setAccounts(accounts); //Read TAGsijufnviudsgndsf
          });
          return;
        }
        if (fetchStatus !== 'SUCCESS') {
          //also don't continue if discovery fails
          batchedUpdates(() => {
            setSyncingBlockchain(activeWallet.walletId, false);
            setAccounts(accounts); //Read TAGsijufnviudsgndsf
          });
          return;
        }

        //Update states:
        batchedUpdates(() => {
          //Already upated Read TAGsijufnviudsgndsf
          //if (accounts !== updatedAccounts) setAccounts(updatedAccounts);
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
        if (activeWallet.walletId !== walletIdRef.current) {
          setSyncingBlockchain(activeWallet.walletId, false);
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

    setSyncingBlockchain(activeWallet.walletId, false);
  }, [
    walletTitle,
    netRequest,
    netToast,
    netStatusUpdate,
    isWalletDiskSynched,
    netReady,
    updateBtcFiat,
    updateFeeEstimates,
    updateTipStatus,
    setUtxosHistoryExport,
    setAccounts,
    setSyncingBlockchain,
    activeWallet?.walletId,
    accounts,
    t,
    discovery,
    setVaults,
    setVaultsStatuses,
    vaults,
    vaultsStatuses,
    activeWallet?.networkId,
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
    if (
      activeWallet?.walletId !== undefined &&
      walletsSyncingBlockchain[activeWallet.walletId]
    )
      sync();
  }, [walletsSyncingBlockchain, activeWallet?.walletId, sync]);
  //This function is passed in the context so that users can sync
  const syncBlockchain = useCallback(() => {
    if (activeWallet?.walletId !== undefined) {
      isUserTriggeredSync.current = true;
      setSyncingBlockchain(activeWallet.walletId, true);
    }
  }, [activeWallet?.walletId, setSyncingBlockchain]);
  //Automatically set syncingBlockchain to true on new walletId: auto sync
  //on new activeWallet. Make sure explorer and api (vault checking) is reachable
  //since otherwise sync()
  //won't do anything as it's necessary.
  //Also it will auto-trigger update on a new block
  useEffect(() => {
    if (
      activeWallet?.walletId !== undefined &&
      isWalletDiskSynched &&
      netReady
    ) {
      setSyncingBlockchain(activeWallet.walletId, true);
    }
  }, [
    activeWallet?.walletId,
    setSyncingBlockchain,
    isWalletDiskSynched,
    netReady,
    tipHeight
  ]);

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
      if (activeWallet?.walletId === undefined)
        throw new Error(
          'walletId undefined in pushVaultRegisterWTAndUpdateStates'
        );

      // Create new vault
      if (vaults[vault.vaultId])
        throw new Error(`Vault for ${vault.vaultId} already exists`);
      if (vaultsStatuses[vault.vaultId])
        throw new Error(`VaultStatus for ${vault.vaultId} already exists`);

      const newVaults = { ...vaults, [vault.vaultId]: vault };
      const newVaultsStatuses = {
        ...vaultsStatuses,
        [vault.vaultId]: {
          vaultPushTime: Math.floor(Date.now() / 1000),
          vaultTxBlockHeight: 0
        }
      };

      await pushTx(vault.vaultTxHex);

      const stateUpdatePromises: Array<Promise<void>> = [];
      batchedUpdates(() => {
        stateUpdatePromises.push(
          setVaults(newVaults),
          setVaultsStatuses(newVaultsStatuses),
          setUtxosHistoryExport(
            newVaults,
            newVaultsStatuses,
            accounts,
            tipHeight
          )
        );
      });
      // Wait for all state updates to complete
      await Promise.all(stateUpdatePromises);
    },
    [
      activeWallet?.walletId,
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
    pushToken,
    setPushToken,
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
    networkId: activeWallet?.networkId,
    feeEstimates,
    tipStatus,
    utxosData: activeWallet && walletsUtxosData[activeWallet.walletId],
    historyData: activeWallet && walletsHistoryData[activeWallet.walletId],
    pushVaultRegisterWTAndUpdateStates,
    txPushAndUpdateStates,
    syncBlockchain,
    syncingBlockchain: !!(
      activeWallet && walletsSyncingBlockchain[activeWallet.walletId]
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
    wallet: activeWallet,
    walletStatus: { isCorrupted, storageAccess: storageAccessStatus },
    orphanedWatchtowerWalletUUIDs,
    clearOrphanedWatchtowerWalletUUIDs,
    requiresPassword:
      (activeWallet?.signersEncryption === 'PASSWORD' &&
        !walletsSignersCipherKey[activeWallet.walletId]) ||
      (typeof signersStorageStatus.errorCode !== 'boolean' &&
        // DecryptError is most probably the user entered a bad password
        signersStorageStatus.errorCode === 'DecryptError'),
    logOut,
    deleteWallet,
    onWallet,
    isFirstLogin,
    isGenerated: isGeneratedRef.current,
    setVaultNotificationAcknowledged
  };
  return (
    <WalletContext.Provider value={contextValue}>
      {children}
    </WalletContext.Provider>
  );
};
export const WalletProvider = React.memo(WalletProviderRaw);
