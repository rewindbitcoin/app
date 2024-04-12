//TODO: impportant FIX when the rates are not downloaded the SetupVaultsScreen
//crashes
//Same for unset utxosData. Simply disable that button / route or show
//some warning Asking users to go back for not having rates / utxos yet
import {
  fetchVaultsStatuses,
  getSpendableTriggerDescriptors,
  getUtxosData,
  type Vault,
  type Vaults,
  type VaultsStatuses,
  type UtxosData
} from '../lib/vaults';
import type { AccountNames, Signers, Wallets } from '../lib/wallets';
import { networkMapping, NetworkId } from '../lib/network';
import { networks } from 'bitcoinjs-lib';
import {
  createReceiveDescriptor,
  createChangeDescriptor,
  createUnvaultKey
} from '../lib/vaultDescriptors';
import React, {
  createContext,
  type Context,
  ReactNode,
  useEffect,
  useState,
  useRef,
  useCallback
} from 'react';
import { shallowEqualObjects, shallowEqualArrays } from 'shallow-equal';
import type { Wallet } from '../lib/wallets';
import { useToast } from '../../common/ui';
import { SERIALIZABLE, deleteAsync } from '../../common/lib/storage';
import { useGlobalStateStorage } from '../../common/contexts/StorageContext';
import { useSecureStorageAvailability } from '../../common/contexts/SecureStorageAvailabilityContext';
import { useLocalStateStorage } from '../../common/hooks/useLocalStateStorage';
import { SETTINGS_GLOBAL_STORAGE } from '../lib/settings';
import { defaultSettings, type Settings } from '../lib/settings';
import { useTranslation } from 'react-i18next';

import { fetchBtcFiat } from '../lib/btcRates';

import { EsploraExplorer } from '@bitcoinerlab/explorer';
import { DiscoveryFactory, DiscoveryInstance } from '@bitcoinerlab/discovery';
import type { Network } from 'bitcoinjs-lib';
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
import {
  fetchP2PVaultIds,
  fetchP2PVault,
  getDataCipherKey
} from '../lib/backup';

type DiscoveryDataExport = ReturnType<DiscoveryInstance['export']>;

export const WalletContext: Context<WalletContextType | null> =
  createContext<WalletContextType | null>(null);

export type WalletContextType = {
  getChangeDescriptor: () => Promise<string>;
  fetchServiceAddress: () => Promise<string>;
  getUnvaultKey: () => Promise<string>;
  btcFiat: number | null;
  feeEstimates: FeeEstimates | null;
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
  syncBlockchain: () => Promise<void>;
  syncingBlockchain: boolean;
  vaultsAPI: string | undefined;
  vaultsSecondaryAPI: string | undefined;
  wallets: Wallets | undefined;
  wallet: Wallet | undefined;
  /** Whether the wallet needs to ask for a password and set it to retrieve
   * the signers */
  requiresAuth: boolean;
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

const getDescriptors = async (
  vaults: Vaults,
  vaultsStatuses: VaultsStatuses,
  signers: Signers,
  network: Network,
  discovery: DiscoveryInstance
) => {
  const signer = signers[0];
  if (!signer) throw new Error('signer unavailable');
  const changeDescriptorRanged = await createChangeDescriptor({
    signer,
    network
  });
  const descriptors = [
    await createReceiveDescriptor({ signer, network }),
    changeDescriptorRanged,
    ...getSpendableTriggerDescriptors(
      vaults,
      vaultsStatuses,
      await discovery.getExplorer().fetchBlockHeight()
    )
  ];
  return descriptors;
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
  const [signersCipherKey, setSignersCipherKey] = useState<Uint8Array>();
  const [dataCipherKey, setDataCipherKey] = useState<Uint8Array>();
  const [newSigners, setNewSigners] = useState<Signers>();
  const canUseSecureStorage = useSecureStorageAvailability();
  if (canUseSecureStorage === undefined)
    //This should never happen. If we have a wallet already it's because the App
    //either read it already from somewhere or created it. And wallets can only be created
    //if the SecureStorageAvaiability exists because it is needed for setting
    //signersStorageEngine
    throw new Error(
      'WalletContext cannot be used until useSecureStorageAvailability has been resolved'
    );
  const { t } = useTranslation();
  const walletId = wallet?.walletId;
  const networkId = wallet?.networkId;
  const signersStorageEngine = wallet?.signersStorageEngine;
  const network = networkId && networkMapping[networkId];
  if (wallet && !network) throw new Error(`Invalid networkId ${networkId}`);

  if (
    (signersStorageEngine === 'MMKV' && Platform.OS === 'web') ||
    (signersStorageEngine === 'IDB' && Platform.OS !== 'web') ||
    (signersStorageEngine === 'SECURESTORE' && canUseSecureStorage === false)
  ) {
    throw new Error(
      `signersStorageEngine ${signersStorageEngine} does not match this system specs: ${Platform.OS}, canUseSecureStorage=${canUseSecureStorage}. Have you not enabled Biometric id in your system?`
    );
  }

  const [settings] = useGlobalStateStorage<Settings>(
    SETTINGS_GLOBAL_STORAGE,
    SERIALIZABLE,
    defaultSettings
  );
  const [wallets, setWallets, , , walletsStorageStatus] =
    useLocalStateStorage<Wallets>(`xWALLETS`, SERIALIZABLE, {});
  const isWalletsSynchd = walletsStorageStatus.isSynchd;

  const initSigners =
    walletId !== undefined &&
    (wallet?.signersEncryption !== 'PASSWORD' || signersCipherKey);
  const initData =
    walletId !== undefined &&
    (wallet?.encryption !== 'SEED_DERIVED' || dataCipherKey);

  const [signers, , , clearSignersCache, signersStorageStatus] =
    useLocalStateStorage<Signers>(
      initSigners ? `SIGNERS_${walletId}` : undefined,
      SERIALIZABLE,
      newSigners,
      signersStorageEngine,
      signersCipherKey,
      t('app.secureStorageAuthenticationPrompt')
    );
  if (signersStorageStatus.errorCode)
    throw new Error(
      `SIGNERS_${walletId} error: ${signersStorageStatus.errorCode}`
    );

  const [
    discoveryDataExport,
    setDiscoveryDataExport,
    ,
    clearDiscoveryCache,
    discoveryStorageStatus
  ] = useLocalStateStorage<DiscoveryDataExport>(
    initData ? `DISCOVERY_${walletId}` : undefined,
    SERIALIZABLE,
    undefined,
    undefined,
    dataCipherKey
  );
  if (discoveryStorageStatus.errorCode)
    throw new Error(
      `DISCOVERY_${walletId} error: ${discoveryStorageStatus.errorCode}`
    );
  const isDiscoveryDataExportSynchd = discoveryStorageStatus.isSynchd;

  const [vaults, setVaults, , clearVaultsCache, vaultsStorageStatus] =
    useLocalStateStorage<Vaults>(
      initData ? `VAULTS_${walletId}` : undefined,
      SERIALIZABLE,
      DEFAULT_VAULTS,
      undefined,
      dataCipherKey
    );
  if (vaultsStorageStatus.errorCode)
    throw new Error(
      `VAULTS_${walletId} error: ${vaultsStorageStatus.errorCode}`
    );

  const [
    vaultsStatuses,
    setVaultsStatuses,
    ,
    clearVaultsStatusesCache,
    vaultsStatusesStorageStatus
  ] = useLocalStateStorage<VaultsStatuses>(
    initData ? `VAULTS_STATUSES_${walletId}` : undefined,
    SERIALIZABLE,
    DEFAULT_VAULTS_STATUSES,
    undefined,
    dataCipherKey
  );
  if (vaultsStatusesStorageStatus.errorCode)
    throw new Error(
      `VAULTS_STATUSES_${walletId} error: ${vaultsStatusesStorageStatus.errorCode}`
    );

  const [accountNames, , , clearAccountNamesCache, accountNamesStorageStatus] =
    useLocalStateStorage<AccountNames>(
      initData ? `ACCOUNT_NAMES_${walletId}` : undefined,
      SERIALIZABLE,
      DEFAULT_ACCOUNT_NAMES,
      undefined,
      dataCipherKey
    );
  if (accountNamesStorageStatus.errorCode)
    throw new Error(
      `ACCOUNT_NAMES_${walletId} error: ${accountNamesStorageStatus.errorCode}`
    );

  const logOut = useCallback(() => {
    // Clear cache, so that data must be read from disk again for the walletId.
    // This forces cipherKeys to be evaluated again to decrypt from disk
    // In other words, passwords must be set again
    clearSignersCache();
    clearVaultsCache();
    clearVaultsStatusesCache();
    clearDiscoveryCache();
    clearAccountNamesCache();
    unstable_batchedUpdates(() => {
      setDiscovery(null);
      setUtxosData(undefined);
    });
  }, [
    clearSignersCache,
    clearVaultsCache,
    clearVaultsStatusesCache,
    clearDiscoveryCache,
    clearAccountNamesCache
  ]);

  const onWallet = useCallback(
    async ({
      wallet: walletDst,
      newSigners,
      signersCipherKey
    }: {
      wallet: Wallet;
      /**
       * set it when creating new wallets
       */
      newSigners?: Signers;
      signersCipherKey?: Uint8Array;
    }) => {
      if (newSigners) {
        //Make sure we don't have values from previous app installs?
        const walletId = walletDst.walletId;
        const authenticationPrompt = t('app.secureStorageAuthenticationPrompt');
        await deleteAsync(
          `SIGNERS_${walletId}`,
          walletDst.signersStorageEngine,
          authenticationPrompt
        );
        await deleteAsync(`DISCOVERY_${walletId}`);
        await deleteAsync(`VAULTS_${walletId}`);
        await deleteAsync(`VAULTS_STATUSES_${walletId}`);
        await deleteAsync(`ACCOUNT_NAMES_${walletId}`);
      }
      //React 18 NOT on the new Architecture behaves as React 17:
      unstable_batchedUpdates(() => {
        logOut(); //Log out from previous wallet (if needed)
        setWallet(walletDst);
        setSignersCipherKey(signersCipherKey);
        setNewSigners(newSigners);
        // reset it - will be set as an effect below if needed
        setDataCipherKey(undefined);
      });
    },
    [logOut, t]
  );

  useEffect(() => {
    if (signers && network && wallet.encryption === 'SEED_DERIVED') {
      const signer = signers[0];
      if (!signer) throw new Error('signer unavailable');
      const fetchDataCipherKey = async () => {
        const dataCipherKey = await getDataCipherKey({
          signer,
          network
        });
        setDataCipherKey(dataCipherKey);
      };
      fetchDataCipherKey();
    }
  }, [signers, network, wallet?.encryption]);

  let esploraAPI: string | undefined;
  let serviceAddressAPI: string | undefined;
  let vaultsAPI: string | undefined;
  let vaultsSecondaryAPI: string | undefined;

  if (networkId)
    switch (networkId) {
      case 'BITCOIN':
        esploraAPI = settings?.MAINNET_ESPLORA_API;
        serviceAddressAPI = settings?.MAINNET_SERVICE_ADDRESS_API;
        vaultsAPI = settings?.MAINNET_VAULTS_API;
        vaultsSecondaryAPI = settings?.MAINNET_VAULTS_SECONDARY_API;
        break;
      case 'TESTNET':
        esploraAPI = settings?.TESTNET_ESPLORA_API;
        serviceAddressAPI = settings?.TESTNET_SERVICE_ADDRESS_API;
        vaultsAPI = settings?.TESTNET_VAULTS_API;
        vaultsSecondaryAPI = settings?.TESTNET_VAULTS_SECONDARY_API;
        break;
      case 'STORM':
        esploraAPI = settings?.STORM_ESPLORA_API;
        serviceAddressAPI = settings?.STORM_SERVICE_ADDRESS_API;
        vaultsAPI = settings?.STORM_VAULTS_API;
        vaultsSecondaryAPI = settings?.STORM_VAULTS_SECONDARY_API;
        break;
      case 'REGTEST':
        esploraAPI = settings?.REGTEST_ESPLORA_API;
        serviceAddressAPI = settings?.REGTEST_SERVICE_ADDRESS_API;
        vaultsAPI = settings?.REGTEST_VAULTS_API;
        vaultsSecondaryAPI = settings?.REGTEST_VAULTS_SECONDARY_API;
        break;
      default:
        throw new Error(`networkId ${networkId} not supported.`);
    }

  useEffect(() => {
    if (isWalletsSynchd && wallet && walletId !== undefined) {
      if (!wallets) throw new Error('wallets should be defined after synched');
      if (!shallowEqualObjects(wallet, wallets[walletId]))
        setWallets({ ...wallets, [walletId]: wallet });
    }
  }, [setWallets, walletId, wallets, wallet, isWalletsSynchd]);

  const toast = useToast();

  // Local State: btcFiat, feeEstimates & discovery
  const [btcFiat, setBtcFiat] = useState<number | null>(null);
  const [feeEstimates, setFeeEstimates] = useState<Record<
    string,
    number
  > | null>(null);
  const [discovery, setDiscovery] = useState<DiscoveryInstance | null>(null); //TODO: useRef?
  const [utxosData, setUtxosData] = useState<UtxosData>();

  useEffect(() => {
    //Done only once (!discovery) per walletId
    if (!discovery && networkId && esploraAPI && isDiscoveryDataExportSynchd) {
      const network = networkMapping[networkId];
      let isMounted = true;
      let isExplorerConnected = false;
      const explorer = new EsploraExplorer({ url: esploraAPI });
      const { Discovery } = DiscoveryFactory(explorer, network);

      (async function () {
        const discoveryData = discoveryDataExport;
        let discovery: DiscoveryInstance;
        if (discoveryData) {
          discovery = new Discovery({ imported: discoveryData });
        } else {
          discovery = new Discovery();
        }
        await explorer.connect();
        isExplorerConnected = true;
        if (isMounted) setDiscovery(discovery);
      })();

      return () => {
        isMounted = false;
        if (isExplorerConnected) {
          (async function () {
            await explorer.close();
            isExplorerConnected = false;
          })();
        }
      };
    }
    return;
  }, [
    networkId,
    esploraAPI,
    discoveryDataExport,
    isDiscoveryDataExportSynchd,
    discovery
  ]);

  //Tries to initialize utxosData ASAP (only if not set)
  useEffect(() => {
    const setInitialUtxosData = async () => {
      if (
        !utxosData &&
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
          const utxosData = getUtxosData(utxos, vaults, network, discovery);
          setUtxosData(utxosData);
        }
      }
    };
    setInitialUtxosData();
  }, [discovery, network, signers, utxosData, vaults, vaultsStatuses]);

  // Sets feeEstimates
  useEffect(() => {
    let isMounted = true;
    if (settings?.BTC_FEE_ESTIMATES_REFRESH_INTERVAL_MS !== undefined) {
      const updateFeeEstimates = async () => {
        if (discovery) {
          let feeEstimates: FeeEstimates;
          try {
            if (network === networks.regtest) {
              const explorer = new EsploraExplorer({
                url: settings.MAINNET_ESPLORA_API
              });
              await explorer.connect();
              feeEstimates = await explorer.fetchFeeEstimates();
              await explorer.close();
            } else {
              feeEstimates = await discovery.getExplorer().fetchFeeEstimates();
            }
            if (isMounted) setFeeEstimates(feeEstimates);
          } catch (err) {
            toast.show(t('app.feeEstimatesError'), {
              type: 'warning'
            });
          }
        }
      };
      updateFeeEstimates();

      const interval = setInterval(() => {
        updateFeeEstimates();
      }, settings?.BTC_FEE_ESTIMATES_REFRESH_INTERVAL_MS);

      return () => {
        isMounted = false;
        clearInterval(interval);
      };
    }
    return;
  }, [
    t,
    toast,
    discovery,
    network,
    settings?.MAINNET_ESPLORA_API,
    settings?.BTC_FEE_ESTIMATES_REFRESH_INTERVAL_MS
  ]);

  //Sets btcFiat
  useEffect(() => {
    let isMounted = true;

    if (
      (settings?.CURRENCY !== undefined,
      settings?.BTC_FIAT_REFRESH_INTERVAL_MS !== undefined)
    ) {
      const updateBtcFiat = async () => {
        try {
          const btcFiat = await fetchBtcFiat(settings.CURRENCY);
          if (isMounted) setBtcFiat(btcFiat);
        } catch (err) {
          toast.show(t('app.btcRatesError', { currency: settings.CURRENCY }), {
            type: 'warning'
          });
        }
      };

      updateBtcFiat();

      const interval = setInterval(() => {
        updateBtcFiat();
      }, settings.BTC_FIAT_REFRESH_INTERVAL_MS);

      return () => {
        isMounted = false;
        clearInterval(interval);
      };
    }
    return;
  }, [t, toast, settings?.CURRENCY, settings?.BTC_FIAT_REFRESH_INTERVAL_MS]);

  const [syncingBlockchain, setSyncingBlockchain] = useState(false);
  const syncBlockchainRunning = useRef(false);
  const fetchP2PVaultsRunning = useRef(false);

  const getChangeDescriptor = useCallback(async () => {
    if (!network) throw new Error('Network not ready');
    if (!signers) throw new Error('Signers not ready');
    if (!discovery) throw new Error('Discovery not ready');
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
  }, [discovery, network, signers]);
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
   * Gets vaults from the P2P network. Does not fetch it if already in memory.
   */
  const fetchP2PVaults = useCallback(async () => {
    if (!networkId) throw new Error('NetworkId not ready');
    const signer = signers?.[0];
    if (signer && vaultsAPI && vaultsSecondaryAPI) {
      if (fetchP2PVaultsRunning.current === false) {
        fetchP2PVaultsRunning.current = true;

        const { existingVaults: p2pVaultIds } = await fetchP2PVaultIds({
          signer,
          networkId,
          vaults,
          vaultsAPI
        });
        const p2pVaults: Vaults = {};
        for (const { vaultId, vaultPath } of p2pVaultIds) {
          let vault = vaults?.[vaultId];
          if (!vault) {
            ({ vault } = await fetchP2PVault({
              vaultId,
              vaultPath,
              signer,
              vaultsAPI,
              networkId
            }));
          }
          p2pVaults[vault.vaultId] = vault;
        }
        fetchP2PVaultsRunning.current = false;
        return p2pVaults;
      }
    }
    return;
  }, [networkId, signers, vaults, vaultsAPI, vaultsSecondaryAPI]);

  /**
   * Initiates the blockchain synchronization process. This function uses
   * both a reference (`syncBlockchainRunning`) and state (`syncingBlockchain`).
   * The state is updated for user feedback purposes, but due to the asynchronous
   * nature of state updates, relying solely on `syncingBlockchain` for flow control
   * could lead to multiple simultaneous initiations of the synchronization process.
   * To prevent this, `syncBlockchainRunning` is used as a synchronous flag to
   * ensure that only one synchronization process runs at a time. The function
   * returns a promise to indicate completion, allowing callers to await the
   * end of the synchronization process.
   *
   * @returns A promise indicating the completion of the synchronization process.
   */
  const syncBlockchain = useCallback(async () => {
    if (
      network &&
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
      signers
    ) {
      if (syncBlockchainRunning.current === true) return;
      syncBlockchainRunning.current = true;
      setSyncingBlockchain(true);

      try {
        //First get updatedVaults & updatedVaultsStatuses:
        const p2pVaults = await fetchP2PVaults();
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
        await discovery.fetch({ descriptors, gapLimit: settings.GAP_LIMIT });
        //If utxos don't change, then getUtxosAndBalance return the same reference
        //even if descriptors reference is different
        const { utxos } = discovery.getUtxosAndBalance({ descriptors });
        const utxosData = getUtxosData(
          utxos,
          updatedVaults,
          network,
          discovery
        );

        //Save to disk. Saving is async, but it's ok not awaiting since all this
        //data can be re-created any time by calling again syncBlockchain

        const start = performance.now(); // Start timing
        const exportedData = discovery.export();
        const end = performance.now(); // Start timing
        console.log(`Discovery export took:  ${(end - start) / 1000} seconds`);
        setDiscoveryDataExport(exportedData);
        setUtxosData(utxosData);
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
        syncBlockchainRunning.current = false;
        setSyncingBlockchain(false);
      }
    }
  }, [
    fetchP2PVaults,
    accountNames,
    setDiscoveryDataExport,
    t,
    toast,
    discovery,
    setVaults,
    setVaultsStatuses,
    vaults,
    vaultsStatuses,
    network,
    signers,
    settings?.GAP_LIMIT
  ]);

  useEffect(() => {
    syncBlockchain();
  }, [syncBlockchain]);

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
    utxosData,
    processCreatedVault,
    syncBlockchain,
    syncingBlockchain,
    vaultsAPI,
    vaultsSecondaryAPI,
    wallets,
    wallet,
    requiresAuth:
      (wallet?.signersEncryption === 'PASSWORD' && !signersCipherKey) ||
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
