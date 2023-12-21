import type { Vault, Vaults } from '../../lib/vaults';
import type { Signers } from '../../lib/wallets';
import React, { useEffect, useState, useCallback } from 'react';
import { Toast } from '../../components/common/Toast';
import Home from '../../components/views/Home';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SERIALIZABLE } from '../../lib/storage';
import {
  SETTINGS_GLOBAL_STORAGE,
  useGlobalStateStorage
} from '../../contexts/StorageContext';
import { useLocalStateStorage } from '../../hooks/useLocalStateStorage';
import type { Settings } from '../../lib/settings';
import { useTranslation } from 'react-i18next';

import { getBtcFiat } from '../../lib/btcRates';
import { NetworkId, getNetworkId } from '../../lib/network';

import { EsploraExplorer } from '@bitcoinerlab/explorer';
import { signers as descriptorsSigners } from '@bitcoinerlab/descriptors';
import { DiscoveryFactory, DiscoveryInstance } from '@bitcoinerlab/discovery';
import { networks, Network, Psbt } from 'bitcoinjs-lib';
const network = networks.testnet;
import * as secp256k1 from '@bitcoinerlab/secp256k1';
import { DescriptorsFactory } from '@bitcoinerlab/descriptors';
const { BIP32 } = DescriptorsFactory(secp256k1);
import { mnemonicToSeedSync } from 'bip39';

type DiscoveryDataExport = ReturnType<DiscoveryInstance['export']>;
type DiscoveryDataMap = Record<NetworkId, DiscoveryDataExport>;

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
  walletId,
  newWalletSigners
}: {
  walletId: number;
  newWalletSigners?: Signers;
}) => {
  //TODO: setDiscoveryDataMap after any fetch in discovery
  const [settings] = useGlobalStateStorage<Settings>(
    SETTINGS_GLOBAL_STORAGE,
    SERIALIZABLE
  );
  // Let's allow displaying some draft data quickly even if settings still not loaded:
  //TODO: don't do this: Better pass real settings and wherever it makes sense
  //use defaultSettings as default or wait to show otehrwise
  const [discoveryDataMap, , isDiscoveryDataMapSynchd] =
    useLocalStateStorage<DiscoveryDataMap>(
      `DISCOVERY/${walletId}`,
      SERIALIZABLE
    );
  const [vaults, setVaults, isVaultsSynchd] = useLocalStateStorage<Vaults>(
    `VAULTS/${walletId}`,
    SERIALIZABLE
  );
  const [signers, setSigners, isSignersSynchd] = useLocalStateStorage<Signers>(
    `SIGNERS/${walletId}`,
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

  //TODO: Test this encryption lib by Paul Millr and see how fast is it:
  //https://github.com/paulmillr/noble-ciphers?tab=readme-ov-file#speed
  //  -> Use this cypher:
  //    XChaCha20-Poly1305
  //
  //TODO: the discovery object should depend on the wallet, not on the network
  //  -> This way I can encript the discoveryData on disk
  //  -> The password must be kept on memory, never save on disk
  //TODO: the vault must also have masterFingerprint associated
  //A wallet will have (at least - as common interface): network, signer function, masterFingerprint
  //  wallets: {
  //  [walletId]: {
  //    walletId: string;
  //    walletName?: string; //TODO: set t¡he version in globalStorage
  //    version: string;
  //    networkId: NetworkId;
  //    encrypted: boolean;
  //    signers: Array<{signerName?: string; type:'BIP32' | 'LEDGER', mnemonic?: string; masterFingerprintHex: string; devicePathAuth?: string;}> //Will length 1 position for current version of ThunderDen
  //  }
  //  }
  //
  //  -> A BIP32 wallet will also have the mnenomic
  //  -> With the masterFingerprint it is possible to get the vaults associated
  //  with it from 'VAULTS' in storage
  //const createWallet = useCallback(() => {
  //  const signer = async (psbtVault: Psbt) =>
  //    signers.signBIP32({ psbt: psbtVault, masterNode });
  //}, [mnemomic]);
  // Sets discoveryData from storage if available or new:
  useEffect(() => {
    let isMounted = true;
    let isExplorerConnected = false;
    const url = esploraUrl(network);
    const explorer = new EsploraExplorer({ url });
    const { Discovery } = DiscoveryFactory(explorer, network);

    (async function () {
      if (isDiscoveryDataMapSynchd) {
        const discoveryData = discoveryDataMap?.[getNetworkId(network)];
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
  }, [network, discoveryDataMap, isDiscoveryDataMapSynchd]);

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
              topOffset: insets.top,
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

  //Sets btcRage
  useEffect(() => {
    let isMounted = true;

    if (
      (settings?.CURRENCY !== undefined,
      settings?.BTC_FIAT_REFRESH_INTERVAL_MS !== undefined)
    ) {
      const updateBtcFiat = async () => {
        try {
          const btcFiat = await getBtcFiat(settings.CURRENCY);
          if (isMounted) setBtcFiat(btcFiat);
        } catch (err) {
          Toast.show({
            topOffset: insets.top,
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

  //const syncBlockchain = useCallback(async () => {
  //  const { utxos } = discovery.getUtxosAndBalance({ descriptors });
  //}, [discovery]);

  const processVault = useCallback(
    async (
      vault:
        | Vault
        | 'COINSELECT_ERROR'
        | 'NOT_ENOUGH_FUNDS'
        | 'USER_CANCEL'
        | 'UNKNOWN_ERROR'
    ) => {
      if (!isVaultsSynchd) throw new Error('Cannot use vaults without Storage');
      if (vault === 'COINSELECT_ERROR') {
        //TODO: translate COINSELECT_ERROR
        //  -> COINSELECT_ERROR may also mean not NOT_ENOUGH_FUNDS among other
        //  things
        Toast.show({
          topOffset: insets.top,
          type: 'error',
          text1: t('createVault.error.COINSELECT_ERROR')
        });
      } else if (vault === 'NOT_ENOUGH_FUNDS') {
        //TODO: translate NOT_ENOUGH_FUNDS
        Toast.show({
          topOffset: insets.top,
          type: 'error',
          text1: t('createVault.error.NOT_ENOUGH_FUNDS')
        });
      } else if (vault === 'USER_CANCEL') {
        //TODO: translate USER_CANCEL
        Toast.show({
          topOffset: insets.top,
          type: 'error',
          text1: t('createVault.error.USER_CANCEL')
        });
      } else if (vault === 'UNKNOWN_ERROR') {
        //TODO: translate UNKNOWN_ERROR
        Toast.show({
          topOffset: insets.top,
          type: 'error',
          text1: t('createVault.error.UNKNOWN_ERROR')
        });
      } else {
        //TODO for the moment do not store more stuff
        //TODO: check this push result. This and all pushes in code
        //TODO: commented this out during tests:
        vault.vaultPushTime = Math.floor(Date.now() / 1000);
        const newVaults = { ...vaults, [vault.vaultAddress]: vault };

        //TODO: enable this after tests
        //await discovery.getExplorer().push(vault.vaultTxHex);

        setVaults(newVaults);
      }
    },
    [discovery, isVaultsSynchd]
  );

  const signer = useCallback(
    async (psbtVault: Psbt) => {
      const mnemonic = signers?.[0]?.mnemonic;
      if (!mnemonic) throw new Error('Could not initialize the signer');
      const masterNode = BIP32.fromSeed(mnemonicToSeedSync(mnemonic), network);
      descriptorsSigners.signBIP32({ psbt: psbtVault, masterNode });
    },
    [signers, isSignersSynchd]
  );
  return (
    <Home
      btcFiat={btcFiat}
      feeEstimates={feeEstimates}
      discovery={discovery}
      signer={signer}
      onVaultCreated={processVault}
    />
  );
};
