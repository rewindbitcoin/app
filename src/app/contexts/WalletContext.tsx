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
import type { AccountNames, Signers } from '../lib/wallets';
import { networkMapping, NetworkId } from '../lib/network';
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
import { SERIALIZABLE } from '../../common/lib/storage';
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
import { Platform } from 'react-native';
import { fetchP2PVaultIds, fetchP2PVault } from '../lib/backup';

type DiscoveryDataExport = ReturnType<DiscoveryInstance['export']>;

export const WalletContext: Context<WalletContextType | null> =
  createContext<WalletContextType | null>(null);

export type WalletContextType = {
  getChangeDescriptor: () => Promise<string>;
  getServiceAddress: () => Promise<string>;
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
  // ... any other properties you want to include
};

//TODO: These must be set as settings, and should be configurable by
//the user (specially regtest one)
function esploraUrl(networkId: NetworkId) {
  const url =
    networkId === 'TESTNET'
      ? 'https://blockstream.info/testnet/api/'
      : networkId === 'BITCOIN'
        ? 'https://blockstream.info/api/'
        : networkId === 'STORM'
          ? 'https://storm.thunderden.com/api/'
          : networkId === 'REGTEST'
            ? 'http://localhost:31002/'
            : null;
  if (!url) throw new Error(`Esplora API not available for this network`);
  return url;
}

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
const WalletProviderWithWallet = ({
  children,
  wallet,
  newWalletSigners
}: {
  children: ReactNode;
  wallet: Wallet;
  newWalletSigners?: Signers;
}) => {
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
  const walletId = wallet.walletId;
  const networkId = wallet.networkId;
  const signersStorageEngine = wallet.signersStorageEngine;
  const network = networkMapping[networkId];
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
  const [signers, setSigners] = useLocalStateStorage<Signers>(
    `SIGNERS_${walletId}`,
    SERIALIZABLE,
    undefined,
    signersStorageEngine,
    undefined,
    t('app.secureStorageAuthenticationPrompt')
  );

  const [settings] = useGlobalStateStorage<Settings>(
    SETTINGS_GLOBAL_STORAGE,
    SERIALIZABLE,
    defaultSettings
  );

  const [
    discoveryDataExport,
    setDiscoveryDataExport,
    isDiscoveryDataExportSynchd
  ] = useLocalStateStorage<DiscoveryDataExport>(
    `DISCOVERY_${walletId}`,
    SERIALIZABLE
  );

  const [vaults, setVaults] = useLocalStateStorage<Vaults>(
    `VAULTS_${walletId}`,
    SERIALIZABLE,
    DEFAULT_VAULTS
  );

  const [vaultsStatuses, setVaultsStatuses] =
    useLocalStateStorage<VaultsStatuses>(
      `VAULTS_STATUSES_${walletId}`,
      SERIALIZABLE,
      DEFAULT_VAULTS_STATUSES
    );

  const [accountNames] = useLocalStateStorage<AccountNames>(
    `ACCOUNT_NAMES_${walletId}`,
    SERIALIZABLE,
    DEFAULT_ACCOUNT_NAMES
  );

  useEffect(() => {
    if (newWalletSigners) setSigners(newWalletSigners);
  }, [newWalletSigners, setSigners]);

  const toast = useToast();

  // Local State: btcFiat, feeEstimates & discovery
  const [btcFiat, setBtcFiat] = useState<number | null>(null);
  const [feeEstimates, setFeeEstimates] = useState<Record<
    string,
    number
  > | null>(null);
  const [discovery, setDiscovery] = useState<DiscoveryInstance | null>(null);
  const [utxosData, setUtxosData] = useState<UtxosData>();

  // Sets discovery from storage if available or new:
  useEffect(() => {
    if (!discovery && networkId) {
      const network = networkMapping[networkId];
      let isMounted = true;
      let isExplorerConnected = false;
      const url = esploraUrl(networkId);
      const explorer = new EsploraExplorer({ url });
      const { Discovery } = DiscoveryFactory(explorer, network);

      (async function () {
        if (isDiscoveryDataExportSynchd) {
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
        }
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
  }, [networkId, discoveryDataExport, isDiscoveryDataExportSynchd, discovery]);

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
    if (
      settings?.USE_MAINNET_FEE_ESTIMATES_IN_TESTNET !== undefined &&
      settings?.BTC_FEE_ESTIMATES_REFRESH_INTERVAL_MS !== undefined
    ) {
      const updateFeeEstimates = async () => {
        if (discovery) {
          let feeEstimates: FeeEstimates;
          try {
            if (settings.USE_MAINNET_FEE_ESTIMATES_IN_TESTNET) {
              const url = esploraUrl(networkId);
              const explorer = new EsploraExplorer({ url });
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
    networkId,
    settings?.USE_MAINNET_FEE_ESTIMATES_IN_TESTNET,
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
    if (!signers) throw new Error('Signers not ready');
    const signer = signers[0];
    if (!signer) throw new Error('signer unavailable');
    return await createUnvaultKey({ signer, network });
  }, [network, signers]);

  const getServiceAddress = useCallback(async () => {
    if (!settings?.GET_SERVICE_ADDRESS_URL_TEMPLATE) {
      throw new Error(
        'System not ready: GET_SERVICE_ADDRESS_URL_TEMPLATE is not defined.'
      );
    }

    const networkPath = networkId.toLowerCase();
    const serviceUrl = settings.GET_SERVICE_ADDRESS_URL_TEMPLATE.replace(
      ':network?/',
      networkPath === 'bitcoin' ? '' : `${networkPath}/`
    );

    try {
      const response = await fetch(serviceUrl);
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
  }, [networkId, settings?.GET_SERVICE_ADDRESS_URL_TEMPLATE]);

  /**
   * Gets vaults from the P2P network. Does not fetch it if already in memory.
   */
  const fetchP2PVaults = useCallback(async () => {
    const signer = signers?.[0];
    if (
      signer &&
      settings?.CHECK_VAULT_URL_TEMPLATE &&
      settings?.GET_VAULT_URL_TEMPLATE
    ) {
      if (fetchP2PVaultsRunning.current === false) {
        fetchP2PVaultsRunning.current = true;

        const { existingVaults: p2pVaultIds } = await fetchP2PVaultIds({
          signer,
          networkId,
          vaults,
          vaultCheckUrlTemplate: settings?.CHECK_VAULT_URL_TEMPLATE
        });
        const p2pVaults: Vaults = {};
        for (const { vaultId, vaultPath } of p2pVaultIds) {
          let vault = vaults?.[vaultId];
          if (!vault) {
            ({ vault } = await fetchP2PVault({
              vaultId,
              vaultPath,
              signer,
              fetchVaultUrlTemplate: settings.GET_VAULT_URL_TEMPLATE,
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
  }, [
    networkId,
    signers,
    vaults,
    settings?.CHECK_VAULT_URL_TEMPLATE,
    settings?.GET_VAULT_URL_TEMPLATE
  ]);

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
        setDiscoveryDataExport(discovery.export());
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
    getServiceAddress,
    btcFiat,
    feeEstimates,
    signers,
    vaults,
    networkId: wallet.networkId,
    utxosData,
    processCreatedVault,
    syncBlockchain,
    syncingBlockchain
    // ... any other relevant state or functions
  };

  return (
    <WalletContext.Provider value={contextValue}>
      {children}
    </WalletContext.Provider>
  );
};

export const WalletProvider = ({
  children,
  wallet,
  newWalletSigners
}: {
  children: ReactNode;
  wallet?: Wallet;
  newWalletSigners?: Signers;
}) => {
  if (!wallet) return children;
  else
    return (
      <WalletProviderWithWallet
        wallet={wallet}
        {...(newWalletSigners ? { newWalletSigners: newWalletSigners } : {})}
      >
        {children}
      </WalletProviderWithWallet>
    );
};
