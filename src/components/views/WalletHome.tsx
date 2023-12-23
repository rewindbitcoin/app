import {
  fetchVaultsStatuses,
  getSpendableTriggerDescriptors,
  getUtxosData,
  type Vault,
  type Vaults,
  type VaultsStatuses,
  type UtxosData
} from '../../lib/vaults';
import { produce } from 'immer';
import type { Signers } from '../../lib/wallets';
import { networkMapping } from '../../lib/network';
import {
  createReceiveDescriptor,
  createChangeDescriptor
} from '../../lib/vaultDescriptors';
import React, { useEffect, useState, useCallback } from 'react';
import { Text } from 'react-native';
import type { Wallet } from '../../lib/wallets';
import { Toast } from '../../components/common/Toast';
import Home from '../../components/views/Home';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SERIALIZABLE } from '../../lib/storage';
import {
  SETTINGS_GLOBAL_STORAGE,
  useGlobalStateStorage
} from '../../contexts/StorageContext';
import { useLocalStateStorage } from '../../hooks/useLocalStateStorage';
import { defaultSettings, type Settings } from '../../lib/settings';
import { useTranslation } from 'react-i18next';

import { fetchBtcFiat } from '../../lib/btcRates';

import { EsploraExplorer } from '@bitcoinerlab/explorer';
import { signers as descriptorsSigners } from '@bitcoinerlab/descriptors';
import { DiscoveryFactory, DiscoveryInstance } from '@bitcoinerlab/discovery';
import { networks, Network, Psbt } from 'bitcoinjs-lib';
import * as secp256k1 from '@bitcoinerlab/secp256k1';
import { DescriptorsFactory } from '@bitcoinerlab/descriptors';
const { BIP32 } = DescriptorsFactory(secp256k1);
import { mnemonicToSeedSync } from 'bip39';

type DiscoveryDataExport = ReturnType<DiscoveryInstance['export']>;

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
export default ({
  wallet,
  newWalletSigners
}: {
  wallet: Wallet;
  newWalletSigners?: Signers;
}) => {
  const walletId = wallet.walletId;
  const network = networkMapping[wallet.networkId];
  if (!network) throw new Error(`Invalid networkId ${wallet.networkId}`);
  const [savedSettings, , isSettingsSynchd] = useGlobalStateStorage<Settings>(
    SETTINGS_GLOBAL_STORAGE,
    SERIALIZABLE
  );
  // settings will be undefined if !isSettingsSynchd
  const settings = isSettingsSynchd
    ? savedSettings || defaultSettings
    : undefined;

  const [
    discoveryDataExport,
    setDiscoveryDataExport,
    isDiscoveryDataExportSynchd
  ] = useLocalStateStorage<DiscoveryDataExport>(
    `DISCOVERY/${walletId}`,
    SERIALIZABLE
  );
  const [vaults, setVaults, isVaultsSynchd] = useLocalStateStorage<Vaults>(
    `VAULTS/${walletId}`,
    SERIALIZABLE
  );
  const [signers, setSigners] = useLocalStateStorage<Signers>(
    `SIGNERS/${walletId}`,
    SERIALIZABLE
  );
  const [vaultsStatuses, setVaultsStatuses, isVaultsStatusesSynchd] =
    useLocalStateStorage<VaultsStatuses>(
      `VAULTS_STATUSES/${walletId}`,
      SERIALIZABLE
    );

  useEffect(() => {
    if (newWalletSigners) setSigners(newWalletSigners);
  }, [newWalletSigners]);

  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

  // Local State: btcFiat, feeEstimates & discovery
  const [btcFiat, setBtcFiat] = useState<number | null>(null);
  const [feeEstimates, setFeeEstimates] = useState<Record<
    string,
    number
  > | null>(null);
  const [discovery, setDiscovery] = useState<DiscoveryInstance | null>(null);
  const [utxosData, setUtxosData] = useState<UtxosData>();

  // Sets discoveryData from storage if available or new:
  useEffect(() => {
    let isMounted = true;
    let isExplorerConnected = false;
    const url = esploraUrl(network);
    const explorer = new EsploraExplorer({ url });
    const { Discovery } = DiscoveryFactory(explorer, network);

    (async function () {
      if (isDiscoveryDataExportSynchd) {
        const discoveryData = discoveryDataExport;
        let discovery;
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
          let feeEstimates;
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
            Toast.show({
              topOffset: insets.top + 10,
              type: 'error',
              text1: t('app.feeEstimatesError.title'),
              text2: t('app.feeEstimatesError.message')
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
          Toast.show({
            topOffset: insets.top + 10,
            type: 'error',
            text1: t('app.btcRatesError.title'),
            text2: t('app.btcRatesError.message', {
              currency: settings.CURRENCY
            })
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

  const updateVaultsStatuses = useCallback(async () => {
    let updatedVaultsStatuses: VaultsStatuses | undefined;
    if (discovery) {
      if (vaults) {
        try {
          const newVaultsStatuses = await fetchVaultsStatuses(
            vaults,
            discovery.getExplorer()
          );

          updatedVaultsStatuses = produce(
            vaultsStatuses,
            (draftVaultsStatuses: VaultsStatuses) => {
              // Iterate over the new statuses and update/add them to the draft
              Object.entries(newVaultsStatuses).forEach(([key, status]) => {
                if (draftVaultsStatuses[key]) {
                  // Update existing status
                  draftVaultsStatuses[key] = {
                    ...draftVaultsStatuses[key],
                    ...status
                  };
                } else {
                  // Add new status
                  draftVaultsStatuses[key] = status;
                }
              });
            }
          );
          if (updatedVaultsStatuses) setVaultsStatuses(updatedVaultsStatuses);
        } catch (error) {
          const errorMessage =
            error instanceof Error
              ? error.message
              : 'An unknown error occurred';

          Toast.show({
            topOffset: insets.top + 10,
            type: 'error',
            text1: t('networkError.title'),
            text2: `${t('networkError.text', { message: errorMessage })}`
          });
        }
      }
    }
    return updatedVaultsStatuses;
  }, [discovery, vaults, vaultsStatuses]);

  const syncBlockchain = useCallback(async () => {
    if (settings?.GAP_LIMIT === undefined)
      throw new Error(
        'Cannot sync the blockhain until having the correct user settings, with selected GAP_LIMIT'
      );
    if (discovery && vaults && signers) {
      try {
        const updatedVaultsStatuses = await updateVaultsStatuses();
        if (!updatedVaultsStatuses)
          throw new Error(
            'Unexpected updateVaultsStatuses result. Should have trhown.'
          );
        const signer = signers[0];
        if (!signer)
          throw new Error(
            'Could not retrieve signer information for a certain vault'
          );
        const descriptors = [
          await createReceiveDescriptor({ signer, network }),
          await createChangeDescriptor({ signer, network }),
          ...getSpendableTriggerDescriptors(
            vaults,
            updatedVaultsStatuses,
            await discovery.getExplorer().fetchBlockHeight()
          )
        ];
        await discovery.fetch({ descriptors, gapLimit: settings.GAP_LIMIT });
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
          error instanceof Error ? error.message : 'An unknown error occurred';

        Toast.show({
          topOffset: insets.top + 10,
          type: 'error',
          text1: t('networkError.title'),
          text2: `${t('networkError.text', { message: errorMessage })}`
        });
      }
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
    if (settings?.GAP_LIMIT !== undefined) syncBlockchain();
  }, [syncBlockchain, settings?.GAP_LIMIT]);

  const processCreatedVault = useCallback(
    async (
      vault:
        | Vault
        | 'COINSELECT_ERROR'
        | 'NOT_ENOUGH_FUNDS'
        | 'USER_CANCEL'
        | 'UNKNOWN_ERROR'
    ) => {
      if (!isVaultsSynchd || !isVaultsStatusesSynchd)
        throw new Error('Cannot use vaults without Storage');

      if (typeof vault === 'string') {
        //TODO translate them
        const errorMessages = {
          COINSELECT_ERROR: t('createVault.error.COINSELECT_ERROR'),
          NOT_ENOUGH_FUNDS: t('createVault.error.NOT_ENOUGH_FUNDS'),
          USER_CANCEL: t('createVault.error.USER_CANCEL'),
          UNKNOWN_ERROR: t('createVault.error.UNKNOWN_ERROR')
        };
        const text1 = t('createVault.error.title'); //TODO: translate this one
        const text2 = errorMessages[vault];
        if (!text2) throw new Error('Unhandled vault creation error');
        Toast.show({ topOffset: insets.top + 10, type: 'error', text1, text2 });
      } else {
        const newVaults = { ...vaults, [vault.vaultAddress]: vault };

        await setVaults(newVaults);

        //TODO: enable this after tests. important to push after AWAIT setVaults
        //if successful
        //TODO: try-catch push result. This and all pushes in code.
        //await discovery.getExplorer().push(vault.vaultTxHex);
        setVaultsStatuses({
          ...vaultsStatuses,
          [vault.vaultAddress]: { vaultPushTime: Math.floor(Date.now() / 1000) }
        });
      }
    },
    [discovery, isVaultsSynchd, vaults, isVaultsStatusesSynchd, vaultsStatuses]
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

  //TODO: Must also provide the serviceAddress
  //TODO: Must also provide the coldAddress
  //TODO: Must also provide the heirsAddress
  //TODO: Must also provide getNextChangeDescriptor
  //TODO: Must also provide getUnvaultKey
  console.log('WALLET_INDEX');
  return discovery && feeEstimates && utxosData ? (
    <Home
      btcFiat={btcFiat}
      feeEstimates={feeEstimates}
      signPsbt={signPsbt}
      utxosData={utxosData}
      onVaultCreated={processCreatedVault}
      onRefreshRequested={syncBlockchain}
    />
  ) : (
    //TODO: have a component for this
    <Text>'Loading'</Text>
  );
};
