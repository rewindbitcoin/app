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
import { networkMapping } from '../lib/network';
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
import { useToast } from '../../common/components/Toast';
import { SERIALIZABLE } from '../../common/lib/storage';
import { useGlobalStateStorage } from '../../common/contexts/StorageContext';
import { useSecureStorageAvailability } from '../../common/contexts/SecureStorageAvailabilityContext';
import { useLocalStateStorage } from '../../common/hooks/useLocalStateStorage';
import { SETTINGS_GLOBAL_STORAGE } from '../lib/settings';
import { defaultSettings, type Settings } from '../lib/settings';
import { useTranslation } from 'react-i18next';

import { fetchBtcFiat } from '../lib/btcRates';

import { EsploraExplorer } from '@bitcoinerlab/explorer';
import { signers as descriptorsSigners } from '@bitcoinerlab/descriptors';
import { DiscoveryFactory, DiscoveryInstance } from '@bitcoinerlab/discovery';
import { networks, Network, Psbt } from 'bitcoinjs-lib';
import * as secp256k1 from '@bitcoinerlab/secp256k1';
import { DescriptorsFactory } from '@bitcoinerlab/descriptors';
const { BIP32 } = DescriptorsFactory(secp256k1);
import { mnemonicToSeedSync } from 'bip39';
import type { FeeEstimates } from '../lib/fees';
import { randomBytes } from '@noble/ciphers/webcrypto/utils';
const cipherKey = randomBytes(32);
import { Platform } from 'react-native';

type DiscoveryDataExport = ReturnType<DiscoveryInstance['export']>;

export const WalletContext: Context<WalletContextType | null> =
  createContext<WalletContextType | null>(null);

export type WalletContextType = {
  //TODO: Must also provide the serviceAddress
  //TODO: Must also provide the coldAddress
  //TODO: Must also provide the heirsAddress
  //TODO: Must also provide changeDescriptor: getNextChangeDescriptor
  //TODO: Must also provide unvaultKey: getUnvaultKey
  serviceAddress: string | undefined;
  coldAddress: string | undefined;
  changeDescriptor: string | undefined;
  unvaultKey: string | undefined;
  btcFiat: number | null;
  feeEstimates: FeeEstimates | null;
  utxosData: UtxosData | undefined;
  signPsbt: (psbtVault: Psbt) => Promise<void>;
  network: Network | undefined;
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

function esploraUrl(network: Network) {
  const url =
    network === networks.testnet
      ? 'https://blockstream.info/testnet/api/'
      : network === networks.bitcoin
        ? 'https://blockstream.info/api/'
        : null;
  if (!url) throw new Error(`Esplora API not available for this network`);
  return url;
}

const DEFAULT_VAULTS_STATUSES: VaultsStatuses = {};
const DEFAULT_ACCOUNT_NAMES: AccountNames = {};
const DEFAULT_VAULTS: Vaults = {};
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
  const canUseSecureStorage = useSecureStorageAvailability();
  if (useSecureStorageAvailability === undefined)
    //This should never happen. If we have a wallet already it's because the App
    //either read it already from somewhere or created it. And wallets can only be created
    //if the SecureStorageAvaiability exists because it is needed for setting
    //signersStorageEngine
    throw new Error(
      'WalletContext cannot be used until useSecureStorageAvailability has been resolved'
    );
  const { t } = useTranslation();
  //console.log('TODO: WALLET PROVIDER HERE I AM');
  const walletId = wallet.walletId;
  const network = networkMapping[wallet.networkId];
  if (wallet && !network)
    throw new Error(`Invalid networkId ${wallet.networkId}`);

  //TODO: This is wrong. Must use:
  //  - if wallet is set, then see if signersEncryption was set,
  //  then request the cipherKey to the user
  //  - also see if signersStorageEngine is 'SECURESTORE' or not.
  //  - also, for new wallets, the code must see if LocalAuthentication.hasHardwareAsync
  if (
    (wallet.signersStorageEngine === 'MMKV' && Platform.OS === 'web') ||
    (wallet.signersStorageEngine === 'IDB' && Platform.OS !== 'web') ||
    (wallet.signersStorageEngine === 'SECURESTORE' &&
      canUseSecureStorage === false)
  ) {
    console.error('TODO');
  }
  const [signers, setSigners] = useLocalStateStorage<Signers>(
    `SIGNERS_${walletId}`,
    SERIALIZABLE,
    undefined,
    wallet.signersStorageEngine,
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

  const [fooBar, , isFooBarSynchd] = useLocalStateStorage<{
    foo: string;
    bar: string;
  }>(
    `FOO_BAR`,
    SERIALIZABLE,
    { foo: 'Foooo', bar: 'Barrr' },
    Platform.OS === 'web' ? 'IDB' : 'MMKV',
    cipherKey,
    'Authenticate to access secure data' //TODO: translate
  );
  useEffect(() => {
    if (isFooBarSynchd) {
      console.log({ fooBar });
    }
  }, [fooBar, isFooBarSynchd]);

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
  }, [newWalletSigners]);

  const toast = useToast();

  // Local State: btcFiat, feeEstimates & discovery
  const [btcFiat, setBtcFiat] = useState<number | null>(null);
  const [feeEstimates, setFeeEstimates] = useState<Record<
    string,
    number
  > | null>(null);
  const [discovery, setDiscovery] = useState<DiscoveryInstance | null>(null);
  const [utxosData, setUtxosData] = useState<UtxosData>();
  const [changeDescriptor, setChangeDescriptor] = useState<string>();
  const [unvaultKey, setUnvaultKey] = useState<string>();

  // Sets discovery from storage if available or new:
  useEffect(() => {
    if (!discovery && network) {
      let isMounted = true;
      let isExplorerConnected = false;
      const url = esploraUrl(network);
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
  }, [network, discoveryDataExport, isDiscoveryDataExportSynchd]);

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
              const url = esploraUrl(networks.bitcoin);
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

      const interval = setInterval(
        () => {
          updateFeeEstimates();
        },
        settings?.BTC_FEE_ESTIMATES_REFRESH_INTERVAL_MS
      );

      return () => {
        isMounted = false;
        clearInterval(interval);
      };
    }
    return;
  }, [
    discovery,
    network,
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
  }, [settings?.CURRENCY, settings?.BTC_FIAT_REFRESH_INTERVAL_MS]);

  const [syncingBlockchain, setSyncingBlockchain] = useState(false);
  const syncBlockchainRunning = useRef(false);
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
    console.log('syncBlockchain', {
      vaults,
      vaultsStatuses,
      syncing: syncBlockchainRunning.current
    });
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
      shallowEqualArrays(Object.keys(vaults), Object.keys(accountNames)) &&
      signers
    ) {
      if (syncBlockchainRunning.current === true) return;
      syncBlockchainRunning.current = true;
      setSyncingBlockchain(true);
      try {
        const updatedVaultsStatuses = await updateVaultsStatuses();
        if (!updatedVaultsStatuses)
          throw new Error('updateVaultsStatuses should have thrown');
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
            updatedVaultsStatuses,
            await discovery.getExplorer().fetchBlockHeight()
          )
        ];
        console.log('WALLET PROVIDER', 'network expensive fetch function');
        await discovery.fetch({ descriptors, gapLimit: settings.GAP_LIMIT });
        setChangeDescriptor(
          changeDescriptorRanged.replaceAll(
            '*',
            discovery
              .getNextIndex({
                descriptor: changeDescriptorRanged
              })
              .toString()
          )
        );
        setUnvaultKey(await createUnvaultKey({ signer, network }));
        //Saves to disk. It's async, but it's ok not waiting since discovery
        //data can be recreated any time (with a slower call) by fetching
        //descriptors
        setDiscoveryDataExport(discovery.export());
        //If utxos don't change, then getUtxosAndBalance return the same reference
        //even if descriptors reference is different
        const { utxos } = discovery.getUtxosAndBalance({ descriptors });
        const utxosData = getUtxosData(utxos, vaults, network, discovery);
        setUtxosData(utxosData);
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
    } else
      console.log(
        'syncBlockchain not performing any action for being called with non-initialized inputs'
      );

    //Helper function used above. It returns new
    async function updateVaultsStatuses() {
      if (!discovery || !vaults || !vaultsStatuses)
        throw new Error(
          'updateVaultsStatuses called with non-initialized inputs'
        );
      let updatedVaultsStatuses = vaultsStatuses;
      try {
        const newVaultsStatuses = await fetchVaultsStatuses(
          vaults,
          discovery.getExplorer()
        );

        Object.entries(newVaultsStatuses).forEach(([key, status]) => {
          const existingStatus = vaultsStatuses[key];
          if (!shallowEqualObjects(existingStatus, status)) {
            // Mutate updatedVaultsStatuses because a change has been detected
            if (updatedVaultsStatuses === vaultsStatuses)
              updatedVaultsStatuses = { ...vaultsStatuses };

            updatedVaultsStatuses[key] = { ...existingStatus, ...status };
          }
        });
        if (vaultsStatuses !== updatedVaultsStatuses)
          setVaultsStatuses(updatedVaultsStatuses);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'An unknown error occurred';

        toast.show(t('networkError', { message: errorMessage }), {
          type: 'warning'
        });
      }
      return updatedVaultsStatuses;
    }
  }, [
    discovery,
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
        if (vaults[vault.vaultAddress])
          throw new Error(`Vault for ${vault.vaultAddress} already exists`);
        await setVaults({ ...vaults, [vault.vaultAddress]: vault });

        console.log('Setting setVaultsStatuses', {
          ...vaultsStatuses,
          [vault.vaultAddress]: { vaultPushTime: Math.floor(Date.now() / 1000) }
        });
        if (vaultsStatuses[vault.vaultAddress])
          throw new Error(
            `VaultStatus for ${vault.vaultAddress} already exists`
          );
        await setVaultsStatuses({
          ...vaultsStatuses,
          [vault.vaultAddress]: { vaultPushTime: Math.floor(Date.now() / 1000) }
        });

        //TODO: enable this after tests. important to push after AWAIT setVaults
        //if successful
        //TODO: try-catch push result. This and all pushes in code.
        //await discovery.getExplorer().push(vault.vaultTxHex);

        return true;
      }
    },
    [discovery, vaults, vaultsStatuses]
  );

  const signPsbt = useCallback(
    async (psbtVault: Psbt) => {
      const mnemonic = signers?.[0]?.mnemonic;
      if (!mnemonic) throw new Error('Could not initialize the signer');
      const masterNode = BIP32.fromSeed(mnemonicToSeedSync(mnemonic), network);
      descriptorsSigners.signBIP32({ psbt: psbtVault, masterNode });
    },
    [signers]
  );

  const contextValue = {
    // Expose any state or functions that children components might need
    coldAddress: 'tb1qm0k9mn48uqfs2w9gssvzmus4j8srrx5eje7wpf', //TODO: Fix this
    serviceAddress: 'tb1qm0k9mn48uqfs2w9gssvzmus4j8srrx5eje7wpf', //TODO: Fix this
    changeDescriptor,
    unvaultKey,
    btcFiat,
    feeEstimates,
    signPsbt,
    network,
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
