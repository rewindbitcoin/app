//TODO: impportant FIX when the rates are not downloaded the SetupVaultsScreen
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
import {
  ensureConnected,
  getAPIs,
  getDisconnectedDiscovery
} from '../lib/walletDerivedData';
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
  useCallback
} from 'react';
import { shallowEqualObjects } from 'shallow-equal';
import type { Wallet } from '../lib/wallets';
import { useToast } from '../../common/ui';
import { SERIALIZABLE, deleteAsync } from '../../common/lib/storage';
import { useTranslation } from 'react-i18next';

import type { DiscoveryInstance, TxAttribution } from '@bitcoinerlab/discovery';
import type { FeeEstimates } from '../lib/fees';
import {
  Platform,
  unstable_batchedUpdates as RN_unstable_batchedUpdates
} from 'react-native';
const unstable_batchedUpdates = Platform.select({
  web: (cb: () => void) => {
    cb();
  },
  default: RN_unstable_batchedUpdates
});
import { fetchP2PVaults, getDataCipherKey } from '../lib/backup';

type DiscoveryDataExport = ReturnType<DiscoveryInstance['export']>;

import { WalletError, getWalletError, getIsCorrupted } from '../lib/errors';

import { useStorage } from '../../common/hooks/useStorage';
import { useSecureStorageInfo } from '../../common/contexts/SecureStorageInfoContext';
import { useSettings } from '../hooks/useSettings';
import { useBtcFiat } from '../hooks/useBtcFiat';
import { useTipStatus } from '../hooks/useTipStatus';
import { useFeeEstimates } from '../hooks/useFeeEstimates';
import { useWalletState } from '../hooks/useWalletState';
import type { BlockStatus } from '@bitcoinerlab/explorer/dist/interface';

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
  pushTx: (txHex: string) => Promise<boolean>;
  fetchOutputHistory: ({
    descriptor,
    index
  }: {
    descriptor: string;
    index?: number;
  }) => Promise<TxHistory | undefined>;
  processCreatedVault: (
    vault:
      | Vault
      | 'COINSELECT_ERROR'
      | 'NOT_ENOUGH_FUNDS'
      | 'USER_CANCEL'
      | 'UNKNOWN_ERROR'
  ) => Promise<boolean>;
  syncBlockchain: () => void;
  syncingBlockchain: boolean;
  vaultsAPI: string | undefined;
  faucetAPI: string | undefined;
  vaultsSecondaryAPI: string | undefined;
  wallets: Wallets | undefined;
  wallet: Wallet | undefined;
  walletError: WalletError;
  /** Whether the wallet needs to ask for a password and set it to retrieve
   * the signers */
  requiresPassword: boolean;
  logOut: () => void;
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
  const [newSigners, setNewSigners, clearNewSigners] =
    useWalletState<Signers>();

  const [signersCipherKey, setSignersCipherKey, clearSignersCipherKey] =
    useWalletState<Uint8Array>();
  const [dataCipherKey, setDataCipherKey, clearDataCipherKey] =
    useWalletState<Uint8Array>();

  const [utxosData, setUtxosData, clearUtxosData] = useWalletState<UtxosData>();
  const [historyData, setHistoryData, clearHistoryData] =
    useWalletState<HistoryData>();
  const [syncingBlockchain, setSyncingBlockchain, clearSynchingBlockchain] =
    useWalletState<boolean>();

  const btcFiat = useBtcFiat();

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
    esploraAPI,
    serviceAddressAPI,
    vaultsAPI,
    faucetAPI,
    vaultsSecondaryAPI
  } = getAPIs(networkId, settings);
  const [wallets, setWallets, , , walletsStorageStatus] = useStorage<Wallets>(
    `WALLETS`,
    SERIALIZABLE,
    {}
  );

  const initSigners =
    walletId !== undefined &&
    (wallet?.signersEncryption !== 'PASSWORD' || signersCipherKey[walletId]);

  const [signers, , , clearSignersCache, signersStorageStatus] =
    useStorage<Signers>(
      initSigners ? `SIGNERS_${walletId}` : undefined,
      SERIALIZABLE,
      walletId === undefined ? undefined : newSigners[walletId],
      signersStorageEngine,
      walletId === undefined ? undefined : signersCipherKey[walletId],
      t('app.secureStorageAuthenticationPrompt')
    );

  const initData =
    walletId !== undefined &&
    signersStorageStatus.errorCode === false &&
    (wallet?.encryption !== 'SEED_DERIVED' || dataCipherKey[walletId]);

  const [
    discoveryDataExport,
    setDiscoveryDataExport,
    ,
    clearDiscoveryCache,
    discoveryStorageStatus
  ] = useStorage<DiscoveryDataExport>(
    initData ? `DISCOVERY_${walletId}` : undefined,
    SERIALIZABLE,
    undefined,
    undefined,
    walletId !== undefined ? dataCipherKey[walletId] : undefined
  );
  //getDisconnectedDiscovery uses memoization for all keys except discoveryDataExport
  const initialDiscovery = getDisconnectedDiscovery(
    walletId,
    esploraAPI,
    networkId,
    discoveryDataExport,
    discoveryStorageStatus.isSynchd
  );

  const { tipStatus, updateTipStatus } = useTipStatus({ initialDiscovery });
  const tipHeight = tipStatus?.blockHeight;
  const isTipStatusReady = !!tipStatus;
  const feeEstimates = useFeeEstimates({ initialDiscovery, network });

  const [vaults, setVaults, , clearVaultsCache, vaultsStorageStatus] =
    useStorage<Vaults>(
      initData ? `VAULTS_${walletId}` : undefined,
      SERIALIZABLE,
      DEFAULT_VAULTS,
      undefined,
      walletId !== undefined ? dataCipherKey[walletId] : undefined
    );

  const [
    vaultsStatuses,
    setVaultsStatuses,
    ,
    clearVaultsStatusesCache,
    vaultsStatusesStorageStatus
  ] = useStorage<VaultsStatuses>(
    initData ? `VAULTS_STATUSES_${walletId}` : undefined,
    SERIALIZABLE,
    DEFAULT_VAULTS_STATUSES,
    undefined,
    walletId !== undefined ? dataCipherKey[walletId] : undefined
  );

  const [accounts, setAccounts, , clearAccountsCache, accountsStorageStatus] =
    useStorage<Accounts>(
      initData ? `ACCOUNTS_${walletId}` : undefined,
      SERIALIZABLE,
      DEFAULT_ACCOUNTS,
      undefined,
      walletId !== undefined ? dataCipherKey[walletId] : undefined
    );

  const setUtxosAndHistoryData = useCallback(
    async (
      vaults: Vaults,
      vaultsStatuses: VaultsStatuses,
      accounts: Accounts,
      tipHeight: number
    ) => {
      const discovery =
        initialDiscovery && (await ensureConnected(initialDiscovery));
      if (
        tipHeight !== undefined &&
        discovery &&
        network &&
        walletId !== undefined
      ) {
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
        unstable_batchedUpdates(() => {
          setUtxosData(walletId, walletUtxosData);
          setHistoryData(walletId, walletHistoryData);
        });
        return true;
      } else return false;
    },
    [initialDiscovery, network, setUtxosData, setHistoryData, walletId]
  );

  /**
   * pushTx not only pushes the tx but it also updates the discovery internal
   * data model with the info extracted from txHex
   */
  const pushTx = useCallback(
    async (txHex: string): Promise<boolean> => {
      const discovery =
        initialDiscovery && (await ensureConnected(initialDiscovery));
      if (!discovery)
        throw new Error(
          `Discovery not ready for pushTx while trying to push ${txHex}`
        );
      if (gapLimit === undefined)
        throw new Error(
          `gapLimit not ready for pushTx while trying to push ${txHex}`
        );
      try {
        await discovery.push({ txHex, gapLimit });
      } catch (error) {
        const errorMessage =
          error instanceof Error
            ? error.message
            : t('An unknown error occurred'); //TODO: translate

        toast.show(t('networkError', { message: errorMessage }), {
          type: 'warning'
        });
        return false;
      }
      return true;
    },
    [initialDiscovery, gapLimit, t, toast]
  );

  /**
   * This is useful when the wallet is expecting funds in a speciffic output
   * determined by descriptor (and index if ranged).
   *
   * By calling this function, the internal discovery data is updated and a
   * full blockchain sync (which is expensive) can be avoided.
   *
   * It returns the history of the address (can be empty) or undefined if
   * an error was found.
   *
   * Typically called when expecting a faucet in the firstReceiveAddress or
   * when expecting some new money in a recently created address.
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
      const discovery =
        initialDiscovery && (await ensureConnected(initialDiscovery));
      if (!discovery)
        throw new Error(
          `Discovery not ready for fetchTxHistory while trying to fetch descriptor ${descriptor}:${index}`
        );
      try {
        const descriptorWithIndex = {
          descriptor,
          ...(index !== undefined ? { index } : {})
        };
        const initialHistory = discovery.getHistory(descriptorWithIndex);
        await discovery.fetch(descriptorWithIndex);
        const history = discovery.getHistory(descriptorWithIndex) as TxHistory;
        if (initialHistory !== history) {
          const result = await setUtxosAndHistoryData(
            vaults,
            vaultsStatuses,
            accounts,
            tipHeight
          );
          if (!result) throw new Error('Could not set utxos and data');
        }
        return history;
      } catch (error) {
        const errorMessage =
          error instanceof Error
            ? error.message
            : t(
                'An unknown error occurred while fetching history of an output'
              ); //TODO: translate
        toast.show(t('networkError', { message: errorMessage }), {
          type: 'warning'
        });
        return;
      }
    },
    [
      initialDiscovery,
      t,
      toast,
      setUtxosAndHistoryData,
      vaults,
      vaultsStatuses,
      accounts,
      tipHeight
    ]
  );

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
  const isReady =
    walletsStorageStatus.isSynchd &&
    discoveryStorageStatus.isSynchd &&
    signersStorageStatus.isSynchd &&
    vaultsStorageStatus.isSynchd &&
    vaultsStatusesStorageStatus.isSynchd &&
    accountsStorageStatus.isSynchd &&
    walletsStorageStatus.errorCode === false &&
    discoveryStorageStatus.errorCode === false &&
    signersStorageStatus.errorCode === false &&
    vaultsStorageStatus.errorCode === false &&
    vaultsStatusesStorageStatus.errorCode === false &&
    accountsStorageStatus.errorCode === false &&
    !isCorrupted;

  const isFirstLogin =
    isReady && walletId !== undefined && !!newSigners[walletId];

  useEffect(() => {
    if (isReady) {
      if (!wallet) throw new Error('wallet should be set when ready');
      if (walletId === undefined) throw new Error('walletd undefined');
      if (!wallets) throw new Error('wallets should be set when ready');
      if (!shallowEqualObjects(wallet, wallets[walletId])) {
        setWallets({ ...wallets, [walletId]: wallet });
      }
    }
  }, [setWallets, wallets, wallet, isReady, walletId]);

  /**
   * Important, to logOut from wallet, wallet (and therefore walletId) must
   * be the current state. It's not possible to pass walletId as argument since
   * we must use the clear functions set in useStorage when created with the current
   * wallet
   */
  const logOut = useCallback(() => {
    if (walletId !== undefined) {
      initialDiscovery
        ?.getExplorer()
        .close()
        .catch(() => {}); //Swallow any errors.
      unstable_batchedUpdates(() => {
        // Clear cache, so that data must be read from disk again for the walletId.
        // This forces cipherKeys to be evaluated again to decrypt from disk
        // In other words, passwords must be set again
        clearSignersCache();
        clearVaultsCache();
        clearVaultsStatusesCache();
        clearDiscoveryCache();
        clearAccountsCache();
        //Clear other state:
        clearUtxosData(walletId);
        clearHistoryData(walletId);
        clearSynchingBlockchain(walletId);
        clearNewSigners(walletId);
        clearSignersCipherKey(walletId);
        clearDataCipherKey(walletId);
        setWallet(undefined);
      });
    }
  }, [
    walletId,
    initialDiscovery,
    clearSignersCache,
    clearVaultsCache,
    clearVaultsStatusesCache,
    clearDiscoveryCache,
    clearAccountsCache,
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
      unstable_batchedUpdates(() => {
        //logOut(); //Log out from previous wallet
        setWallet(walletDst);
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
      setSignersCipherKey
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
      !utxosData[walletId] &&
      !historyData[walletId] &&
      vaults &&
      vaultsStatuses &&
      accounts &&
      tipHeight !== undefined
    )
      setUtxosAndHistoryData(vaults, vaultsStatuses, accounts, tipHeight);
  }, [
    setUtxosAndHistoryData,
    vaults,
    vaultsStatuses,
    accounts,
    tipHeight,
    walletId,
    utxosData,
    historyData
  ]);

  const getChangeDescriptor = useCallback(async () => {
    if (!network) throw new Error('Network not ready');
    if (!accounts) throw new Error('Accounts not ready');
    if (!Object.keys(accounts).length) throw new Error('Accounts not set');
    if (!initialDiscovery) throw new Error('Discovery not ready');
    const discovery = await ensureConnected(initialDiscovery);
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
  }, [network, accounts, initialDiscovery]);

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
          `Failed to fetch service address: ${response.statusText}`
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

  /**
   * Initiates the blockchain synchronization process.
   */
  const sync = useCallback(async () => {
    if (walletId === undefined) throw new Error('Cannot sync an unset wallet');
    const discovery =
      initialDiscovery && (await ensureConnected(initialDiscovery));
    const signer = signers?.[0];
    if (
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
      const network = networkId && networkMapping[networkId];

      try {
        const updatedTipHeight = (await updateTipStatus())?.blockHeight;
        if (updatedTipHeight) {
          //First get updatedVaults & updatedVaultsStatuses:
          const p2pVaults = await fetchP2PVaults({
            signer,
            networkId,
            vaultsAPI,
            vaults
          });
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
              updatedAccounts[defaultAccount] = { discard: false };
            } else {
              if (!signer.mnemonic)
                throw new Error('mnemonic not set for soft wallet');
              const masterNode = getMasterNode(signer.mnemonic, network);
              await discovery.fetchStandardAccounts({ masterNode, gapLimit });
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
          //Save to disk.
          const exportedData = discovery.export();
          setDiscoveryDataExport(exportedData);
          if (vaults !== updatedVaults) setVaults(updatedVaults);
          if (vaultsStatuses !== updatedVaultsStatuses)
            setVaultsStatuses(updatedVaultsStatuses);
          const result = await setUtxosAndHistoryData(
            updatedVaults,
            updatedVaultsStatuses,
            updatedAccounts,
            updatedTipHeight
          );
          if (!result) throw new Error('Could not set utxos and history');
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error
            ? error.message
            : t('An unknown error occurred'); //TODO: translate

        toast.show(t('networkError', { message: errorMessage }), {
          type: 'warning'
        });
        console.error(errorMessage);
      }
    }

    setSyncingBlockchain(walletId, false);
  }, [
    updateTipStatus,
    setUtxosAndHistoryData,
    setAccounts,
    setSyncingBlockchain,
    walletId,
    accounts,
    setDiscoveryDataExport,
    t,
    toast,
    initialDiscovery,
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
    if (walletId !== undefined && syncingBlockchain[walletId]) sync();
  }, [syncingBlockchain, walletId, sync]);
  //This function is passed in the context so that users can sync
  const syncBlockchain = useCallback(() => {
    if (walletId !== undefined) setSyncingBlockchain(walletId, true);
  }, [walletId, setSyncingBlockchain]);
  //Automatically set syncingBlockchain to true on new walletId: auto sync
  //on new wallet. Make sure blockchainTip is set since otherwise sync()
  //won't do anything as it's necessary.
  //Also it will auto-trigger update on a new block
  useEffect(() => {
    if (walletId !== undefined && isReady && isTipStatusReady) {
      setSyncingBlockchain(walletId, true);
    }
  }, [walletId, setSyncingBlockchain, isReady, isTipStatusReady]);

  /**
   * This already updates utxosData, vaults and vaultsStatuses without
   * requiring any additional fetch.
   */
  const processCreatedVault = useCallback(
    async (
      vault:
        | Vault
        | 'COINSELECT_ERROR'
        | 'NOT_ENOUGH_FUNDS'
        | 'USER_CANCEL'
        | 'UNKNOWN_ERROR'
    ): Promise<boolean> => {
      if (!vaults || !vaultsStatuses)
        throw new Error('Cannot use vaults without Storage');
      if (!vaults || !vaultsStatuses)
        throw new Error(
          'vaults and vaultsStatuses should be defined since they are synched'
        );

      if (typeof vault === 'string') {
        //TODO translate them
        const errorMessages = {
          COINSELECT_ERROR: t('createVault.error.COINSELECT_ERROR'),
          NOT_ENOUGH_FUNDS: t('createVault.error.NOT_ENOUGH_FUNDS'),
          USER_CANCEL: t('createVault.error.USER_CANCEL'),
          UNKNOWN_ERROR: t('createVault.error.UNKNOWN_ERROR')
        };
        const errorMessage = errorMessages[vault];
        if (!errorMessage) throw new Error('Unhandled vault creation error');
        toast.show(errorMessage, { type: 'danger' });
        return false;
      } else {
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

        const pushAndSetUtxosData = async () => {
          if (!accounts || tipHeight === undefined)
            throw new Error(
              `Cannot processCreatedVault without accounts: ${!!accounts} or tipHeight: ${!!tipHeight}`
            );
          //pushTx will update the internal state of initialDiscovery:
          const pushResult = await pushTx(vault.vaultTxHex);
          if (pushResult) {
            const result = await setUtxosAndHistoryData(
              newVaults,
              newVaultsStatuses,
              accounts,
              tipHeight
            );
            if (!result) throw new Error('Could not set utxos and history');
          }
          return pushResult;
        };
        const pushResult = await pushAndSetUtxosData();
        //Note here setVaults, setVaultsStatuses, ...
        //are not atomically set, so when using vaults one
        //must make sure they are synched somehow - See Vaults.tsx for an
        //example what to do
        if (pushResult)
          await Promise.all([
            setVaults(newVaults),
            setVaultsStatuses(newVaultsStatuses)
          ]);
        return pushResult;
      }
    },
    [
      pushTx,
      accounts,
      tipHeight,
      setUtxosAndHistoryData,
      setVaults,
      setVaultsStatuses,
      t,
      toast,
      vaults,
      vaultsStatuses
    ]
  );

  const updateVaultStatus = useCallback(
    (vaultId: string, vaultStatus: VaultStatus) => {
      const currVaultStatus = vaultsStatuses?.[vaultId];
      if (!currVaultStatus)
        throw new Error('Cannot update unexisting vault status');
      if (!shallowEqualObjects(currVaultStatus, vaultStatus))
        setVaultsStatuses({ ...vaultsStatuses, [vaultId]: vaultStatus });
    },
    [vaultsStatuses, setVaultsStatuses]
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
    utxosData: walletId !== undefined ? utxosData[walletId] : undefined,
    historyData: walletId !== undefined ? historyData[walletId] : undefined,
    processCreatedVault,
    syncBlockchain,
    syncingBlockchain: !!(
      walletId !== undefined && syncingBlockchain[walletId]
    ),
    pushTx,
    fetchOutputHistory,
    vaultsAPI,
    faucetAPI,
    vaultsSecondaryAPI,
    wallets,
    wallet,
    walletError: getWalletError({
      isNewWallet: walletId !== undefined && !!newSigners[walletId],
      settingsErrorCode: settingsStorageStatus.errorCode,
      signersErrorCode: signersStorageStatus.errorCode,
      walletsErrorCode: walletsStorageStatus.errorCode,
      discoveryErrorCode: discoveryStorageStatus.errorCode,
      vaultsErrorCode: vaultsStorageStatus.errorCode,
      vaultsStatusesErrorCode: vaultsStatusesStorageStatus.errorCode,
      accountsErrorCode: accountsStorageStatus.errorCode,
      isCorrupted
    }),
    requiresPassword:
      (walletId !== undefined &&
        wallet?.signersEncryption === 'PASSWORD' &&
        !signersCipherKey[walletId]) ||
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
