//TODO: impportant FIX when the rates are not downloaded the SetupVaultsScreen
//crashes
//Same for unset utxosData. Simply disable that button / route or show
//some warning Asking users to go back for not having rates / utxos yet
import {
  fetchVaultsStatuses,
  getUtxosData,
  type Vault,
  type Vaults,
  type VaultsStatuses,
  type UtxosData,
  getDescriptors
} from '../lib/vaults';
import type { AccountNames, Signers, Wallets } from '../lib/wallets';
import {
  ensureConnected,
  getAPIs,
  getDisconnectedDiscovery
} from '../lib/walletDerivedData';
import { networkMapping, NetworkId } from '../lib/network';
import {
  createChangeDescriptor,
  createUnvaultKey
} from '../lib/vaultDescriptors';
import React, {
  createContext,
  type Context,
  ReactNode,
  useEffect,
  useState,
  useCallback
} from 'react';
import { shallowEqualObjects, shallowEqualArrays } from 'shallow-equal';
import type { Wallet } from '../lib/wallets';
import { useToast } from '../../common/ui';
import { SERIALIZABLE, deleteAsync } from '../../common/lib/storage';
import { useTranslation } from 'react-i18next';

import type { DiscoveryInstance } from '@bitcoinerlab/discovery';
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

import { WalletError, getWalletError } from '../lib/errors';
import { useStorage } from '../../common/hooks/useStorage';
import { useSecureStorageInfo } from '../../common/contexts/SecureStorageInfoContext';
import { useSettings } from '../hooks/useSettings';
import { useFeeEstimates } from '../hooks/useFeeEstimates';
import { useBtcFiat } from '../hooks/useBtcFiat';
import { useWalletState } from '../hooks/useWalletState';

export const WalletContext: Context<WalletContextType | null> =
  createContext<WalletContextType | null>(null);

export type WalletContextType = {
  getChangeDescriptor: () => Promise<string>;
  fetchServiceAddress: () => Promise<string>;
  getUnvaultKey: () => Promise<string>;
  btcFiat: number | undefined;
  feeEstimates: FeeEstimates | undefined;
  utxosData: UtxosData | undefined;
  signers: Signers | undefined;
  vaults: Vaults | undefined;
  networkId: NetworkId | undefined;
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
    signersCipherKey
  }: {
    wallet: Wallet;
    newSigners?: Signers;
    signersCipherKey?: Uint8Array;
  }) => Promise<void>;
};

const DEFAULT_VAULTS_STATUSES: VaultsStatuses = {};
const DEFAULT_ACCOUNT_NAMES: AccountNames = {};
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
  const [syncingBlockchain, setSyncingBlockchain, clearSyncihgBlockchain] =
    useWalletState<boolean>();

  const btcFiat = useBtcFiat();

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

  const { feeEstimates, setNetworkId: setFeeEstimatesNetworkId } =
    useFeeEstimates(wallet?.networkId);

  const { settings, settingsStorageStatus } = useSettings();

  const { esploraAPI, serviceAddressAPI, vaultsAPI, vaultsSecondaryAPI } =
    getAPIs(networkId, settings);
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

  const [accountNames, , , clearAccountNamesCache, accountNamesStorageStatus] =
    useStorage<AccountNames>(
      initData ? `ACCOUNT_NAMES_${walletId}` : undefined,
      SERIALIZABLE,
      DEFAULT_ACCOUNT_NAMES,
      undefined,
      walletId !== undefined ? dataCipherKey[walletId] : undefined
    );

  /** When all wallet realated data is synchronized and without any errors.
   * Use this variable to add the wallet into the wallets storage
   */
  const isReady =
    walletsStorageStatus.isSynchd &&
    discoveryStorageStatus.isSynchd &&
    signersStorageStatus.isSynchd &&
    vaultsStorageStatus.isSynchd &&
    vaultsStatusesStorageStatus.isSynchd &&
    accountNamesStorageStatus.isSynchd &&
    walletsStorageStatus.errorCode === false &&
    discoveryStorageStatus.errorCode === false &&
    signersStorageStatus.errorCode === false &&
    vaultsStorageStatus.errorCode === false &&
    vaultsStatusesStorageStatus.errorCode === false &&
    accountNamesStorageStatus.errorCode === false;

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
        clearAccountNamesCache();
        //Clear other state:
        clearUtxosData(walletId);
        clearSyncihgBlockchain(walletId);
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
    clearAccountNamesCache,
    clearUtxosData,
    clearSyncihgBlockchain,
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
      setFeeEstimatesNetworkId(walletDst.networkId);
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
          deleteAsync(`ACCOUNT_NAMES_${walletId}`)
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
      setFeeEstimatesNetworkId,
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

  const toast = useToast();

  //Tries to initialize utxosData from the discovery object we got from disk
  //ASAP (only if not set)
  useEffect(() => {
    const setInitialUtxosData = async () => {
      const discovery =
        initialDiscovery && (await ensureConnected(initialDiscovery));
      if (
        walletId !== undefined &&
        !utxosData[walletId] &&
        vaults &&
        vaultsStatuses &&
        signers &&
        network &&
        discovery
      ) {
        const descriptors = await getDescriptors(
          vaults,
          vaultsStatuses,
          signers,
          network,
          discovery
        );
        //Make sure they are fetched already:
        if (
          descriptors.every(descriptor => discovery.whenFetched({ descriptor }))
        ) {
          const { utxos } = discovery.getUtxosAndBalance({ descriptors });
          const walletUtxosData = getUtxosData(
            utxos,
            vaults,
            network,
            discovery
          );
          setUtxosData(walletId, walletUtxosData);
        }
      }
    };
    setInitialUtxosData();
  }, [
    setUtxosData,
    walletId,
    utxosData,
    initialDiscovery,
    network,
    signers,
    vaults,
    vaultsStatuses
  ]);

  const getChangeDescriptor = useCallback(async () => {
    if (!network) throw new Error('Network not ready');
    if (!signers) throw new Error('Signers not ready');
    if (!initialDiscovery) throw new Error('Discovery not ready');
    const discovery = await ensureConnected(initialDiscovery);
    const signer = signers[0];
    if (!signer) throw new Error('signer unavailable');
    const changeDescriptorRanged = await createChangeDescriptor({
      signer,
      network
    });
    return changeDescriptorRanged.replaceAll(
      '*',
      discovery
        .getNextIndex({
          descriptor: changeDescriptorRanged
        })
        .toString()
    );
  }, [initialDiscovery, network, signers]);

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
    if (walletId !== undefined) {
      const discovery =
        initialDiscovery && (await ensureConnected(initialDiscovery));
      const signer = signers?.[0];
      if (
        networkId &&
        settings?.GAP_LIMIT !== undefined &&
        discovery &&
        vaults &&
        vaultsStatuses &&
        accountNames &&
        //When a new vault is created, vaults, vaultsStatuses and accountNames are not
        //atomically set in state at the same time.
        //Wait until both are set before proceeding. This is important because
        //updateVaultsStatuses upddate status based on vaults so they must be
        //synched
        shallowEqualArrays(Object.keys(vaults), Object.keys(vaultsStatuses)) &&
        //shallowEqualArrays(Object.keys(vaults), Object.keys(accountNames)) &&
        signer &&
        vaultsAPI
      ) {
        const network = networkId && networkMapping[networkId];

        try {
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

          //Now get utxosData
          const descriptors = await getDescriptors(
            updatedVaults,
            updatedVaultsStatuses,
            signers,
            network,
            discovery
          );
          await discovery.fetch({
            descriptors,
            gapLimit: settings.GAP_LIMIT
          });
          //If utxos don't change, then getUtxosAndBalance return the same reference
          //even if descriptors reference is different
          const { utxos } = discovery.getUtxosAndBalance({ descriptors });
          const walletUtxosData = getUtxosData(
            utxos,
            updatedVaults,
            network,
            discovery
          );

          //Save to disk. Saving is async, but it's ok not awaiting since all this
          //data can be re-created any time by calling again syncBlockchain
          const exportedData = discovery.export();
          setDiscoveryDataExport(exportedData);

          setUtxosData(walletId, walletUtxosData);
          //Update them in state only if they changed (we muteted them)
          if (vaults !== updatedVaults) setVaults(updatedVaults);
          if (vaultsStatuses !== updatedVaultsStatuses)
            setVaultsStatuses(updatedVaultsStatuses);
        } catch (error) {
          const errorMessage =
            error instanceof Error
              ? error.message
              : t('An unknown error occurred'); //TODO: translate

          toast.show(t('networkError', { message: errorMessage }), {
            type: 'warning'
          });
          console.error(errorMessage);
        } finally {
          setSyncingBlockchain(walletId, false);
        }
      }
    }
  }, [
    setUtxosData,
    setSyncingBlockchain,
    walletId,
    accountNames,
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
    settings?.GAP_LIMIT
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
  //on new wallet
  useEffect(() => {
    if (walletId !== undefined) setSyncingBlockchain(walletId, true);
  }, [walletId, setSyncingBlockchain]);

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
        await Promise.all([
          setVaults({ ...vaults, [vault.vaultId]: vault }),
          setVaultsStatuses({
            ...vaultsStatuses,
            [vault.vaultId]: { vaultPushTime: Math.floor(Date.now() / 1000) }
          })
        ]);

        //TODO: enable this after tests. important to push after AWAIT setVaults
        //if successful
        //TODO: try-catch push result. This and all pushes in code.
        //const discovery = await getConnectedDiscovery();
        //await discovery.getExplorer().push(vault.vaultTxHex);

        return true;
      }
    },
    [setVaults, setVaultsStatuses, t, toast, vaults, vaultsStatuses]
  );

  const contextValue = {
    getUnvaultKey,
    getChangeDescriptor,
    fetchServiceAddress,
    btcFiat,
    feeEstimates,
    signers,
    vaults,
    networkId,
    utxosData: walletId !== undefined ? utxosData[walletId] : undefined,
    processCreatedVault,
    syncBlockchain,
    syncingBlockchain: !!(
      walletId !== undefined && syncingBlockchain[walletId]
    ),
    vaultsAPI,
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
      accountNamesErrorCode: accountNamesStorageStatus.errorCode
    }),
    requiresPassword:
      (walletId !== undefined &&
        wallet?.signersEncryption === 'PASSWORD' &&
        !signersCipherKey[walletId]) ||
      (typeof signersStorageStatus.errorCode !== 'boolean' &&
        signersStorageStatus.errorCode === 'DecryptError'),
    logOut,
    onWallet
  };
  return (
    <WalletContext.Provider value={contextValue}>
      {children}
    </WalletContext.Provider>
  );
};
export const WalletProvider = React.memo(WalletProviderRaw);
