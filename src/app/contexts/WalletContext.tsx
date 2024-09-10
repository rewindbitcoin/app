//TODO: important FIX when the rates are not downloaded the SetupVaultsScreen
//crashes
//Same for unset utxosData. Simply disable that button / route or show
//some warning Asking users to go back for not having rates / utxos yet
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
import type { Accounts, Signers, Wallets } from '../lib/wallets';
import { getAPIs } from '../lib/walletDerivedData';
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
import { useToast } from '../../common/ui';
import { SERIALIZABLE, deleteAsync } from '../../common/lib/storage';
import { useTranslation } from 'react-i18next';

import {
  DiscoveryFactory,
  type DiscoveryInstance,
  type TxAttribution
} from '@bitcoinerlab/discovery';
import type { FeeEstimates } from '../lib/fees';
import { Platform } from 'react-native';
import { batchedUpdates } from '~/common/lib/batchedUpdates';
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
import { Explorer, EsploraExplorer } from '@bitcoinerlab/explorer';
import type { BlockStatus } from '@bitcoinerlab/explorer';

export const WalletContext: Context<WalletContextType | null> =
  createContext<WalletContextType | null>(null);

type TxHistory = Array<{
  txHex: TxHex;
  blockHeight: number;
  irreversible: boolean;
}>;

export type WalletContextType = {
  getChangeDescriptor: () => Promise<string>;
  fetchServiceAddress: () => Promise<string>;
  getUnvaultKey: () => Promise<string>;
  updateVaultStatus: (vaultId: string, vaultStatus: VaultStatus) => void;
  btcFiat: number | undefined;
  feeEstimates: FeeEstimates | undefined;
  tipStatus: BlockStatus | undefined;
  utxosData: UtxosData | undefined;
  historyData: HistoryData | undefined;
  signers: Signers | undefined;
  accounts: Accounts | undefined;
  vaults: Vaults | undefined;
  vaultsStatuses: VaultsStatuses | undefined;
  networkId: NetworkId | undefined;
  fetchBlockTime: (blockHeight: number) => Promise<number | undefined>;
  pushTx: (txHex: string) => Promise<void>;
  fetchOutputHistory: ({
    descriptor,
    index
  }: {
    descriptor: string;
    index?: number;
  }) => Promise<TxHistory | undefined>;
  vaultPushAndUpdateStates: (vault: Vault) => Promise<void>;
  syncBlockchain: () => void;
  syncingBlockchain: boolean;
  vaultsAPI: string | undefined;
  faucetAPI: string | undefined;
  vaultsSecondaryAPI: string | undefined;
  blockExplorerURL: string | undefined;
  wallets: Wallets | undefined;
  wallet: Wallet | undefined;
  walletStatus: WalletStatus;
  /** Whether the wallet needs to ask for a password and set it to retrieve
   * the signers */
  requiresPassword: boolean;
  logOut: () => Promise<void>;
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
  const [wallet, setWallet] = useState<Wallet>();
  const walletId = wallet?.walletId;
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

  const { btcFiat } = useBtcFiat();

  const toast = useToast();

  const secureStorageInfo = useSecureStorageInfo();
  const { t } = useTranslation();

  const networkId = wallet?.networkId;
  const signersStorageEngine = wallet?.signersStorageEngine;
  const network = networkId && networkMapping[networkId];
  if (wallet && !network) throw new Error(`Invalid networkId ${networkId}`);

  if (
    (signersStorageEngine === 'MMKV' && Platform.OS === 'web') ||
    (signersStorageEngine === 'IDB' && Platform.OS !== 'web') ||
    (signersStorageEngine === 'SECURESTORE' &&
      secureStorageInfo &&
      secureStorageInfo.canUseSecureStorage === false)
  ) {
    throw new Error(
      `signersStorageEngine ${signersStorageEngine} does not match this system specs: ${Platform.OS}, canUseSecureStorage=${secureStorageInfo && secureStorageInfo.canUseSecureStorage}. Have you not enabled Biometric id in your system?`
    );
  }

  const { settings, settingsStorageStatus } = useSettings();
  const gapLimit = settings?.GAP_LIMIT;

  const {
    mainnetEsploraApi,
    esploraAPI,
    serviceAddressAPI,
    vaultsAPI,
    faucetAPI,
    vaultsSecondaryAPI,
    generate204API,
    generate204API2,
    generate204APIExternal,
    blockExplorerURL
  } = getAPIs(networkId, settings);
  const [wallets, setWallets, , , walletsStorageStatus] = useStorage<Wallets>(
    `WALLETS`,
    SERIALIZABLE,
    {}
  );

  const initSigners =
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
  useEffect(() => {
    const initDiscovery = async () => {
      if (
        walletId !== undefined &&
        esploraAPI &&
        network &&
        discoveryExportStorageStatus.isSynchd &&
        //discoveryExport may be changing continuously (this is the data that
        //will be retrieved from disk next time the App is open). However the
        //discovery instance should be kept the same once the App is open.
        !walletsDiscovery[walletId]
      ) {
        const explorer = new EsploraExplorer({ url: esploraAPI });
        //explorer.connect performed in NetSTatusContext
        const { Discovery } = DiscoveryFactory(explorer, network);
        const discovery = discoveryExport
          ? new Discovery({ imported: discoveryExport })
          : new Discovery();
        setDiscovery(walletId, discovery);
      }
    };
    initDiscovery();
    //Note there is no cleanup. Discovery is closed on logout
  }, [
    walletId,
    discoveryExport,
    discoveryExportStorageStatus.isSynchd,
    esploraAPI,
    network,
    setDiscovery,
    walletsDiscovery
  ]);
  const discovery =
    walletId !== undefined ? walletsDiscovery[walletId] : undefined;

  useEffect(() => {
    const initializeMainnetExplorer = async () => {
      if (mainnetEsploraApi && !explorerMainnet && networkId === 'TAPE') {
        const newExplorerMainnet = new EsploraExplorer({
          url: mainnetEsploraApi
        }); //explorer.connect performed in NetSTatusContext
        setExplorerMainnet(newExplorerMainnet);
      }
    };
    initializeMainnetExplorer();
    return () => {
      if (explorerMainnet) explorerMainnet.close();
    };
  }, [mainnetEsploraApi, explorerMainnet, networkId]);

  const {
    reset: netStatusReset,
    init: netStatusInit,
    update: netStatusUpdate,
    apiReachable,
    explorerReachable,
    explorerMainnetReachable
  } = useNetStatus();
  const netReady =
    apiReachable &&
    explorerReachable &&
    (networkId !== 'TAPE' || explorerMainnetReachable);

  useEffect(() => {
    batchedUpdates(() => {
      if (discovery) {
        netStatusInit({
          networkId,
          explorer: discovery.getExplorer(),
          generate204API,
          generate204API2,
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
    });
  }, [
    discovery,
    networkId,
    generate204API,
    generate204API2,
    generate204APIExternal,
    explorerMainnet,
    netStatusInit
  ]);

  const { tipStatus, updateTipStatus } = useTipStatus();
  const tipHeight = tipStatus?.blockHeight;
  const { feeEstimates } = useFeeEstimates();

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
   * Call this when the wallet is updated somehow: chanegs in vaults in
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
    isNewWallet: walletId !== undefined && !!walletsNewSigners[walletId],
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

  const isFirstLogin =
    dataReady && walletId !== undefined && !!walletsNewSigners[walletId];

  useEffect(() => {
    if (dataReady) {
      if (!wallet) throw new Error('wallet should be set when ready');
      if (walletId === undefined) throw new Error('walletd undefined');
      if (!wallets) throw new Error('wallets should be set when ready');
      if (!shallowEqualObjects(wallet, wallets[walletId])) {
        setWallets({ ...wallets, [walletId]: wallet });
      }
    }
  }, [setWallets, wallets, wallet, dataReady, walletId]);

  /**
   * Important, to logOut from wallet, wallet (and therefore walletId) must
   * be the current state. It's not possible to pass walletId as argument since
   * we must use the clear functions set in useStorage when created with the current
   * wallet
   */
  const logOut = useCallback(async () => {
    if (walletId !== undefined) {
      try {
        await discovery?.getExplorer().close();
      } catch (err) {} //don't care about errors here
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
        setWallet(undefined);
        netStatusReset(); //Stop checking network
      });
    }
  }, [
    netStatusReset,
    walletId,
    discovery,
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
        //logOut(); //Log out from previous wallet
        setWallet(prevWallet => {
          //Net status depends on the wallet (explorer, ...); so reset it ONLY when it changes
          if (prevWallet !== walletDst) netStatusReset();
          return walletDst;
        });
        if (walletId !== undefined) {
          if (signersCipherKey) setSignersCipherKey(walletId, signersCipherKey);
          setNewSigners(walletId, newSigners);
        }
      });
    },
    [
      //logOut,
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

  const getChangeDescriptor = useCallback(async () => {
    if (!network) throw new Error('Network not ready');
    if (!accounts) throw new Error('Accounts not ready');
    if (!Object.keys(accounts).length) throw new Error('Accounts not set');
    if (!discovery) throw new Error('Discovery not ready');
    const account = getMainAccount(accounts, network);
    const changeDescriptorRanged = account.replace(/\/0\/\*/g, '/1/*');
    return changeDescriptorRanged.replaceAll(
      '*',
      discovery
        .getNextIndex({
          descriptor: changeDescriptorRanged
        })
        .toString()
    );
  }, [network, accounts, discovery]);

  const getUnvaultKey = useCallback(async () => {
    if (!network) throw new Error('Network not ready');
    if (!signers) throw new Error('Signers not ready');
    const signer = signers[0];
    if (!signer) throw new Error('signer unavailable');
    return await createUnvaultKey({ signer, network });
  }, [network, signers]);

  const fetchServiceAddress = useCallback(async () => {
    if (!serviceAddressAPI) {
      throw new Error('System not ready to fetch the service address.');
    }

    try {
      const response = await fetch(`${serviceAddressAPI}/get`);
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
  }, [serviceAddressAPI]);

  //Dit the user initiated the sync (true)? ir was it a scheduled one (false)?
  const isUserTriggeredSync = useRef<boolean>(false);

  /**
   * Initiates the blockchain synchronization process. If netStatus has errors
   * it tries first to check the network .
   */
  const sync = useCallback(async () => {
    if (walletId === undefined) throw new Error('Cannot sync an unset wallet');
    const isUserTriggered = isUserTriggeredSync.current;
    isUserTriggeredSync.current = false;

    let updatedNetReady = netReady;
    console.log('TRACE sync', {
      walletId,
      networkId,
      updatedNetReady,
      isUserTriggered
    });
    if (updatedNetReady === false && isUserTriggered) {
      //only check netStatus changes when we're sure the network is down and the
      //user is requesting it. This is because this is an expensive operation
      //and sync may also be called automatically on dependencies of dataReady,
      //netReady, callback functions and so on...
      console.log('TRACE sync netStatusUpdate');
      const ns = await netStatusUpdate();
      console.log('TRACE sync netStatusUpdate done');
      updatedNetReady =
        ns?.apiReachable &&
        ns?.explorerReachable &&
        (networkId !== 'TAPE' || ns?.explorerMainnetReachable);
      if (!updatedNetReady && ns?.errorMessage) {
        toast.show(ns.errorMessage, { type: 'warning' });
      }
    }
    const signer = signers?.[0];
    if (
      dataReady &&
      updatedNetReady &&
      networkId &&
      gapLimit !== undefined &&
      discovery &&
      vaults &&
      vaultsStatuses &&
      accounts &&
      //When a new vault is created, vaults, vaultsStatuses and accounts are not
      //atomically set in state at the same time.
      //Wait until both are set before proceeding. This is important because
      //updateVaultsStatuses upddate status based on vaults so they must be
      //synched
      areVaultsSynched(vaults, vaultsStatuses) &&
      signer &&
      vaultsAPI
    ) {
      console.log('TRACE sync proceeding');
      const network = networkId && networkMapping[networkId];

      try {
        const updatedTipHeight = (await updateTipStatus())?.blockHeight;
        console.log('TRACE sync proceeding', { updatedTipHeight });
        if (updatedTipHeight) {
          //First get updatedVaults & updatedVaultsStatuses:
          const p2pVaults = await fetchP2PVaults({
            signer,
            networkId,
            vaultsAPI,
            vaults
          });
          console.log('TRACE sync proceeding', { p2pVaults });
          let updatedVaults = vaults; //initially they are the same
          p2pVaults &&
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

          const freshVaultsStatuses = await fetchVaultsStatuses(
            updatedVaults,
            vaultsStatuses,
            discovery.getExplorer()
          );
          console.log('TRACE sync proceeding', { freshVaultsStatuses });

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
              console.log('TRACE sync proceeding', { defaultAccount });
              updatedAccounts[defaultAccount] = { discard: false };
            } else {
              if (!signer.mnemonic)
                throw new Error('mnemonic not set for soft wallet');
              const masterNode = getMasterNode(signer.mnemonic, network);
              await discovery.fetchStandardAccounts({ masterNode, gapLimit });
              console.log('TRACE sync proceeding fetchedStandardAccounts');
              const usedAccounts = discovery.getUsedAccounts();
              if (usedAccounts.length)
                for (const usedAccount of usedAccounts)
                  updatedAccounts[usedAccount] = { discard: false };
              else {
                const defaultAccount = await getDefaultAccount(
                  signers,
                  network
                );
                updatedAccounts[defaultAccount] = { discard: false };
              }
              console.log('TRACE sync proceeding', { getDefaultAccount });
            }
            setAccounts(updatedAccounts);
          }
          const descriptors = getHotDescriptors(
            updatedVaults,
            updatedVaultsStatuses,
            updatedAccounts,
            updatedTipHeight
          );
          await discovery.fetch({ descriptors, gapLimit });
          console.log('TRACE sync proceeding discovery.fetch');
          if (vaults !== updatedVaults) setVaults(updatedVaults);
          if (vaultsStatuses !== updatedVaultsStatuses)
            setVaultsStatuses(updatedVaultsStatuses);
          await setUtxosHistoryExport(
            updatedVaults,
            updatedVaultsStatuses,
            updatedAccounts,
            updatedTipHeight
          );
          console.log('TRACE sync proceeding setUtxosHistoryExport');
        }
      } catch (error) {
        console.log('TRACE sync proceeding catch', { error });
        console.warn(error);
        const errorMessage =
          error instanceof Error ? error.message : t('app.unknownError');

        toast.show(t('app.syncError', { message: errorMessage }), {
          type: 'warning'
        });
      }
    }

    console.log('TRACE sync proceeding setSyncingBlockchain to false now');
    setSyncingBlockchain(walletId, false);
  }, [
    netStatusUpdate,
    dataReady,
    netReady,
    updateTipStatus,
    setUtxosHistoryExport,
    setAccounts,
    setSyncingBlockchain,
    walletId,
    accounts,
    t,
    toast,
    discovery,
    setVaults,
    setVaultsStatuses,
    vaults,
    vaultsStatuses,
    networkId,
    signers,
    vaultsAPI,
    gapLimit
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
   * Pushes the vault and stores all associated data locally:
   * It updates utxosData, history, vaults and vaultsStatuses without
   * requiring any additional fetch.
   * It also saves on disk discoveryExport.
   *
   * This function may throw. try-catch it from outer blocks.
   *
   * If the push or saving state fail for any reason, then it throws.
   */
  const vaultPushAndUpdateStates = useCallback(
    async (vault: Vault): Promise<void> => {
      if (!vaults || !vaultsStatuses)
        throw new Error('Cannot use vaults without Storage');
      if (!vaults || !vaultsStatuses)
        throw new Error(
          'vaults and vaultsStatuses should be defined since they are synched'
        );
      if (!accounts || tipHeight === undefined)
        throw new Error(
          `Cannot vaultPushAndUpdateStates without accounts: ${!!accounts} or tipHeight: ${!!tipHeight}`
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

  const updateVaultStatus = useCallback(
    (vaultId: string, vaultStatus: VaultStatus) => {
      const currVaultStatus = vaultsStatuses?.[vaultId];
      if (!vaults || !accounts || !tipHeight)
        throw new Error('Cannot update statuses for uinit data');
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
    getChangeDescriptor,
    fetchServiceAddress,
    updateVaultStatus,
    btcFiat,
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
    vaultPushAndUpdateStates,
    syncBlockchain,
    syncingBlockchain: !!(
      walletId !== undefined && walletsSyncingBlockchain[walletId]
    ),
    fetchBlockTime,
    pushTx,
    fetchOutputHistory,
    vaultsAPI,
    faucetAPI,
    vaultsSecondaryAPI,
    blockExplorerURL,
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
    onWallet,
    isFirstLogin
  };
  return (
    <WalletContext.Provider value={contextValue}>
      {children}
    </WalletContext.Provider>
  );
};
export const WalletProvider = React.memo(WalletProviderRaw);
