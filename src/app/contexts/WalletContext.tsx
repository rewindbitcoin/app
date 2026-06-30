// Copyright (C) 2025 Jose-Luis Landabaso - https://rewindbitcoin.com
// Licensed under the GNU GPL v3 or later. See the LICENSE file for details.

import {
  type Vault,
  type Vaults,
  type VaultStatus,
  type VaultsStatuses,
  type UtxosData,
  type HistoryData,
  type TxHistory,
  fetchVaultsStatuses,
  getTxosDataFromVaults,
  getHotDescriptors,
  areVaultsSynched,
  getHistoryData
} from '../lib/vaults';
import { v4 as uuid } from 'uuid';
import { useNavigation } from '@react-navigation/native';
import { WALLETS } from '../screens';
import {
  type Subscription,
  addNotificationReceivedListener,
  addNotificationResponseReceivedListener,
  dismissAllNotificationsAsync,
  getLastNotificationResponseAsync,
  setBadgeCountAsync
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
import { networkMapping, type NetworkId } from '../lib/network';
import {
  createUnvaultKeyExpression,
  getDefaultAccount,
  getMasterNode,
  parseStandardAccount,
  selectPreferredAccount
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
  TxStatus,
  type Account,
  type DiscoveryInstance,
  type TxAttribution
} from '@bitcoinerlab/discovery';
import type { FeeEstimates } from '../lib/fees';
import { AppState, AppStateStatus, Platform } from 'react-native';
import { batchedUpdates } from '../../common/lib/batchedUpdates';
import { fetchP2PVaults } from '../lib/backup/p2p';
import { getWalletDataCipherKey } from '../lib/backup/shared';
import { parseVaultIndex } from '../lib/rewindPaths';
import {
  createOnChainBackupTx,
  fetchOnChainVaults,
  getOnChainBackupDescriptor,
  ONCHAIN_BACKUP_PRE_BROADCAST_ERROR_PREFIX
} from '../lib/backup/onchain';

type DiscoveryExport = ReturnType<DiscoveryInstance['export']>;
type DescriptorWithIndex = { descriptor: string; index: number };

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
  type BlockStatus,
  type Explorer,
  EsploraExplorer,
  ElectrumExplorer
} from '@bitcoinerlab/explorer';
import { defaultSettings } from '../lib/settings';
import { getLocales } from 'expo-localization';
import { transactionFromHex } from '../lib/bitcoin';
import {
  type Bip329SupportedType,
  type Bip329ImportResult,
  getWalletLabelText,
  parseBip329Labels,
  serializeBip329Labels,
  type WalletLabels,
  updateWalletLabelText as updateWalletLabelTextData
} from '../lib/labels';

export const WalletContext: Context<WalletContextType | null> =
  createContext<WalletContextType | null>(null);

type RangedDescriptorStatus = {
  nextIndex?: number;
  whenFetched?: { fetching: boolean; timeFetched: number };
};

const getRangedAccountFetchLogDetails = (descriptor: string) => {
  try {
    const { accountNumber, scriptType } = parseStandardAccount(
      descriptor as Account
    );
    return `script=${scriptType}, account=${accountNumber}, range=${descriptor.includes('/1/*') ? 'change' : 'receive'}`;
  } catch {
    return undefined;
  }
};

/**
 * Adds vaults found from backups without mutating the current vault map.
 * Throws if a backup returns a vault that conflicts with an existing one.
 */
const mergeRestoredVaults = ({
  currentVaults,
  restoredVaults,
  source
}: {
  currentVaults: Vaults;
  restoredVaults: Vaults | undefined;
  source: 'p2p' | 'on-chain';
}) => {
  if (!restoredVaults) return currentVaults;

  let mergedVaults = currentVaults;
  Object.entries(restoredVaults).forEach(([vaultId, restoredVault]) => {
    if (!restoredVault) return;
    if (vaultId !== restoredVault.vaultId)
      throw new Error(
        `${source} backup returned vault ${restoredVault.vaultId} under key ${vaultId}`
      );

    const currentVault = mergedVaults[vaultId];
    if (currentVault) {
      if (
        currentVault.vaultPath !== restoredVault.vaultPath ||
        currentVault.vaultTxHex !== restoredVault.vaultTxHex
      )
        throw new Error(
          `${source} backup conflicts with existing vault ${vaultId}`
        );
      return;
    }

    const pathConflict = Object.values(mergedVaults).find(
      vault => vault.vaultPath === restoredVault.vaultPath
    );
    if (pathConflict)
      throw new Error(
        `${source} backup vault ${vaultId} reuses path ${restoredVault.vaultPath} from vault ${pathConflict.vaultId}`
      );

    const txConflict = Object.values(mergedVaults).find(
      vault => vault.vaultTxHex === restoredVault.vaultTxHex
    );
    if (txConflict)
      throw new Error(
        `${source} backup vault ${vaultId} reuses vault tx from vault ${txConflict.vaultId}`
      );

    mergedVaults = { ...mergedVaults, [vaultId]: restoredVault };
  });

  return mergedVaults;
};

const logRangedAccountFetch = ({
  descriptor,
  gapLimit,
  source
}: {
  descriptor: string;
  gapLimit: number;
  source: string;
}) => {
  const details = getRangedAccountFetchLogDetails(descriptor);
  if (!details) return;
  console.log(
    `[${new Date().toISOString()}] [Wallet] Fetch ranged account (${source}): ${details}, gapLimit=${gapLimit}`
  );
};

const logRangedAccountFetches = ({
  descriptors,
  gapLimit,
  source
}: {
  descriptors: string[];
  gapLimit: number;
  source: string;
}) => {
  descriptors.forEach(descriptor =>
    logRangedAccountFetch({ descriptor, gapLimit, source })
  );
};

export type WalletContextType = {
  orphanedWatchtowerWalletUUIDs: Set<string>;
  clearOrphanedWatchtowerWalletUUIDs: () => Promise<void>;
  //pushToken: undefined before being read from storage,
  //null when read from storage but the vaule had never been set yet.
  pushToken: string | undefined;
  setPushToken: (token: string) => Promise<void>;
  getChangeDescriptorWithNextIndex: () => Promise<{
    descriptor: string;
    index: number;
  }>;
  getRangedDescriptorWithNextIndex: ({
    account,
    change
  }: {
    account: Account;
    change: 0 | 1;
  }) => {
    descriptor: string;
    nextIndex: number;
  };
  getRangedDescriptorStatus: ({
    account,
    change
  }: {
    account: Account;
    change: 0 | 1;
  }) => RangedDescriptorStatus;
  fetchRangedDescriptor: ({
    account,
    change,
    freshForSeconds
  }: {
    account: Account;
    change: 0 | 1;
    freshForSeconds?: number;
  }) => Promise<RangedDescriptorStatus>;
  trackAccount: (account: Account) => Promise<Accounts>;
  /**
   * Finds the first unused on-chain backup index for the active wallet.
   *
   * @param minimumIndex Lowest acceptable vault index. Use this to stay above
   * known legacy P2P backup indexes. Defaults to 0.
   * @returns The first vault index with no on-chain backup history.
   */
  getNextOnChainBackupIndex: (minimumIndex?: number) => Promise<number>;
  getReceiveDescriptorWithNextIndex: () => Promise<{
    descriptor: string;
    index: number;
  }>;
  fetchServiceAddress: () => Promise<{ address: string; quiet: boolean }>;
  getUnvaultKeyExpression: () => Promise<string>;
  updateVaultStatus: (vaultId: string, vaultStatus: VaultStatus) => void;
  btcFiat: number | undefined;
  feeEstimates: FeeEstimates | undefined;
  tipStatus: BlockStatus | undefined;
  utxosData: UtxosData | undefined;
  historyData: HistoryData | undefined;
  signersStorageEngineMismatch: boolean;
  signers: Signers | undefined;
  accounts: Accounts | undefined;
  discoveryReady: boolean;
  getPreferredAccount: () => Account;
  labels: WalletLabels | undefined;
  setWalletLabelText: ({
    type,
    ref,
    label
  }: {
    type: Bip329SupportedType;
    ref: string;
    label: string;
  }) => Promise<void>;
  /**
   * Writes several wallet labels without replacing existing label text.
   *
   * This is for automatic labels generated by app actions. Each entry is checked
   * against the current in-memory label set, including entries added earlier in
   * the same call. If a label already exists for that BIP-329 `(type, ref)`, it
   * is left untouched so user-entered and imported labels always win.
   */
  setWalletLabelTextsIfEmpty: (
    labels: Array<{
      type: Bip329SupportedType;
      ref: string;
      label: string;
    }>
  ) => Promise<void>;
  importBip329Labels: (jsonLines: string) => Promise<Bip329ImportResult>;
  exportBip329Labels: () => string;
  vaults: Vaults | undefined;
  vaultsStatuses: VaultsStatuses | undefined;
  networkId: NetworkId | undefined;
  fetchBlockTime: (blockHeight: number) => Promise<number | undefined>;
  pushTx: (txHex: string) => Promise<void>;
  canFetchReserveDescriptorData: boolean;
  fetchReserveDescriptorData: (params: { descriptor: string }) => Promise<
    | {
        txosData: UtxosData;
        hasUnconfirmedUtxos: boolean;
        nextIndex: number;
      }
    | undefined
  >;
  pushTxPackage: ({
    parentTxHex,
    childTxHex
  }: {
    parentTxHex: string;
    childTxHex: string;
  }) => Promise<void>;
  syncWatchtowerRegistration: ({
    pushToken,
    isUserTriggered
  }: {
    pushToken: string;
    isUserTriggered: boolean;
  }) => Promise<void>;
  fetchOutputHistory: ({
    descriptor,
    index
  }: {
    descriptor: string;
    index?: number;
  }) => Promise<TxHistory | undefined>;
  getOutputHistory: ({
    descriptor,
    index
  }: {
    descriptor: string;
    index?: number;
  }) => TxHistory | undefined;
  pushVaultRegisterWTAndUpdateStates: (
    vault: Vault,
    customWalletChangeToTrack?: DescriptorWithIndex
  ) => Promise<{ backupTxHex: string }>;
  txPushAndUpdateStates: (
    txHex: string,
    customWalletChangeToTrack?: DescriptorWithIndex
  ) => Promise<void>;
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

const UI_YIELD_ITERATION_COUNT = 1;
const UI_YIELD_ITERATION_TIME_MS = 0;
const DEFAULT_VAULTS_STATUSES: VaultsStatuses = {};
const DEFAULT_ACCOUNTS: Accounts = {};
const DEFAULT_VAULTS: Vaults = {};
const DEFAULT_LABELS: WalletLabels = {};
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
  const walletIdRef = useRef<number | undefined>(undefined);
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
  const rangedDescriptorFetchesRef = useRef(new Map<string, Promise<void>>());

  useEffect(() => {
    rangedDescriptorFetchesRef.current.clear();
  }, [discovery]);

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
      //Don't do this at the top level since it's quite slow.
      //Also it's better to pre-warmup loading in App.tsx after initial interactions
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { DiscoveryFactory } = require('@bitcoinerlab/discovery');
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
    watchtowerAPIReachable,
    cBVaultsReaderAPIReachable,
    apiReachable,
    netRequest,
    netToast,
    explorerReachable,
    explorerMainnetReachable
  } = useNetStatus();
  const isCoreNetReady =
    apiReachable &&
    explorerReachable &&
    (activeWallet?.networkId !== 'TAPE' || explorerMainnetReachable);
  const needsP2PBackupScan =
    activeWallet?.lastP2PBackupVaultIndex === undefined;

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
        generate204CbVaultsReaderAPI: needsP2PBackupScan
          ? generate204CbVaultsReaderAPI
          : undefined,
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
    needsP2PBackupScan,
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
  const accountsRef = useRef<Accounts | undefined>(accounts);
  accountsRef.current = accounts;

  // Account tracking can happen from overlapping async flows. Read/write through
  // this ref so each save includes accounts added by earlier unresolved flows.
  const persistAccounts = useCallback(
    async (updatedAccounts: Accounts) => {
      accountsRef.current = updatedAccounts;
      await setAccounts(updatedAccounts);
    },
    [setAccounts]
  );

  /**
   * Ensures one account descriptor is saved in the wallet's accounts.
   * Uses the latest accounts so two async saves do not lose each other's work.
   */
  const ensureAccountTracked = useCallback(
    async (accountToTrack: Account) => {
      const currentAccounts = accountsRef.current;
      if (!currentAccounts) throw new Error('Accounts not ready');
      if (currentAccounts[accountToTrack]) return currentAccounts;
      const updatedAccounts = {
        ...currentAccounts,
        [accountToTrack]: { discard: false }
      };
      await persistAccounts(updatedAccounts);
      return updatedAccounts;
    },
    [persistAccounts]
  );

  const [labels, setLabels, , clearLabelsCache, labelsStorageStatus] =
    useStorage<WalletLabels>(
      canInitCipheredDataStorage
        ? `LABELS_${activeWallet.walletId}`
        : undefined,
      SERIALIZABLE,
      DEFAULT_LABELS,
      undefined,
      activeWallet && walletsDataCipherKey[activeWallet.walletId]
    );
  const labelsRef = useRef<WalletLabels | undefined>(labels);
  labelsRef.current = labels;

  // Two label saves can happen before React renders again. Read labels from
  // this ref so the second save includes the first save too. In label setters,
  // use `const currentLabels = labelsRef.current` instead of reading `labels`
  // from state.
  const persistLabels = useCallback(
    async (updatedLabels: WalletLabels) => {
      labelsRef.current = updatedLabels;
      await setLabels(updatedLabels);
    },
    [setLabels]
  );

  const setWalletLabelText = useCallback(
    async ({
      type,
      ref,
      label
    }: {
      type: Bip329SupportedType;
      ref: string;
      label: string;
    }) => {
      const currentLabels = labelsRef.current;
      if (!currentLabels) throw new Error('Labels not ready');
      const updatedLabels = updateWalletLabelTextData({
        labels: currentLabels,
        type,
        ref,
        label
      });
      if (updatedLabels === currentLabels) return;
      await persistLabels(updatedLabels);
    },
    [persistLabels]
  );

  const setWalletLabelTextsIfEmpty = useCallback(
    /**
     * Adds automatic labels only for currently-unlabeled BIP-329 refs.
     *
     * The whole batch is derived from the same `labels` snapshot and persisted
     * with one `setLabels` call. Existing label text is never overwritten, even
     * if it was imported from a BIP-329 file or entered by the user.
     */
    async (
      labelEntries: Array<{
        type: Bip329SupportedType;
        ref: string;
        label: string;
      }>
    ) => {
      const currentLabels = labelsRef.current;
      if (!currentLabels) throw new Error('Labels not ready');
      let updatedLabels = currentLabels;
      labelEntries.forEach(labelEntry => {
        if (getWalletLabelText(updatedLabels, labelEntry.type, labelEntry.ref))
          return;
        updatedLabels = updateWalletLabelTextData({
          labels: updatedLabels,
          type: labelEntry.type,
          ref: labelEntry.ref,
          label: labelEntry.label
        });
      });
      if (updatedLabels === currentLabels) return;
      await persistLabels(updatedLabels);
    },
    [persistLabels]
  );

  const importBip329Labels = useCallback(
    async (jsonLines: string) => {
      const currentLabels = labelsRef.current;
      if (!currentLabels) throw new Error('Labels not ready');
      const result = parseBip329Labels(jsonLines, currentLabels);
      if (result.importedCount > 0) await persistLabels(result.labels);
      return result;
    },
    [persistLabels]
  );

  const exportBip329Labels = useCallback(() => {
    const currentLabels = labelsRef.current;
    if (!currentLabels) throw new Error('Labels not ready');
    return serializeBip329Labels(currentLabels);
  }, []);

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
      const { utxos, txoMap } = discovery.getUtxosAndBalance({
        descriptors
      });
      const walletUtxosData = getTxosDataFromVaults(
        utxos,
        vaults,
        network,
        discovery,
        txoMap
      );
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

  /** Fetches reserve descriptor data without adding it to normal wallet funds. */
  const fetchReserveDescriptorData = useCallback(
    async ({ descriptor }: { descriptor: string }) => {
      if (!discovery || !vaults || !activeWallet?.networkId)
        throw new Error('Wallet not ready for fetchReserveDescriptorData');
      if (gapLimit === undefined)
        throw new Error('gapLimit not ready for fetchReserveDescriptorData');
      try {
        const network = networkMapping[activeWallet.networkId];
        // Do not use netRequest here: reserve scans run in the background and
        // failures should surface only in the role-specific Trigger/Rescue UI.
        await discovery.fetch({ descriptor, gapLimit });
        const { utxos, stxos, txoMap } = discovery.getUtxosAndBalance({
          descriptor,
          txStatus: TxStatus.ALL
        });
        const { utxos: confirmedUtxos } = discovery.getUtxosAndBalance({
          descriptor,
          txStatus: TxStatus.CONFIRMED
        });
        const confirmedUtxosSet = new Set(confirmedUtxos);
        // Reserve actions consume the whole descriptor state. Current UTXOs fund
        // first children; STXOs are outputs locked by an unconfirmed child and
        // are therefore the inputs for a replacement child while accelerating.
        const txos = [...utxos, ...stxos];
        const txosData = getTxosDataFromVaults(
          txos,
          vaults,
          network,
          discovery,
          txoMap
        );
        const nextIndex = descriptor.includes('*')
          ? discovery.getNextIndex({ descriptor })
          : 0;

        return {
          txosData,
          hasUnconfirmedUtxos: utxos.some(utxo => !confirmedUtxosSet.has(utxo)),
          nextIndex
        };
      } catch (err) {
        console.warn('Could not fetch reserve descriptor data', err);
        return undefined;
      }
    },
    [activeWallet?.networkId, discovery, gapLimit, vaults]
  );

  /**
   * Pushes a 1-parent-1-child package through Esplora `/txs/package`.
   *
   * This method intentionally mirrors the behavior of `discovery.push`:
   *
   * 1) Broadcast to the network.
   * 2) Probe mempool visibility for each tx (parent + child).
   * 3) Probe discovery via `addTransaction`.
   * 4) If `addTransaction` reports `INPUTS_ALREADY_SPENT`, synchronize
   *    discovery from the explorer.
   *
   * Important: replacement packages (the Accelerate button) are different from
   * brand-new packages.
   * When a replacement child reuses the previous child inputs, `addTransaction`
   * can fail with `INPUTS_ALREADY_SPENT` by design, because discovery still
   * considers those inputs spent by the old child. In that case the authoritative
   * state update comes from the follow-up `discovery.fetch(...)`, not from
   * `addTransaction(...)` itself.
   *
   * After such a replacement sync, wallet-visible UTXOs can change
   * dramatically: old change from the replaced child disappears, new change may
   * appear and previously spent inputs may re-enter the available set. To keep
   * tx-building safe, we immediately rebuild in-memory `utxosData` and
   * `historyData` from the refreshed discovery state before the user can start
   * another wallet action.
   *
   * Like `discovery.push`, mempool visibility failures only emit warnings.
   */
  const pushTxPackage = useCallback(
    async ({
      parentTxHex,
      childTxHex
    }: {
      parentTxHex: string;
      childTxHex: string;
    }) => {
      if (!discovery) throw new Error('Discovery not ready for pushTxPackage');
      if (gapLimit === undefined)
        throw new Error('gapLimit not ready for pushTxPackage');
      if (!esploraAPI)
        throw new Error('esploraAPI not ready for pushTxPackage');
      if (!vaults || !vaultsStatuses || !accounts || tipHeight === undefined)
        throw new Error('Wallet state not ready for pushTxPackage');

      const response = await fetch(`${esploraAPI}/txs/package`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([parentTxHex, childTxHex]),
        ...(networkTimeout !== undefined
          ? { signal: AbortSignal.timeout(networkTimeout) }
          : {})
      });

      if (response.status === 404)
        throw new Error('Package endpoint unavailable: /txs/package');
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || 'Package broadcast failed');
      }

      const packageResult = (await response.json()) as {
        package_msg?: string;
        'tx-results'?: Record<string, { error?: string }>;
      };
      const packageMsg = packageResult['package_msg'];
      const txErrors = packageResult['tx-results']
        ? Object.values(packageResult['tx-results'])
            .map(result => result.error)
            .filter((error): error is string => typeof error === 'string')
        : [];
      if (packageMsg !== 'success' || txErrors.length > 0)
        throw new Error(
          `Package broadcast rejected: ${packageMsg || 'unknown'}${txErrors.length ? ` (${txErrors.join('; ')})` : ''}`
        );

      const DETECTION_INTERVAL = 3000;
      const DETECT_RETRY_MAX = 20;
      const parentTxId = transactionFromHex(parentTxHex).txId;
      const childTxId = transactionFromHex(childTxHex).txId;
      const explorer = discovery.getExplorer();

      let parentFoundInMempool = false;
      let childFoundInMempool = false;
      for (let i = 0; i < DETECT_RETRY_MAX; i++) {
        if (!parentFoundInMempool)
          try {
            if (await explorer.fetchTx(parentTxId)) parentFoundInMempool = true;
          } catch {
            // keep polling until retries are exhausted
          }
        if (!childFoundInMempool)
          try {
            if (await explorer.fetchTx(childTxId)) childFoundInMempool = true;
          } catch {
            // keep polling until retries are exhausted
          }
        if (parentFoundInMempool && childFoundInMempool) break;
        await new Promise(resolve => setTimeout(resolve, DETECTION_INTERVAL));
      }

      const parentResult = discovery.addTransaction({
        txData: {
          txHex: parentTxHex,
          blockHeight: 0,
          irreversible: false
        },
        gapLimit
      });
      const childResult = discovery.addTransaction({
        txData: {
          txHex: childTxHex,
          blockHeight: 0,
          irreversible: false
        },
        gapLimit
      });

      const descriptorsToSync = new Set<string>();
      if (parentResult.success === false && parentResult.conflicts.length > 0)
        parentResult.conflicts.forEach(conflict =>
          descriptorsToSync.add(conflict.descriptor)
        );
      if (childResult.success === false && childResult.conflicts.length > 0)
        childResult.conflicts.forEach(conflict =>
          descriptorsToSync.add(conflict.descriptor)
        );

      let syncPerformed = false;
      const uniqueDescriptorsToSync = Array.from(descriptorsToSync);
      if (uniqueDescriptorsToSync.length > 0) {
        //This is the case when the pushTxPackage failed because this was
        //a package replacement (Accelerate button)
        logRangedAccountFetches({
          descriptors: uniqueDescriptorsToSync,
          gapLimit,
          source: 'package-conflicts'
        });
        await discovery.fetch({
          descriptors: uniqueDescriptorsToSync,
          gapLimit
        });
        const hotDescriptors = getHotDescriptors(
          vaults,
          vaultsStatuses,
          accounts,
          tipHeight
        );
        logRangedAccountFetches({
          descriptors: hotDescriptors,
          gapLimit,
          source: 'package-hot-descriptors'
        });
        await discovery.fetch({ descriptors: hotDescriptors, gapLimit });
        // This call updates in-memory wallet state immediately. The async part of
        // `setUtxosHistoryExport` is only the later discoveryExport disk write.
        setUtxosHistoryExport(vaults, vaultsStatuses, accounts, tipHeight);
        syncPerformed = true;
      }

      if (syncPerformed)
        console.warn(
          `package txids ${parentTxId}, ${childTxId}: Input conflict(s) detected; state synchronization was performed for affected descriptors. The library state reflects this outcome.`
        );
      if (!parentFoundInMempool)
        console.warn(
          `txId ${parentTxId}: Pushed package parent was not found in the mempool immediately after broadcasting.`
        );
      if (!childFoundInMempool)
        console.warn(
          `txId ${childTxId}: Pushed package child was not found in the mempool immediately after broadcasting.`
        );
    },
    [
      discovery,
      gapLimit,
      esploraAPI,
      networkTimeout,
      vaults,
      vaultsStatuses,
      accounts,
      tipHeight,
      setUtxosHistoryExport
    ]
  );

  /**
   * This is useful when the wallet is expecting funds in a specific output
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
      const accountsToUse = accountsRef.current;
      if (
        !vaults ||
        !vaultsStatuses ||
        !accountsToUse ||
        tipHeight === undefined
      )
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
      let initialHistory: TxHistory | undefined;
      try {
        initialHistory = discovery.getHistory(descriptorWithIndex) as TxHistory;
      } catch {
        // Exact arbitrary indexes may not be part of the current gap-limit scan yet.
        initialHistory = undefined;
      }
      await discovery.fetch(descriptorWithIndex); //FIXME: and the gapLimit???
      const history = discovery.getHistory(descriptorWithIndex) as TxHistory;
      if (initialHistory !== history)
        await setUtxosHistoryExport(
          vaults,
          vaultsStatuses,
          accountsToUse,
          tipHeight
        );

      return history;
    },
    [discovery, setUtxosHistoryExport, vaults, vaultsStatuses, tipHeight]
  );

  const getOutputHistory = useCallback(
    ({
      descriptor,
      index
    }: {
      descriptor: string;
      index?: number;
    }): TxHistory | undefined => {
      if (index === undefined && descriptor.includes('*'))
        throw new Error('Use getOutputHistory only for a single output');
      if (!discovery) return undefined;
      const descriptorWithIndex = {
        descriptor,
        ...(index !== undefined ? { index } : {})
      };
      const fetched = discovery.whenFetched(descriptorWithIndex);
      if (!fetched || fetched.fetching) return undefined;
      try {
        return discovery.getHistory(descriptorWithIndex) as TxHistory;
      } catch {
        return undefined;
      }
    },
    [discovery]
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
    accountsErrorCode: accountsStorageStatus.errorCode,
    labelsErrorCode: labelsStorageStatus.errorCode
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

  // diagnostic logging for storage errors. The ref prevents spamming the
  // console while preserving enough detail to debug transient
  // corruption/read-write states reported by users.
  const lastWalletStorageWarningKeyRef = useRef<string | null>(null);
  useEffect(() => {
    const missingWallet = !activeWallet;
    const shouldWarnMissingWallet =
      missingWallet && walletIdRef.current !== undefined;
    const hasWalletStorageError =
      storageAccessStatus.readWriteError ||
      (isCorrupted && (!missingWallet || shouldWarnMissingWallet));
    if (!hasWalletStorageError) {
      lastWalletStorageWarningKeyRef.current = null;
      return;
    }

    const missingSignersAfterDiskSync =
      !signers &&
      signersStorageStatus.isDiskSynchd &&
      signersStorageStatus.errorCode !== 'DecryptError';
    const missingVaultsAfterSync = !vaults && vaultsStorageStatus.isSynchd;
    const missingVaultsStatusesAfterSync =
      !vaultsStatuses && vaultsStatusesStorageStatus.isSynchd;
    const missingAccountsAfterSync =
      !accounts && accountsStorageStatus.isSynchd;

    const warningKey = [
      activeWallet?.walletId ?? 'no-wallet',
      isCorrupted,
      storageAccessStatus.readWriteError,
      settingsStorageStatus.errorCode,
      walletsStorageStatus.errorCode,
      signersStorageStatus.errorCode,
      discoveryExportStorageStatus.errorCode,
      vaultsStorageStatus.errorCode,
      vaultsStatusesStorageStatus.errorCode,
      accountsStorageStatus.errorCode,
      labelsStorageStatus.errorCode,
      missingWallet,
      missingSignersAfterDiskSync,
      missingVaultsAfterSync,
      missingVaultsStatusesAfterSync,
      missingAccountsAfterSync,
      !!wallets,
      !!signers,
      discoveryExport !== undefined,
      !!vaults,
      !!vaultsStatuses,
      !!accounts,
      !!labels
    ].join(':');
    if (lastWalletStorageWarningKeyRef.current === warningKey) return;
    lastWalletStorageWarningKeyRef.current = warningKey;

    console.warn(
      'Wallet storage error state',
      JSON.stringify(
        {
          walletId: activeWallet?.walletId,
          walletIdRef: walletIdRef.current,
          hasActiveWallet: !!activeWallet,
          isCorrupted,
          storageCorruptionReasons: {
            missingWallet,
            missingSignersAfterDiskSync,
            missingVaultsAfterSync,
            missingVaultsStatusesAfterSync,
            missingAccountsAfterSync
          },
          storageAccessStatus: {
            biometricsKeyInvalidated:
              storageAccessStatus.biometricsKeyInvalidated,
            biometricAuthCancelled: storageAccessStatus.biometricAuthCancelled,
            biometricsReadWriteError:
              storageAccessStatus.biometricsReadWriteError,
            readWriteError: storageAccessStatus.readWriteError
          },
          signersStorageEngineMismatch,
          canInitSigners,
          canInitCipheredDataStorage,
          statuses: {
            settings: {
              errorCode: settingsStorageStatus.errorCode,
              isSynchd: settingsStorageStatus.isSynchd,
              isDiskSynchd: settingsStorageStatus.isDiskSynchd
            },
            wallets: {
              errorCode: walletsStorageStatus.errorCode,
              isSynchd: walletsStorageStatus.isSynchd,
              isDiskSynchd: walletsStorageStatus.isDiskSynchd
            },
            signers: {
              errorCode: signersStorageStatus.errorCode,
              isSynchd: signersStorageStatus.isSynchd,
              isDiskSynchd: signersStorageStatus.isDiskSynchd
            },
            discoveryExport: {
              errorCode: discoveryExportStorageStatus.errorCode,
              isSynchd: discoveryExportStorageStatus.isSynchd,
              isDiskSynchd: discoveryExportStorageStatus.isDiskSynchd
            },
            vaults: {
              errorCode: vaultsStorageStatus.errorCode,
              isSynchd: vaultsStorageStatus.isSynchd,
              isDiskSynchd: vaultsStorageStatus.isDiskSynchd
            },
            vaultsStatuses: {
              errorCode: vaultsStatusesStorageStatus.errorCode,
              isSynchd: vaultsStatusesStorageStatus.isSynchd,
              isDiskSynchd: vaultsStatusesStorageStatus.isDiskSynchd
            },
            accounts: {
              errorCode: accountsStorageStatus.errorCode,
              isSynchd: accountsStorageStatus.isSynchd,
              isDiskSynchd: accountsStorageStatus.isDiskSynchd
            },
            labels: {
              errorCode: labelsStorageStatus.errorCode,
              isSynchd: labelsStorageStatus.isSynchd,
              isDiskSynchd: labelsStorageStatus.isDiskSynchd
            }
          },
          dataPresence: {
            wallets: !!wallets,
            signers: !!signers,
            discoveryExport: discoveryExport !== undefined,
            vaults: !!vaults,
            vaultsStatuses: !!vaultsStatuses,
            accounts: !!accounts,
            labels: !!labels
          }
        },
        null,
        2
      )
    );
  }, [
    activeWallet,
    isCorrupted,
    storageAccessStatus,
    signersStorageEngineMismatch,
    canInitSigners,
    canInitCipheredDataStorage,
    settingsStorageStatus,
    walletsStorageStatus,
    signersStorageStatus,
    discoveryExportStorageStatus,
    vaultsStorageStatus,
    vaultsStatusesStorageStatus,
    accountsStorageStatus,
    labelsStorageStatus,
    wallets,
    signers,
    discoveryExport,
    vaults,
    vaultsStatuses,
    accounts,
    labels
  ]);

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
    labelsStorageStatus.isDiskSynchd &&
    walletsStorageStatus.errorCode === false &&
    discoveryExportStorageStatus.errorCode === false &&
    signersStorageStatus.errorCode === false &&
    vaultsStorageStatus.errorCode === false &&
    vaultsStatusesStorageStatus.errorCode === false &&
    accountsStorageStatus.errorCode === false &&
    labelsStorageStatus.errorCode === false &&
    !isCorrupted;

  useEffect(() => {
    if (isWalletDiskSynched) {
      if (!activeWallet) throw new Error('wallet should be set when ready');
      if (!wallets) throw new Error('wallets should be set when ready');
      if (!shallowEqualObjects(activeWallet, wallets[activeWallet.walletId])) {
        //FIXME: DANGER prob may be here!!! I may reset the wallets to the former one!!!
        //after the setVaultNotificationAcknowledged, since wallets will
        //change but activeWallet not!
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
          `Malformed watchtowerId in notification: ${watchtowerId} from ${source}.`,
          data
        );
        return;
      }

      const walletUUID = data['walletUUID'];
      if (typeof walletUUID !== 'string' || walletUUID === '') {
        console.warn(
          `Malformed walletUUID in notification: ${walletUUID} from ${source}.`,
          data
        );
        return;
      }

      const vaultId = data['vaultId'] as string;
      if (typeof vaultId !== 'string' || vaultId === '') {
        console.warn(
          `Malformed vaultId in notification: ${vaultId} from ${source}.`,
          data
        );
        return;
      }

      const firstDetectedAt = data['firstDetectedAt'];
      if (typeof firstDetectedAt !== 'number') {
        console.warn(
          `Malformed firstDetectedAt in notification: ${firstDetectedAt} from ${source}.`,
          data
        );
        return;
      }

      const txid = data['txid'];
      if (typeof txid !== 'string' || txid === '') {
        console.warn(
          `Malformed txid in notification: ${txid} from ${source}.`,
          data
        );
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
              //FIXME: dangerous for the useEffect DANGER
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
    setOrphanedWatchtowerWalletUUIDs(new Set());
  }, []);

  // Dismiss all notifications when there are no unacknowledged ones remaining
  const nonOrphanedUnackedCount = Object.values(wallets ?? {}).filter(wallet =>
    Object.values(wallet.notifications ?? {}).some(watchtower =>
      Object.values(watchtower).some(n => !n.acked)
    )
  ).length;
  const totalUnackedCount =
    orphanedWatchtowerWalletUUIDs.size + nonOrphanedUnackedCount;
  const prevUnackedCountRef = useRef(totalUnackedCount);
  useEffect(() => {
    if (prevUnackedCountRef.current > 0 && totalUnackedCount === 0) {
      dismissAllNotificationsAsync();
      setBadgeCountAsync(0);
    }
    prevUnackedCountRef.current = totalUnackedCount;
  }, [totalUnackedCount]);

  // Refs for notification listeners
  const notificationListenerRef = useRef<Subscription | undefined>(undefined);
  const responseListenerRef = useRef<Subscription | undefined>(undefined);

  // Set up watchtower notification handling & polling for pending notifications
  const lastNotificationResponseHandledRef = useRef<boolean>(false);
  // Possible values for watchtowerPollTimeoutRef:
  //   'PENDING'  - Polling has not started yet.
  //   'CHECKING' - Currently performing the initial polling (determining if
  //   all APIs are OK or if further polling is needed).
  //   'COMPLETE' - All watchtower APIs have been checked and no further
  //   polling is required.
  //   NodeJS.Timeout - A polling retry is scheduled and waiting to run.
  const watchtowerPollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pollAbortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (
      !networkTimeout ||
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
    // notification center
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
    // closed (killed) or while  in the background.
    // This is the only possible way to retrieve them if the app was killed
    // (force-stopped) and the user did not tap on the notification.
    // Also getPresentedNotificationsAsync cannot be trusted since the
    // data sent from the notifications server is not included.
    // Ensures only one runFetchAndPoll is ever running at once; aborts previous
    // poll and timeout.
    function runFetchAndPoll(token: string) {
      if (pollAbortControllerRef.current) {
        pollAbortControllerRef.current.abort();
        pollAbortControllerRef.current = null;
      }
      if (watchtowerPollTimeoutRef.current) {
        clearTimeout(watchtowerPollTimeoutRef.current);
        watchtowerPollTimeoutRef.current = null;
      }

      if (!wallets || Object.keys(wallets).length === 0) {
        watchtowerPollTimeoutRef.current = null;
        pollAbortControllerRef.current = null;
        return;
      }
      //keep a local copy for aborted checks since pollAbortControllerRef will
      //be set to null
      const localController = new AbortController();
      pollAbortControllerRef.current = localController;
      let localFailedNetworkIds = Object.values(wallets)
        .map(w => w.networkId)
        .filter((netId, i, arr) => netId && arr.indexOf(netId) === i);
      const pollAsync = async () => {
        //was it aborted in the timeout wait?
        if (localController.signal.aborted) return;
        const currentIterationFailedNetworkIds = [...localFailedNetworkIds];
        for (const networkId of currentIterationFailedNetworkIds) {
          const currentWatchtowerAPI = getAPIs(
            networkId,
            settings
          ).watchtowerAPI;
          if (currentWatchtowerAPI === undefined)
            throw new Error(`watchtowerAPI unavailable for: ${networkId}`);
          if (networkTimeout === undefined)
            throw new Error('networkTimeout undefined');
          if (localController.signal.aborted) return;
          const unackedNotifications =
            await fetchWatchtowerUnackedNotifications({
              pushToken: token,
              networkTimeout,
              watchtowerAPI: currentWatchtowerAPI,
              signal: localController.signal
            });
          // fetchWatchtowerUnackedNotifications may have been aborted during
          // the await; check signal before continuing:
          if (localController.signal.aborted) return;

          if (unackedNotifications !== null) {
            for (const notification of unackedNotifications)
              handleWatchtowerNotification(token, notification, 'FETCH');
            localFailedNetworkIds = localFailedNetworkIds.filter(
              id => id !== networkId
            );
          }
        }

        if (localFailedNetworkIds.length > 0)
          watchtowerPollTimeoutRef.current = setTimeout(pollAsync, 60000);
        else {
          //successfully finished:
          watchtowerPollTimeoutRef.current = null;
          pollAbortControllerRef.current = null;
        }
      };
      pollAsync();
    }
    runFetchAndPoll(pushToken);

    let previousAppState = AppState.currentState;
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (previousAppState === 'background' && nextAppState === 'active')
        // App has come to the foreground, re-run fetch and poll
        runFetchAndPoll(pushToken);
      previousAppState = nextAppState;
    };

    const appStateSubscription = AppState.addEventListener(
      'change',
      handleAppStateChange
    );

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
      // Cleanup for the polling mechanism
      if (pollAbortControllerRef.current) {
        pollAbortControllerRef.current.abort();
        pollAbortControllerRef.current = null;
      }
      if (watchtowerPollTimeoutRef.current) {
        clearTimeout(watchtowerPollTimeoutRef.current);
        watchtowerPollTimeoutRef.current = null;
      }
      appStateSubscription.remove();
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
        clearLabelsCache();
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
    clearLabelsCache,
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
        deleteAsync(`ACCOUNTS_${idToDelete}`),
        deleteAsync(`LABELS_${idToDelete}`)
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
          deleteAsync(`ACCOUNTS_${walletDst.walletId}`),
          deleteAsync(`LABELS_${walletDst.walletId}`)
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
        //FIXME: aqui ojito porque no actualizo wallets DANGER
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
        const walletDataCipherKey = await getWalletDataCipherKey({
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

  const getNextOnChainBackupIndex = useCallback(
    async (minimumIndex = 0) => {
      const network =
        activeWallet?.networkId && networkMapping[activeWallet.networkId];
      if (!network) throw new Error('Network not ready');
      if (!discovery) throw new Error('Discovery not ready');
      if (!signers) throw new Error('Signers not ready');
      const signer = signers[0];
      if (!signer) throw new Error('signer unavailable');
      const descriptor = getOnChainBackupDescriptor({
        signer,
        network,
        index: '*'
      });

      // Without legacy P2P vaults, on-chain backup indexes start at 0 and are
      // consecutive, so one ranged fetch finds the first missing index.
      if (minimumIndex === 0) {
        await discovery.fetch({ descriptor, gapLimit: 1 });
        return discovery.getNextIndex({ descriptor });
      } else {
        let nextIndex = minimumIndex;

        while (true) {
          await discovery.fetch({ descriptor, index: nextIndex });
          const history = discovery.getHistory({
            descriptor,
            index: nextIndex
          });
          if (!history.length) {
            return nextIndex;
          }
          nextIndex++;
        }
      }
    },
    [activeWallet?.networkId, discovery, signers]
  );

  /**
   * Selects the account for automatic receive/change defaults. Used accounts win,
   * ordered by the standard-account policy. If no account has known history, it
   * falls back to the configured default standard account. Requires discovery
   * because unknown history must not be treated as empty history.
   */
  const getPreferredAccount = useCallback(() => {
    const network =
      activeWallet?.networkId && networkMapping[activeWallet.networkId];
    if (!network) throw new Error('Network not ready');
    if (!discovery) throw new Error('Discovery not ready');
    if (!accounts) throw new Error('Accounts not ready');
    if (!Object.keys(accounts).length) throw new Error('Accounts not set');
    return selectPreferredAccount({
      accounts,
      network,
      // Mark an account as used if either its receive range or its change range
      // has history. selectPreferredAccount then picks used accounts before
      // unused accounts. Among used accounts it picks by script order first, for
      // example taproot before native SegWit. If two used accounts have the same
      // script, it picks the highest account number, for example wpkh account 2
      // before wpkh account 1. If no account is used, it falls back to the
      // configured default standard account (wpkh account 0).
      getAccountHasHistory: account =>
        discovery.getNextIndex({ descriptor: account }) > 0 ||
        discovery.getNextIndex({
          descriptor: account.replace(/\/0\/\*/g, '/1/*')
        }) > 0
    });
  }, [accounts, activeWallet?.networkId, discovery]);

  const getChangeDescriptorWithNextIndex = useCallback(async () => {
    if (!discovery) throw new Error('Discovery not ready');
    const account = getPreferredAccount();
    const changeDescriptor = account.replace(/\/0\/\*/g, '/1/*');
    return {
      descriptor: changeDescriptor,
      index: discovery.getNextIndex({ descriptor: changeDescriptor })
    };
  }, [discovery, getPreferredAccount]);

  const getRangedDescriptorWithNextIndex = useCallback(
    ({ account, change }: { account: Account; change: 0 | 1 }) => {
      if (!discovery) throw new Error('Discovery not ready');
      const descriptor = account.replace(/\/0\/\*/g, `/${change}/*`);
      return {
        descriptor,
        nextIndex: discovery.getNextIndex({ descriptor })
      };
    },
    [discovery]
  );

  /**
   * Returns cache-only status for one account range.
   *
   * `account` is always the receive descriptor (`/0/*`). `change` selects the
   * receive range (`0`) or change range (`1`). This function does not fetch.
   *
   * `whenFetched` is the discovery cache status for the range. `nextIndex` is
   * returned after the range has completed at least one fetch.
   */
  const getRangedDescriptorStatus = useCallback(
    ({ account, change }: { account: Account; change: 0 | 1 }) => {
      if (!discovery) throw new Error('Discovery not ready');
      const descriptor = account.replace(/\/0\/\*/g, `/${change}/*`);
      const fetched = discovery.whenFetched({ descriptor });
      const hasCompletedRangeFetch =
        fetched !== undefined && fetched.timeFetched > 0;
      const nextIndex = hasCompletedRangeFetch
        ? discovery.getNextIndex({ descriptor })
        : undefined;
      return {
        ...(nextIndex !== undefined ? { nextIndex } : {}),
        ...(fetched ? { whenFetched: fetched } : {})
      };
    },
    [discovery]
  );

  /**
   * Fetches one account range and returns its updated cache status.
   *
   * This fetches the receive range (`change: 0`) or change range (`change: 1`)
   * with the wallet gap limit. It never fetches one exact address index.
   *
   * If `freshForSeconds` is provided, a recently fetched range is reused until it
   * becomes older than that value. If another call is already fetching the same
   * range, this waits for that fetch and returns the updated cache status. This
   * parameter is cache freshness, not UI debounce; callers that react to typing
   * should debounce before calling this function.
   */
  const fetchRangedDescriptor = useCallback(
    async ({
      account,
      change,
      freshForSeconds
    }: {
      account: Account;
      change: 0 | 1;
      freshForSeconds?: number;
    }) => {
      if (!discovery) throw new Error('Discovery not ready');
      if (gapLimit === undefined)
        throw new Error('gapLimit not ready to fetch ranged descriptor');

      const status = getRangedDescriptorStatus({ account, change });
      const descriptor = account.replace(/\/0\/\*/g, `/${change}/*`);
      const pendingFetch = rangedDescriptorFetchesRef.current.get(descriptor);
      if (pendingFetch) {
        await pendingFetch;
        return getRangedDescriptorStatus({ account, change });
      }

      const now = Math.floor(Date.now() / 1000);
      if (
        freshForSeconds !== undefined &&
        status.whenFetched?.timeFetched !== undefined &&
        status.whenFetched.timeFetched > 0 &&
        now - status.whenFetched.timeFetched < freshForSeconds
      )
        return status;

      logRangedAccountFetch({
        descriptor,
        gapLimit,
        source: 'fetchRangedDescriptor'
      });
      const fetchPromise = discovery
        .fetch({ descriptor, gapLimit })
        .then(() => undefined);
      rangedDescriptorFetchesRef.current.set(descriptor, fetchPromise);
      try {
        await fetchPromise;
      } finally {
        if (rangedDescriptorFetchesRef.current.get(descriptor) === fetchPromise)
          rangedDescriptorFetchesRef.current.delete(descriptor);
      }
      return getRangedDescriptorStatus({ account, change });
    },
    [discovery, gapLimit, getRangedDescriptorStatus]
  );

  /**
   * Fetches the normal receive/change ranges for one account, using gap limit.
   * Caller owns netRequest/toast handling.
   */
  const fetchAccount = useCallback(
    async (accountToFetch: Account) => {
      if (!discovery) throw new Error('Discovery not ready');
      if (gapLimit === undefined)
        throw new Error('gapLimit not ready to track account');
      const descriptors = [
        accountToFetch.replace(/\/0\/\*/g, '/0/*'),
        accountToFetch.replace(/\/0\/\*/g, '/1/*')
      ];
      logRangedAccountFetches({
        descriptors,
        gapLimit,
        source: 'fetchAccount'
      });
      await discovery.fetch({ descriptors, gapLimit });
    },
    [discovery, gapLimit]
  );

  /**
   * Add an account if missing, scan its normal receive/change ranges, and
   * refresh wallet UTXO/history data. Existing tracked accounts are refreshed by
   * the main wallet sync path.
   * Caller owns netRequest/toast handling.
   */
  const trackAccount = useCallback(
    async (account: Account) => {
      const currentAccounts = accountsRef.current;
      if (!currentAccounts) throw new Error('Accounts not ready');
      if (currentAccounts[account]) return currentAccounts;
      if (!vaults || !vaultsStatuses || tipHeight === undefined)
        throw new Error('Wallet state not ready to track account');
      await fetchAccount(account);
      const updatedAccounts = await ensureAccountTracked(account);
      await setUtxosHistoryExport(
        vaults,
        vaultsStatuses,
        updatedAccounts,
        tipHeight
      );
      return updatedAccounts;
    },
    [
      fetchAccount,
      setUtxosHistoryExport,
      ensureAccountTracked,
      tipHeight,
      vaults,
      vaultsStatuses
    ]
  );

  const getReceiveDescriptorWithNextIndex = useCallback(async () => {
    if (!discovery) throw new Error('Discovery not ready');
    const account = getPreferredAccount();
    const receiveDescriptor = account;
    return {
      descriptor: receiveDescriptor,
      index: discovery.getNextIndex({
        descriptor: receiveDescriptor
      })
    };
  }, [discovery, getPreferredAccount]);

  const getUnvaultKeyExpression = useCallback(async () => {
    const network =
      activeWallet?.networkId && networkMapping[activeWallet.networkId];
    if (!network) throw new Error('Network not ready');
    if (!signers) throw new Error('Signers not ready');
    const signer = signers[0];
    if (!signer) throw new Error('signer unavailable');
    return await createUnvaultKeyExpression({ signer, network });
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
      let quiet = false;
      if (!data.address) {
        throw new Error('Invalid response: address field is missing.');
      }
      if (data.quiet === true) quiet = data.quiet;

      return { address: data.address, quiet };
    } catch (error) {
      // Handle errors (e.g., network issues, invalid JSON, etc.)
      console.error('Error fetching service address:', error);
      throw error; // Re-throw the error if you want to handle it outside or show a message to the user
    }
  }, [serviceAddressAPI, networkTimeout]);

  //Did the user initiated the sync (true)? ir was it a scheduled one (false)?
  const isUserTriggeredSync = useRef<boolean>(false);
  const prevAccountsSyncRef = useRef<Accounts | undefined>(undefined);
  const wasSyncingBlockchainRef = useRef<boolean>(false);

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

  const netRequestRef = useRef(netRequest);
  useEffect(() => {
    netRequestRef.current = netRequest;
  }, [netRequest]);

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
    async ({
      pushToken,
      isUserTriggered
    }: {
      pushToken: string;
      isUserTriggered: boolean;
    }) => {
      // Ensure all required data is available before proceeding
      if (!vaults || !vaultsStatuses || activeWallet?.walletId === undefined) {
        console.warn(
          'syncWatchtowerRegistration: Skipping due to missing data.'
        );
        return;
      }

      const whenToastErrors = isUserTriggered ? 'ON_ANY_ERROR' : 'ON_NEW_ERROR';
      const walletUUID = activeWallet?.walletUUID;
      //console.log('TRACE syncWatchtowerRegistration', {
      //  isUserTriggered,
      //  whenToastErrors,
      //  watchtowerAPIReachable
      //});
      try {
        if (!watchtowerAPI || !networkTimeout || !walletTitle || !walletUUID)
          throw new Error('Required data for watchtower registration missing');

        let canProceed = false;
        if (watchtowerAPIReachable) canProceed = true;
        else {
          const status = await netStatusUpdate({ whenToastErrors });
          if (activeWallet.walletId !== walletIdRef.current) return; //do this after each await
          await new Promise(resolve => setTimeout(resolve, 100)); //time for setting netRequestRef.current
          if (activeWallet.walletId !== walletIdRef.current) return; //do this after each await
          //netStatusUpdate will update internal states.
          //Therefore we must use an up-to-date netRequest. This is the
          //reason we use netRequestRef.current in the following
          // if it just became reachable…
          if (status?.watchtowerAPIReachable) {
            if (activeWallet.walletId !== walletIdRef.current) return;
            //do this after each await
            canProceed = true;
          }
        }
        //console.log('TRACE syncWatchtowerRegistration', {
        //  canProceed,
        //  whenToastErrors
        //});
        if (!canProceed) return;
        const { result: newWatchedVaults } = await netRequestRef.current({
          id: 'syncWatchtowerRegistration',
          whenToastErrors,
          requirements: { watchtowerAPIReachable: true },
          errorMessage: (message: string) =>
            t('app.watchtowerError', { message }),
          func: () => {
            //console.log('TRACE syncWatchtowerRegistration netRequest DONE!', {
            //  watchtowerAPIReachable,
            //  canProceed,
            //  whenToastErrors
            //});
            const rawLocale = settings?.LOCALE ?? defaultSettings.LOCALE;
            const locale =
              rawLocale === 'default'
                ? (getLocales()[0]?.languageTag ?? 'en')
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
        if (activeWallet.walletId !== walletIdRef.current) return;

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
      networkTimeout,
      settings?.LOCALE,
      t,
      watchtowerAPI,
      walletTitle,
      netStatusUpdate,
      watchtowerAPIReachable
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
    let shouldRollbackEarlyAccounts = false;
    const rollbackEarlyAccounts = () => {
      if (shouldRollbackEarlyAccounts && accounts !== undefined)
        persistAccounts(accounts);
    };

    const isUserTriggered = isUserTriggeredSync.current;
    isUserTriggeredSync.current = false;
    const whenToastErrors = isUserTriggered ? 'ON_ANY_ERROR' : 'ON_NEW_ERROR';

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
      (!needsP2PBackupScan || cBVaultsReaderAPI) &&
      watchtowerAPI
    ) {
      console.log(
        `[${new Date().toISOString()}] [Sync] Wallet: ${activeWallet.walletId} | isCoreNetReady: ${isCoreNetReady} | watchtowerAPIReachable: ${watchtowerAPIReachable} | cBVaultsReaderAPIReachable: ${cBVaultsReaderAPIReachable} | UserTriggered: ${isUserTriggered} | network: ${activeWallet.networkId}`
      );

      if (
        (isCoreNetReady === false ||
          watchtowerAPIReachable === false ||
          (needsP2PBackupScan && cBVaultsReaderAPIReachable === false)) &&
        isUserTriggered
      ) {
        //This strategy only checks netStatus changes when we're sure the
        //some of the APIs are  down and the user is requesting it. This is because this is
        //an expensive operation and sync may also be called automatically on
        //dependencies of isWalletDiskSynched, isCoreNetReady, callback functions and so on...
        //No prob if netStatusUpdate fails.
        //console.log('TRACE sync calling to netStatusUpdate');
        const ns = await netStatusUpdate({ whenToastErrors });
        if (activeWallet.walletId !== walletIdRef.current) {
          //do this after each await
          setSyncingBlockchain(activeWallet.walletId, false);
          return;
        }
        //netStatusUpdate will update internal states.
        //Therefore we must use an up-to-date netRequest. This is the
        //reason we use netRequestRef.current in the following
        await new Promise(resolve => setTimeout(resolve, 100)); //time for setting netRequestRef.current
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
        const shouldFetchP2PVaults =
          activeWallet.lastP2PBackupVaultIndex === undefined;
        const { result: p2pVaults } =
          shouldFetchP2PVaults && cBVaultsReaderAPI
            ? await netRequestRef.current({
                id: 'p2pVaults',
                errorMessage: (message: string) =>
                  t('app.syncP2PVaultsError', { message }),
                whenToastErrors,
                requirements: { cBVaultsReaderAPIReachable: true },
                func: () =>
                  fetchP2PVaults({
                    networkTimeout,
                    signer,
                    networkId: activeWallet.networkId,
                    cBVaultsReaderAPI,
                    vaults
                  })
              })
            : { result: undefined };
        if (activeWallet.walletId !== walletIdRef.current) {
          //do this after each await
          setSyncingBlockchain(activeWallet.walletId, false);
          return;
        }

        const lastP2PBackupVaultIndex = p2pVaults
          ? Object.values(p2pVaults).reduce(
              (lastIndex, p2pVault) =>
                Math.max(lastIndex, parseVaultIndex(p2pVault.vaultPath)),
              -1
            )
          : undefined;

        const updatedVaultsAfterP2P = mergeRestoredVaults({
          currentVaults: vaults,
          restoredVaults: p2pVaults,
          source: 'p2p'
        });

        const p2pBackupFloor =
          lastP2PBackupVaultIndex ?? activeWallet.lastP2PBackupVaultIndex;
        const highestKnownVaultIndex = Object.values(updatedVaultsAfterP2P).reduce(
          (highestIndex, vault) =>
            Math.max(highestIndex, parseVaultIndex(vault.vaultPath)),
          -1
        );
        const firstOnChainBackupIndexToCheck = Math.max(
          p2pBackupFloor !== undefined ? p2pBackupFloor + 1 : 0,
          highestKnownVaultIndex + 1
        );
        const { result: onChainVaults } = await netRequestRef.current({
          id: 'onChainVaults',
          errorMessage: (message: string) =>
            t('app.syncOnChainVaultsError', { message }),
          whenToastErrors,
          requirements: { explorerReachable: true },
          func: () =>
            fetchOnChainVaults({
              discovery,
              signer,
              networkId: activeWallet.networkId,
              firstIndexToCheck: firstOnChainBackupIndexToCheck
            })
        });
        if (activeWallet.walletId !== walletIdRef.current) {
          //do this after each await
          setSyncingBlockchain(activeWallet.walletId, false);
          return;
        }
        const updatedVaults = mergeRestoredVaults({
          currentVaults: updatedVaultsAfterP2P,
          restoredVaults: onChainVaults,
          source: 'on-chain'
        });

        const { result: freshVaultsStatuses } = await netRequestRef.current({
          id: 'fetchVaultsStatuses',
          errorMessage: (message: string) =>
            t('app.syncNetworkError', { message }),
          whenToastErrors,
          requirements: { explorerReachable: true },
          func: () =>
            fetchVaultsStatuses(
              updatedVaults,
              vaultsStatuses,
              discovery.getExplorer(),
              signer,
              network
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
            let fetchStandardAccountsProgressCounter = 0;
            const { status: fetchStandardStatus } = await netRequestRef.current(
              {
                id: 'fetchStandardAccounts',
                errorMessage: (message: string) =>
                  t('app.syncNetworkError', { message }),
                whenToastErrors,
                requirements: { explorerReachable: true },
                func: () =>
                  discovery.fetchStandardAccounts({
                    masterNode,
                    gapLimit,
                    async onAccountChecking(account) {
                      logRangedAccountFetches({
                        descriptors: [
                          account,
                          account.replace(/\/0\/\*/g, '/1/*')
                        ],
                        gapLimit,
                        source: 'fetchStandardAccounts'
                      });
                    },
                    async onAccountProgress() {
                      fetchStandardAccountsProgressCounter++;
                      if (activeWallet.walletId !== walletIdRef.current)
                        //abort fetchStandardAccounts
                        return false;
                      if (
                        fetchStandardAccountsProgressCounter %
                          UI_YIELD_ITERATION_COUNT ===
                        0
                      ) {
                        await new Promise(resolve =>
                          setTimeout(resolve, UI_YIELD_ITERATION_TIME_MS)
                        );
                      }
                      return;
                    }
                  })
              }
            );
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
          persistAccounts(updatedAccounts);
          shouldRollbackEarlyAccounts = true;
        }

        const descriptors = getHotDescriptors(
          updatedVaults,
          updatedVaultsStatuses,
          updatedAccounts,
          updatedTipHeight
        );
        let fetchProgressCounter = 0;
        const { status: fetchStatus } = await netRequestRef.current({
          id: 'syncFetch',
          errorMessage: (message: string) =>
            t('app.syncNetworkError', { message }),
          whenToastErrors,
          requirements: { explorerReachable: true },
          func: () => {
            logRangedAccountFetches({
              descriptors,
              gapLimit,
              source: 'syncFetch'
            });
            return discovery.fetch({
              descriptors,
              gapLimit,
              async onProgress() {
                fetchProgressCounter++;
                //abort fetch
                if (activeWallet.walletId !== walletIdRef.current) return false;
                if (fetchProgressCounter % UI_YIELD_ITERATION_COUNT === 0) {
                  await new Promise(resolve =>
                    setTimeout(resolve, UI_YIELD_ITERATION_TIME_MS)
                  );
                }
                return;
              }
            });
          }
        });
        if (activeWallet.walletId !== walletIdRef.current) {
          //do this after each await
          batchedUpdates(() => {
            setSyncingBlockchain(activeWallet.walletId, false);
            rollbackEarlyAccounts(); //Read TAGsijufnviudsgndsf
          });
          return;
        }
        if (fetchStatus !== 'SUCCESS') {
          //also don't continue if discovery fails
          batchedUpdates(() => {
            setSyncingBlockchain(activeWallet.walletId, false);
            rollbackEarlyAccounts(); //Read TAGsijufnviudsgndsf
          });
          return;
        }

        //Update states:
        batchedUpdates(() => {
          //Already upated Read TAGsijufnviudsgndsf
          //if (accounts !== updatedAccounts) setAccounts(updatedAccounts);

          if (lastP2PBackupVaultIndex !== undefined)
            setActiveWallet(currentWallet =>
              currentWallet?.walletId === activeWallet.walletId &&
              currentWallet.lastP2PBackupVaultIndex !== lastP2PBackupVaultIndex
                ? { ...currentWallet, lastP2PBackupVaultIndex }
                : currentWallet
            );
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
          batchedUpdates(() => {
            setSyncingBlockchain(activeWallet.walletId, false);
            rollbackEarlyAccounts(); //Read TAGsijufnviudsgndsf
          });
          return;
        }

        netToast(
          false,
          t('app.syncUnexpectedError', {
            message:
              error instanceof Error ? error.message : t('app.unknownError')
          })
        );
        rollbackEarlyAccounts();
      }
    }

    setSyncingBlockchain(activeWallet.walletId, false);
  }, [
    walletTitle,
    netToast,
    netStatusUpdate,
    isWalletDiskSynched,
    isCoreNetReady,
    needsP2PBackupScan,
    watchtowerAPIReachable,
    cBVaultsReaderAPIReachable,
    updateBtcFiat,
    updateFeeEstimates,
    updateTipStatus,
    setUtxosHistoryExport,
    persistAccounts,
    setSyncingBlockchain,
    activeWallet?.walletId,
    activeWallet?.lastP2PBackupVaultIndex,
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

  // Trigger sync only when syncingBlockchain rises to true. This avoids
  // re-entering sync if early state updates (for example setAccounts below)
  // recreate the sync callback while the flag is already true.
  // sync() sets syncingBlockchain[walletId] back to false when it completes.
  // syncingBlockchain is set to true either by the user or automatically below
  // when wallet/network/tip readiness changes.
  useEffect(() => {
    if (activeWallet?.walletId === undefined) {
      wasSyncingBlockchainRef.current = false;
      return;
    }

    const isSyncing = walletsSyncingBlockchain[activeWallet.walletId] === true;
    const wasSyncing = wasSyncingBlockchainRef.current;
    wasSyncingBlockchainRef.current = isSyncing;

    if (isSyncing && !wasSyncing) sync();
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
      isCoreNetReady
    ) {
      setSyncingBlockchain(activeWallet.walletId, true);
    }
  }, [
    activeWallet?.walletId,
    setSyncingBlockchain,
    isWalletDiskSynched,
    isCoreNetReady,
    tipHeight
  ]);

  /**
   * Pushes the vault together with its on-chain backup package and stores all
   * associated data locally:
   * It updates utxosData, history, vaults and vaultsStatuses without
   * requiring any additional fetch.
   * It also saves on disk discoveryExport.
   *
   * This function won't request user permissions for push notifications.
   *
   * Pass `customWalletChangeToTrack` only when the vault uses a custom wallet
   * change address. Normal wallet change already belongs to tracked accounts, so
   * leave it unset in the default case. When set, this function scans and tracks
   * the wallet account range so the change output appears in UTXO/history.
   *
   * This function may throw. try-catch it from outer blocks.
   *
   * If the push or saving state fail for any reason, then it throws.
   */
  const pushVaultRegisterWTAndUpdateStates = useCallback(
    async (
      vault: Vault,
      customWalletChangeToTrack?: DescriptorWithIndex
    ): Promise<{ backupTxHex: string }> => {
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
      if (!signers) throw new Error('signers unavailable');
      const signer = signers[0];
      if (!signer) throw new Error('signer unavailable');

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
      const accountToTrack = customWalletChangeToTrack?.descriptor.replace(
        /\/[01]\/\*/g,
        '/0/*'
      );

      // createOnChainBackupTx decrypts its own OP_RETURN and reconstructs the
      // presigned trigger/rescue txs. If that fails, stop before broadcasting
      // the vault package so we never create an unrecoverable on-chain vault.
      let backupTxHex: string;
      try {
        backupTxHex = await createOnChainBackupTx({ vault, signer });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        // The create screen uses this prefix to show a precise pre-broadcast
        // message instead of the generic "maybe sent" package-push warning.
        throw new Error(
          `${ONCHAIN_BACKUP_PRE_BROADCAST_ERROR_PREFIX} ${message}`
        );
      }
      await pushTxPackage({
        parentTxHex: vault.vaultTxHex,
        childTxHex: backupTxHex
      });
      if (accountToTrack) await fetchAccount(accountToTrack);
      const updatedAccounts = accountToTrack
        ? await ensureAccountTracked(accountToTrack)
        : accountsRef.current;
      if (!updatedAccounts) throw new Error('Accounts not ready');

      const stateUpdatePromises: Array<Promise<void>> = [];
      batchedUpdates(() => {
        stateUpdatePromises.push(
          setVaults(newVaults),
          setVaultsStatuses(newVaultsStatuses),
          setUtxosHistoryExport(
            newVaults,
            newVaultsStatuses,
            updatedAccounts,
            tipHeight
          )
        );
      });
      // Wait for all state updates to complete
      await Promise.all(stateUpdatePromises);
      return { backupTxHex };
    },
    [
      activeWallet?.walletId,
      fetchAccount,
      ensureAccountTracked,
      signers,
      pushTxPackage,
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
   * Pass `customWalletChangeToTrack` only when the transaction uses a custom
   * wallet change address. Normal wallet change already belongs to tracked
   * accounts, so leave it unset in the default case. When set, this function
   * scans and tracks the wallet account range so the change output appears in
   * UTXO/history.
   *
   * This function may throw. try-catch it from outer blocks.
   */
  const txPushAndUpdateStates = useCallback(
    async (
      txHex: string,
      customWalletChangeToTrack?: DescriptorWithIndex
    ): Promise<void> => {
      if (!vaults || !vaultsStatuses)
        throw new Error('vaults and vaultsStatuses should be defined');
      if (!accounts || tipHeight === undefined)
        throw new Error(
          `Cannot txPushAndUpdateStates without accounts: ${!!accounts} or tipHeight: ${!!tipHeight}`
        );
      const accountToTrack = customWalletChangeToTrack?.descriptor.replace(
        /\/[01]\/\*/g,
        '/0/*'
      );
      if (accountToTrack) await fetchAccount(accountToTrack);
      await pushTx(txHex);
      const updatedAccounts = accountToTrack
        ? await ensureAccountTracked(accountToTrack)
        : accountsRef.current;
      if (!updatedAccounts) throw new Error('Accounts not ready');
      await setUtxosHistoryExport(
        vaults,
        vaultsStatuses,
        updatedAccounts,
        tipHeight
      );
    },
    [
      pushTx,
      accounts,
      fetchAccount,
      ensureAccountTracked,
      tipHeight,
      setUtxosHistoryExport,
      vaults,
      vaultsStatuses
    ]
  );

  const updateVaultStatus = useCallback(
    (vaultId: string, vaultStatus: VaultStatus) => {
      const currVaultStatus = vaultsStatuses?.[vaultId];
      const accountsToUse = accountsRef.current;
      if (!vaults || !accountsToUse || !tipHeight)
        throw new Error('Cannot update statuses for non-initialized data');
      if (!currVaultStatus)
        throw new Error('Cannot update unexisting vault status');
      if (!shallowEqualObjects(currVaultStatus, vaultStatus)) {
        const newVaultsStatuses = { ...vaultsStatuses, [vaultId]: vaultStatus };
        //no need to await setUtxosHistoryExport since the await is only realated
        //to saving in disk dataExport, which is not really important since it
        //is just some initial point when opening a wallet before full sync
        setUtxosHistoryExport(
          vaults,
          newVaultsStatuses,
          accountsToUse,
          tipHeight
        );
        setVaultsStatuses(newVaultsStatuses);
      }
    },
    [
      vaults,
      setUtxosHistoryExport,
      tipHeight,
      vaultsStatuses,
      setVaultsStatuses
    ]
  );

  const canFetchReserveDescriptorData = !!(
    discovery &&
    vaults &&
    activeWallet?.networkId &&
    gapLimit !== undefined &&
    explorerReachable === true
  );

  const contextValue = {
    pushToken,
    setPushToken,
    getUnvaultKeyExpression,
    getChangeDescriptorWithNextIndex,
    getRangedDescriptorWithNextIndex,
    getRangedDescriptorStatus,
    fetchRangedDescriptor,
    getOutputHistory,
    trackAccount,
    getNextOnChainBackupIndex,
    getReceiveDescriptorWithNextIndex,
    fetchServiceAddress,
    updateVaultStatus,
    btcFiat,
    signersStorageEngineMismatch,
    signers,
    accounts,
    discoveryReady: !!discovery,
    getPreferredAccount,
    labels,
    setWalletLabelText,
    setWalletLabelTextsIfEmpty,
    importBip329Labels,
    exportBip329Labels,
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
    //getTxosData,
    canFetchReserveDescriptorData,
    fetchReserveDescriptorData,
    pushTxPackage,
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
