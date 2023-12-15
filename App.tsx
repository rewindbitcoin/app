// TODO dec, 14, 2023
//  -> Investigage IndexedDB
//  -> serialize discovery (addint an interfaceVersion: 1.0
//  -> the constructor will optionally take the serialized discoveryData + version
//  -> Here I will store it to storage
//
//  -> I will store:
//    discoveryData
//    mnemonic
//    Vaults
//    settings
//
//  -> State:
//    do I need setUtxos / utxos? I only need discoveryData in storage
//      -> Look for react "best practices" wrt localStorage and state
//
//  -> Here I won't setState(discovery). Doesn't make sense. If discovery
//  is in storage, then use it, otherwise create an empty one.
//
//  -> Also I need a way to know how out-of-sync is discoveryData. If it's
//  pretty bad, should I let the system createVault of an utxo that perhaps
//  is not ours anymore? That should be ok I think... The component will
//  re-mount with new data when it gets it.
//
//TODO: install btcpayserver, use one api-key per user (associated to masterFingerprint or device id?) Or the hash of the masterFingerprint perhaps is better.
//TODO: everything i use AsyncStorage I should write to it, then read from it, make sure the read is ok and then proceed. If not, this means the vault cannot be pushed. Note Android fucks up big way
//  -> Also change the way it's stored. dont have a huge key for vaults
//and may write but then not allow to read:
//https://github.com/react-native-async-storage/async-storage/issues/617
//TODO: I believe the one below is ok, but double check
//  check discovery.getUtxos. What happens if when computing the utxos i have
//  competing txs in the mempool? getUtxos may be broken!!!
//    Worse than that, what happens if I have chains of txs with different
//    spending txs in different paths?
//    -> Sort the candidate sopending txs by feeRate I guess?
//    Or just randomly discard one. who cares, but don't produce an error!!!
//
//TODO: the utxos should be pre-filtered with those which are spendable (timelock has gone)
//TODO: all the calls to discovery fetch and so on should be try-catched.
//it there are network errors, then show and offer to retry.
//TODO: also on explorer fetch stuff (there are a few)
//
//TODO: Put the Vault Component in a different File:
//
//
//TODO: Show a popup when detected a new hot balance (remainingBlocks = 0)
//  -> Offer the possibilty of consalidating so that it cannot be panicked somewhere
//
//
//TODO: Until the initial refresh (so that all descriptors have been fetched
//nothing that interacts with the vauls should be available because it
//will crash (fetches have not been done)
//  -> Hace a helper funcion whenALLFetched (whenFetched) that is added to the disabled prop of all
//  buttons if undefuned not done -> Also if whenALLFetched is false then force refresh.
//TODO: OJO con los replace the "*". Tienen que ser replaceAll. Revisar aqui
//y en descriptors y en discovery
//TODO: el triggerDescriptor deberá de usar un wildcard que será el mismo
//para panic así como para unvault (internal)
//TODO: I might need to use the blockTime in additino to blockHeight?
//TODO: The Settings Window (mode default) is not scrollable
//In any case, this window should not be aplicable anymore
//TODO: createVault will throw if it's not possible to create a Vault. Maybe return empty?
//TODO: Consider not doing the last unvaultTx. It automatically goes to hot
//This leads to faster tx processing
//TODO: Do not use a hardocded panic address but offer the possibility to create
//one, then show the mnemonic and tell people we will be deleting it automatically
//TODO: Create a Withdrawal Button (when hot > 0)
//TODO: feeEstimates must update every block or at least every 10 minutes?
//  -> Same for btcFiat
//TODO: warn the users when minPanicBalance is > 20% of balance. Like: maybe this is not
//worth it...
//TODO: getNextIndex should be done wrt unconfirmed and then done again agains
//irreversible. Never rerturn a getNextIndex(unconfirmed) that is more then gapLimit away
//than getNextIndex(irreversible)
//  -> This applies for the next internal, and also for the next panic
//  -> Another consideration is that i might pre-reserve some next internals
//  and some next panic addresses for vaults already set-up. I will try not to
//  use them, as long as we're within GAP limits
//TODO: See the TODOs in Vault

import './init';
import initI18n from './src/i18n/i18n';
import { useTranslation } from 'react-i18next';
import {
  defaultSettings,
  Settings,
  Locale,
  Currency
} from './src/lib/settings';

import React, { useState, useEffect, useRef } from 'react';
import {
  ScrollView,
  Text,
  View,
  Button,
  ButtonProps,
  Alert,
  Modal,
  RefreshControl
} from 'react-native';
import { produce } from 'immer';
import {
  SETTINGS_GLOBAL_STORAGE,
  StorageProvider,
  useGlobalStateStorage
} from './src/contexts/StorageContext';
import { useLocalStateStorage, SERIALIZABLE, STRING } from './src/lib/storage';
const defaultVaults: Vaults = {};

const MBButton = ({ ...props }: ButtonProps) => (
  <View style={{ marginBottom: 10 }}>
    <Button {...props} />
  </View>
);
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import VaultSetUp from './src/components/views/VaultSetUp';
import VaultCreate from './src/components/views/VaultCreate';
import Unvault from './src/components/views/Unvault';
//TODO: There is a limitation of 6MB - independently of the Fix of 2MB I did on android:
//Alternative!!! https://github.com/mrousavy/react-native-mmkv/
//https://github.com/react-native-async-storage/async-storage/issues/750
//https://react-native-async-storage.github.io/async-storage/docs/limits
//https://github.com/react-native-async-storage/async-storage/discussions/781
//https://jscrambler.com/blog/how-to-use-react-native-asyncstorage
//https://react-native-async-storage.github.io/async-storage/
import QRCode from 'react-native-qrcode-svg';
import * as Clipboard from 'expo-clipboard';
import { Share } from 'react-native';
import memoize from 'lodash.memoize';
import { getBtcFiat, formatBtc } from './src/lib/btcRates';
import { formatFeeRate } from './src/lib/fees';

import { networks } from 'bitcoinjs-lib';
const network = networks.testnet;

import { generateMnemonic, mnemonicToSeedSync } from 'bip39';
import * as secp256k1 from '@bitcoinerlab/secp256k1';
import {
  keyExpressionBIP32,
  DescriptorsFactory
} from '@bitcoinerlab/descriptors';

import { EsploraExplorer } from '@bitcoinerlab/explorer';
import { DiscoveryFactory, DiscoveryInstance } from '@bitcoinerlab/discovery';
// init to something. The useSettings for correct values
initI18n(defaultSettings.LOCALE);

const { Output, BIP32 } = DescriptorsFactory(secp256k1);
const GAP_LIMIT = 3;
const MIN_FEE_RATE = 1;
//
//TODO: create a component that imports this one from the user (or creates it fot the user)
const DEFAULT_COLD_ADDR = 'tb1qm0k9mn48uqfs2w9gssvzmus4j8srrx5eje7wpf';
//TODO: get from btcpayserver
const DEFAULT_SERVICE_ADDR = 'tb1qm0k9mn48uqfs2w9gssvzmus4j8srrx5eje7wpf';
import {
  Vault,
  esploraUrl,
  fetchSpendingTx,
  Vaults,
  getUtxosData,
  utxosDataBalance,
  estimateTriggerTxSize
} from './src/lib/vaults';
import { estimateVaultSetUpRange } from './src/lib/vaultRange';
import {
  createReceiveDescriptor,
  createChangeDescriptor
} from './src/lib/vaultDescriptors';
import styles from './styles/styles';
import type { TFunction } from 'i18next';

const fromMnemonic = memoize(mnemonic => {
  if (!mnemonic) throw new Error('mnemonic not passed');
  const masterNode = BIP32.fromSeed(mnemonicToSeedSync(mnemonic), network);
  const unvaultKey = keyExpressionBIP32({
    masterNode,
    originPath: "/0'",
    keyPath: '/0'
  });
  return {
    masterNode,
    receiveDescriptor: createReceiveDescriptor({ masterNode, network }),
    changeDescriptor: createChangeDescriptor({ masterNode, network }),
    unvaultKey
  };
});

const maxTriggerFeeRate = (vault: Vault) => {
  return Math.max(
    ...Object.keys(vault.triggerMap).map(triggerTx => {
      const txRecord = vault.txMap[triggerTx];
      if (!txRecord) throw new Error('Invalid txMap');
      return txRecord.feeRate;
    })
  );
};

const findClosestTriggerFeeRate = (
  feeRate: number,
  vault: Vault
): { txHex: string; feeRate: number } => {
  let closestRecord: { txHex: string; feeRate: number } | undefined;
  let smallestDifference: number | undefined;

  Object.keys(vault.triggerMap).forEach(triggerTx => {
    const txRecord = vault.txMap[triggerTx];
    if (!txRecord) throw new Error('Invalid txMap');

    const currentDifference = Math.abs(feeRate - txRecord.feeRate);
    if (
      smallestDifference === undefined ||
      currentDifference < smallestDifference
    ) {
      smallestDifference = currentDifference;
      closestRecord = { txHex: triggerTx, feeRate: txRecord.feeRate };
    }
  });
  if (!closestRecord) throw new Error('No trigger fee rates found');
  return closestRecord;
};

/**
 * retrieve all the output descriptors whose lockTime has past already. They
 * might have been spent or not; this is not important. Just return all of them
 * */
const spendableTriggerDescriptors = (vaults: Vaults): Array<string> => {
  const descriptors = Object.values(vaults)
    .filter(vault => vault.remainingBlocks === 0)
    .map(vault => vault.triggerDescriptor);

  // Check for duplicates
  const descriptorSet = new Set(descriptors);
  if (descriptorSet.size !== descriptors.length) {
    throw new Error(
      'triggerDescriptors should be unique; panicKey should be random'
    );
  }
  console.log('spendableTriggerDescriptors', descriptors);

  return descriptors;
};

const formatTriggerFeeRate = (
  {
    feeRate,
    btcFiat,
    locale,
    currency,
    feeEstimates,
    vault
  }: {
    feeRate: number;
    btcFiat: number | null;
    locale: Locale;
    currency: Currency;
    feeEstimates: Record<string, number> | null;
    vault: Vault;
  },
  t: TFunction
) => {
  const { feeRate: finalFeeRate } = findClosestTriggerFeeRate(feeRate, vault);
  const formattedFeeRate = formatFeeRate(
    {
      feeRate: finalFeeRate,
      txSize: estimateTriggerTxSize(vault.lockBlocks),
      locale,
      currency,
      btcFiat,
      feeEstimates
    },
    t
  );
  return `Final Fee Rate: ${finalFeeRate.toFixed(2)} sats/vbyte
${formattedFeeRate}`;
};

function App() {
  const [newVaultSettings, setNewVaultSettings] = useState<
    | {
        amount: number;
        feeRate: number;
        lockBlocks: number;
      }
    | false
  >(false);
  const [isSettingsVisible, setIsSettingsVisible] = useState(false);
  const [isVaultSetUp, setIsVaultSetUp] = useState(false);
  //Set to a vault value to display the Modal that is called when the user
  //is going to unvault a vault (indicated as unvault).
  //Set it to null to hide the modal.
  const [unvault, setUnvault] = useState<Vault | null>(null);
  const [receiveAddress, setReceiveAddress] = useState<string | null>(null);
  //'goat oak pull seek know resemble hurt pistol head first board better';
  const [mnemonic, setMnemonic] = useLocalStateStorage<string>(
    'mnemonic',
    STRING
  );

  const [discovery, setDiscovery] = useState<DiscoveryInstance | null>(null);
  const [utxos, setUtxos] = useState<Array<string> | null>(null);
  const [vaults, setVaults] = useLocalStateStorage<Vaults>(
    'vaults',
    SERIALIZABLE
  );

  const [checkingBalance, setCheckingBalance] = useState(false);
  const [feeEstimates, setFeeEstimates] = useState<Record<
    string,
    number
  > | null>(null);
  const [btcFiat, setBtcFiat] = useState<number | null>(null);
  const [settings] = useGlobalStateStorage<Settings>(
    SETTINGS_GLOBAL_STORAGE,
    SERIALIZABLE
  );
  useEffect(() => {
    initI18n((settings || defaultSettings).LOCALE);
  }, [(settings || defaultSettings).LOCALE]);

  const { t } = useTranslation();
  const intervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchBtcFiat = async () => {
    try {
      const btcFiat = await getBtcFiat((settings || defaultSettings).CURRENCY);
      setBtcFiat(btcFiat);
    } catch (err) {
      // TODO: Handle errors here
      console.error(err);
    }
  };

  const lastCurrencyRef = useRef((settings || defaultSettings).CURRENCY);
  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (lastCurrencyRef.current !== (settings || defaultSettings).CURRENCY)
      fetchBtcFiat();

    lastCurrencyRef.current = (settings || defaultSettings).CURRENCY;
    intervalRef.current = setInterval(
      fetchBtcFiat,
      (settings || defaultSettings).BTC_FIAT_REFRESH_INTERVAL_MS
    );

    // Clear interval on unmount or when (settings||defaultSettings).CURRENCY changes
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [
    (settings || defaultSettings).CURRENCY,
    (settings || defaultSettings).BTC_FIAT_REFRESH_INTERVAL_MS
  ]);

  const init = async () => {
    //const mnemonic =
    //  'goat oak pull seek know resemble hurt pistol head first board better';
    const url = esploraUrl(network);
    const explorer = new EsploraExplorer({ url });
    const { Discovery } = DiscoveryFactory(explorer, network);
    await explorer.connect();
    const discovery = new Discovery();

    setIsSettingsVisible(false);
    setIsVaultSetUp(false);
    setNewVaultSettings(false);
    setUnvault(null);
    setReceiveAddress(null);
    setDiscovery(discovery);
    setUtxos(null);
    setCheckingBalance(false);

    try {
      let feeEstimates;
      //When working with the testnet network we will use mainnet feeEstimates
      //for better UX checks
      if (network === networks.testnet) {
        const explorer = new EsploraExplorer({
          url: 'https://blockstream.info/api'
        });
        await explorer.connect();
        feeEstimates = await explorer.fetchFeeEstimates();
        await explorer.close();
      } else {
        feeEstimates = await explorer.fetchFeeEstimates();
      }
      setFeeEstimates(feeEstimates);
    } catch (err) {}

    // Fetch BTC to Fiat data on init
    fetchBtcFiat();

    // Init locales on init
    initI18n((settings || defaultSettings).LOCALE);
  };

  useEffect(() => {
    init();
  }, []);
  useEffect(() => {
    if (discovery && mnemonic) handleCheckBalance();
  }, [discovery, mnemonic]);
  const sortedVaultKeys = Object.keys(vaults || defaultVaults)
    .sort()
    .toString();
  useEffect(() => {
    if (discovery && !checkingBalance && mnemonic) handleCheckBalance();
  }, [sortedVaultKeys]);
  useEffect(() => {
    if (discovery && !checkingBalance && mnemonic && !receiveAddress)
      handleCheckBalance();
  }, [receiveAddress]);

  const handleCreateWallet = async () => {
    const mnemonic = generateMnemonic();
    setMnemonic(mnemonic);
  };

  const handleCheckBalance = async () => {
    if (!checkingBalance) {
      setCheckingBalance(true);
      console.log('START UTXOS CHECK');
      if (!discovery) throw new Error(`discovery not instantiated yet!`);
      const blockHeight = await discovery.getExplorer().fetchBlockHeight();
      if (!blockHeight) throw new Error(`Could not bet tip block height`);

      //First update the vaults. Then the utxos
      let newVaults = vaults || defaultVaults; //Do not mutate vaults
      for (const vault of Object.values(vaults || defaultVaults)) {
        console.log('\tVAULT fetchSpendingTx');
        const triggerTxData = await fetchSpendingTx(
          vault.vaultTxHex,
          0,
          discovery
        );
        console.log('\tVAULT fetchSpendingTx - OK');
        const unlockingTxData = triggerTxData
          ? await fetchSpendingTx(triggerTxData.txHex, 0, discovery)
          : undefined;

        const newVault = produce(vault, draftVault => {
          if (triggerTxData) {
            draftVault.triggerTxHex = triggerTxData.txHex;
            draftVault.triggerTxBlockHeight = triggerTxData.blockHeight;

            //TODO: This logic is still not right. If trigger is in the
            //mempool then we must wait (not do the -1)
            const isTriggerInMempool = triggerTxData.blockHeight === 0;
            if (isTriggerInMempool) {
              draftVault.remainingBlocks = draftVault.lockBlocks;
            } else {
              const blocksSinceTrigger =
                blockHeight - triggerTxData.blockHeight;
              draftVault.remainingBlocks = Math.max(
                0,
                //-1 because this means a tx can be pushed already since the new
                //block will be (blockHeight + 1)
                draftVault.lockBlocks - blocksSinceTrigger - 1
              );
            }

            // LOG  computed remainingBlocks {"blockHeight": 2537905, "lockBlocks": 1, "remainingBlocks": 0, "triggerHeight": 0}

            console.log('computed remainingBlocks', {
              lockBlocks: draftVault.lockBlocks,
              blockHeight,
              triggerHeight: triggerTxData.blockHeight,
              remainingBlocks: draftVault.remainingBlocks
            });
          } else {
            delete draftVault.triggerTxHex;
            delete draftVault.triggerTxBlockHeight;
            draftVault.remainingBlocks = draftVault.lockBlocks;
          }
          if (unlockingTxData) {
            if (!triggerTxData)
              throw new Error('unlocking impossible without trigger');
            draftVault.unlockingTxHex = unlockingTxData.txHex;
            draftVault.unlockingTxBlockHeight = unlockingTxData.blockHeight;

            const panicTxs = vault.triggerMap[triggerTxData.txHex];
            if (!panicTxs) throw new Error('Invalid triggerMap');
            if (panicTxs.includes(unlockingTxData.txHex)) {
              draftVault.panicTxHex = unlockingTxData.txHex;
              draftVault.panicTxBlockHeight = unlockingTxData.blockHeight;
            }
          } else {
            delete draftVault.unlockingTxHex;
            delete draftVault.unlockingTxBlockHeight;
            delete draftVault.panicTxHex;
            delete draftVault.panicTxBlockHeight;
          }
        });
        if (newVaults[newVault.vaultAddress] !== newVault) {
          newVaults = { ...newVaults, [newVault.vaultAddress]: newVault };
        }
      }
      if (newVaults !== vaults) {
        setVaults(newVaults);
      }

      //Now update the utxos:
      const descriptors = [
        fromMnemonic(mnemonic).receiveDescriptor,
        fromMnemonic(mnemonic).changeDescriptor,
        ...spendableTriggerDescriptors(newVaults)
      ];
      console.log('FETCH DESCRIPTORS');
      await discovery.fetch({ descriptors, gapLimit: GAP_LIMIT });
      console.log('FETCH DESCRIPTORS - OK');
      const { utxos } = discovery.getUtxosAndBalance({ descriptors });
      //console.log('vaults', vaults);
      //I can do this because getUtxosAndBalance uses immutability.
      //Setting same utxo won't produce a re-render in React.
      setUtxos(utxos.length ? utxos : null);

      setCheckingBalance(false);
      console.log('UTXOS SET');
    }
  };

  const handleReceiveBitcoin = async () => {
    const receiveDescriptor = fromMnemonic(mnemonic).receiveDescriptor;
    if (!discovery) throw new Error(`discovery not instantiated yet!`);
    const index = discovery.getNextIndex({ descriptor: receiveDescriptor });
    const output = new Output({
      descriptor: receiveDescriptor,
      index,
      network
    });
    setReceiveAddress(output.getAddress());
  };

  //TODO: Must review this one too
  const handlePanic = async (vault: Vault) => {
    if (!discovery) throw new Error(`discovery not instantiated yet!`);
    const newVaults = { ...vaults };
    delete newVaults[vault.vaultAddress];
    setVaults(newVaults);
    //TODO: check this push result. This and all pushes in code
    if (!vault.panicTxHex) throw new Error('Cannot panic');
    await discovery.getExplorer().push(vault.panicTxHex);
    Alert.alert(
      'Transaction Successful',
      `Funds have been sent to the safe address: ${vault.coldAddress}.`
    );
  };

  const handleTriggerUnvault = async ({
    feeRate,
    vault
  }: {
    feeRate: number;
    vault: Vault;
  }) => {
    if (!unvault) throw new Error('Vault not set');
    const { txHex } = findClosestTriggerFeeRate(feeRate, vault);
    setUnvault(null);

    const newVaults = {
      ...vaults,
      [vault.vaultAddress]: {
        ...vault,
        triggerPushTime: Math.floor(Date.now() / 1000)
      }
    };
    setVaults(newVaults);
    if (!discovery) throw new Error(`discovery not instantiated yet!`);
    //TODO: check this push result. This and all pushes in code
    await discovery.getExplorer().push(txHex);
  };

  const handleDelegate = async (vault: Vault) => {
    const message = `
In case something happens to me, I can't access my Bitcoin, or you suspect foul play like extortion:

1. Use a trusted Bitcoin explorer.
2. Push these transactions:

Trigger Unvault (may error if previously pushed):

${vault.triggerTxHex}

Panic:

${vault.panicTxHex}

Handle with care. Confidentiality is key.
`;
    Share.share({ message: message, title: 'Share via' });
  };

  const onNewVaultSetUpValues = async ({
    amount,
    feeRate,
    lockBlocks
  }: {
    amount: number;
    feeRate: number;
    lockBlocks: number;
  }) => {
    setIsVaultSetUp(false);
    setNewVaultSettings({ amount, feeRate, lockBlocks });
  };

  //TODO: this fails if I type stuff and save it and expo-reloads because then
  //init is not called
  const hotUtxosData =
    utxos === null || discovery === null
      ? null
      : getUtxosData(utxos, vaults || defaultVaults, network, discovery);

  // This useEffect below is optional. It's only done only for better UX.
  // The idea is to pre-caching data that will be needed in VaultSetUp.
  // Obtaining min and max ranges are an intensive. However, obtained values are
  // internally memoized.
  // So, we pre-compute them here in case VaultSetUp is called.
  // This allows
  // super-fast rendering of the VaultSetUp Modal
  useEffect(() => {
    if (hotUtxosData && feeEstimates) {
      estimateVaultSetUpRange({
        utxosData: hotUtxosData,
        feeEstimates,
        serviceFeeRate: (settings || defaultSettings).SERVICE_FEE_RATE,
        network,
        feeRateCeiling: (settings || defaultSettings)
          .PRESIGNED_FEE_RATE_CEILING,
        minRecoverableRatio: (settings || defaultSettings).MIN_RECOVERABLE_RATIO
      });
    }
  }, [
    hotUtxosData,
    JSON.stringify(feeEstimates),
    (settings || defaultSettings).SERVICE_FEE_RATE,
    (settings || defaultSettings).PRESIGNED_FEE_RATE_CEILING,
    (settings || defaultSettings).MIN_RECOVERABLE_RATIO
  ]);

  const hotBalance =
    hotUtxosData === null ? null : utxosDataBalance(hotUtxosData);

  const onNewVaultCreated = async (
    vault:
      | Vault
      | 'COINSELECT_ERROR'
      | 'NOT_ENOUGH_FUNDS'
      | 'USER_CANCEL'
      | 'UNKNOWN_ERROR'
  ) => {
    if (vault === 'COINSELECT_ERROR') {
      //TODO: translate this
      Alert.alert(t('createVault.error.COINSELECT_ERROR'));
    } else if (vault === 'NOT_ENOUGH_FUNDS') {
      //TODO: translate this
      Alert.alert(t('createVault.error.NOT_ENOUGH_FUNDS'));
    } else if (vault === 'USER_CANCEL') {
      //TODO: translate this
      Alert.alert(t('createVault.error.USER_CANCEL'));
    } else if (vault === 'UNKNOWN_ERROR') {
      //TODO: translate this
      Alert.alert(t('createVault.error.UNKNOWN_ERROR'));
    } else {
      //TODO: I should index it based on vault.vaultTxHex
      //TODO for the moment do not store more stuff
      //TODO: check this push result. This and all pushes in code
      //TODO: commented this out during tests:
      vault.vaultPushTime = Math.floor(Date.now() / 1000);
      const newVaults = { ...vaults, [vault.vaultAddress]: vault };
      //const compressedVaults = fromByteArray(
      //  pako.deflate(JSON.stringify(newVaults))
      //);
      //console.log(
      //  'ORIGINAL_LENGTH',
      //  JSON.stringify(newVaults).length,
      //  'NEW_LENGTH',
      //  compressedVaults.length
      //);

      //const restoredNewVaults = JSON.parse(
      //  pako.inflate(toByteArray(compressedVaults), { to: 'string' })
      //);
      //console.log(restoredNewVaults);

      //await discovery.getExplorer().push(vault.vaultTxHex);

      setVaults(newVaults);
    }
    setNewVaultSettings(false);
  };

  if (isVaultSetUp && hotUtxosData === null)
    throw new Error('Cannot set up a vault without utxos');
  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.container}>
        <View style={styles.settings}>
          <Button title="Settings" onPress={() => setIsSettingsVisible(true)} />
        </View>
        <ScrollView
          contentContainerStyle={styles.contentContainer}
          refreshControl={
            mnemonic ? (
              <RefreshControl
                refreshing={checkingBalance}
                onRefresh={handleCheckBalance}
              />
            ) : undefined
          }
        >
          {discovery && mnemonic && (
            <MBButton
              title={
                checkingBalance ? 'Refreshing Balance…' : 'Refresh Balance'
              }
              onPress={handleCheckBalance}
              disabled={checkingBalance}
            />
          )}
          {!mnemonic && (
            <MBButton title="Create Wallet" onPress={handleCreateWallet} />
          )}
          {discovery && mnemonic && (
            <MBButton title="Receive Bitcoin" onPress={handleReceiveBitcoin} />
          )}
          {utxos && (
            <MBButton
              title="Vault Balance"
              onPress={() => setIsVaultSetUp(true)}
            />
          )}
          {hotBalance !== null && (
            <Text style={styles.hotBalance}>
              Hot Balance:{' '}
              {formatBtc(
                {
                  amount: hotBalance,
                  subUnit: (settings || defaultSettings).SUB_UNIT,
                  btcFiat,
                  locale: (settings || defaultSettings).LOCALE,
                  currency: (settings || defaultSettings).CURRENCY
                },
                t
              )}{' '}
              {checkingBalance && ' ⏳'}
            </Text>
          )}
          {vaults && Object.keys(vaults).length > 0 && (
            <View style={styles.vaults}>
              <Text style={styles.title}>Vaults</Text>
              {Object.entries(vaults)
                //sort in with new vaults on top:
                .sort(([, vaultA], [, vaultB]) => {
                  if (!vaultA.vaultPushTime || !vaultB.vaultPushTime)
                    throw new Error('Vault not pushed');
                  return vaultB.vaultPushTime - vaultA.vaultPushTime;
                })
                .map(([vaultAddress, vault], index) => {
                  const vaultTxData = vault.txMap[vault.vaultTxHex];
                  if (!vaultTxData) throw new Error('Invalid txMap');
                  let displayBalance = vault.balance - vaultTxData.fee;

                  if (vault.unlockingTxHex) displayBalance = 0;
                  else if (vault.triggerTxHex) {
                    const triggerTxData = vault.txMap[vault.triggerTxHex];
                    if (!triggerTxData) throw new Error('Invalid txMap');
                    displayBalance =
                      vault.balance - vaultTxData.fee - triggerTxData.fee;
                  }
                  if (vault.triggerTxHex && !vault.triggerPushTime)
                    throw new Error('Trigger push time not registered');
                  if (!vault.vaultPushTime)
                    throw new Error('Vault push time not registered');
                  return (
                    <View key={vaultAddress} style={styles.vaultContainer}>
                      <Text>
                        {`Vault ${index + 1} · ${displayBalance} sats`}
                        {checkingBalance && ' ⏳'}
                      </Text>
                      {vault.triggerPushTime ? (
                        <Text>
                          Triggered On:{' '}
                          {new Date(
                            vault.triggerPushTime * 1000
                          ).toLocaleString()}
                        </Text>
                      ) : (
                        <Text>
                          Locked On:{' '}
                          {new Date(
                            vault.vaultPushTime * 1000
                          ).toLocaleString()}
                        </Text>
                      )}
                      <Text>
                        {!vault.triggerTxHex
                          ? `Time Lock Set: ${vault.lockBlocks} blocks 🔒`
                          : vault.remainingBlocks !== 0
                          ? `Unlocking In: ${vault.remainingBlocks} blocks 🔒⏱️`
                          : vault.panicTxHex
                          ? 'Funds were sent to Panic Address'
                          : vault.unlockingTxHex
                          ? 'Vault was spent as Hot'
                          : `Vault can be spent as Hot (or Panic)`}
                      </Text>

                      <View style={styles.buttonGroup}>
                        {vault.triggerTxHex && !vault.unlockingTxHex && (
                          <>
                            <Button
                              title="Panic!"
                              onPress={() => handlePanic(vault)}
                            />
                          </>
                        )}
                        {!vault.triggerTxHex && (
                          <Button
                            title="Unvault"
                            onPress={() => {
                              setUnvault(vault);
                            }}
                          />
                        )}
                        {!vault.unlockingTxHex && (
                          <Button
                            title="Delegate"
                            onPress={() => handleDelegate(vault)}
                          />
                        )}
                      </View>
                    </View>
                  );
                })}
            </View>
          )}
        </ScrollView>
        <Modal visible={!!receiveAddress} animationType="slide">
          {receiveAddress && (
            <View style={styles.modal}>
              <QRCode value={receiveAddress} />
              <Text
                style={styles.addressText}
                onPress={() => {
                  //TODO: Add some padding in this text because it's very
                  //difficult to get it clicked on android device:
                  Clipboard.setStringAsync(receiveAddress);
                  //TODO: translate
                  Alert.alert('Address copied to clipboard');
                }}
              >
                {receiveAddress} 📋
              </Text>
              <View style={styles.buttonClose}>
                <Button
                  title="Close"
                  onPress={() => {
                    setReceiveAddress(null);
                  }}
                />
              </View>
            </View>
          )}
        </Modal>
        <Modal visible={isSettingsVisible} animationType="slide">
          <View style={styles.modal}>
            {mnemonic && (
              <Text style={styles.mnemo}>MNEMOMIC ✍: {mnemonic}</Text>
            )}
            <View style={styles.factoryReset}>
              <Button
                title="Factory Reset"
                onPress={async () => {
                  //TODO: See how to deal with this using the context... storage.clearAll();
                  if (discovery) await discovery.getExplorer().close();
                  await init();
                }}
              />
            </View>
            <View style={styles.buttonClose}>
              <Button
                title="Close"
                onPress={() => setIsSettingsVisible(false)}
              />
            </View>
          </View>
        </Modal>
        {hotUtxosData && (
          <Modal visible={isVaultSetUp} animationType="slide">
            <View style={[styles.modal, { padding: 40 }]}>
              <VaultSetUp
                network={network}
                utxosData={hotUtxosData}
                feeEstimates={feeEstimates}
                btcFiat={btcFiat}
                onNewValues={onNewVaultSetUpValues}
                onCancel={() => setIsVaultSetUp(false)}
              />
            </View>
          </Modal>
        )}
        {hotUtxosData && newVaultSettings && discovery && (
          <Modal>
            <VaultCreate
              masterNode={fromMnemonic(mnemonic).masterNode}
              utxosData={hotUtxosData}
              {...newVaultSettings}
              coldAddress={DEFAULT_COLD_ADDR}
              serviceAddress={DEFAULT_SERVICE_ADDR}
              changeDescriptor={fromMnemonic(
                mnemonic
              ).changeDescriptor.replaceAll(
                '*',
                discovery
                  .getNextIndex({
                    descriptor: fromMnemonic(mnemonic).changeDescriptor
                  })
                  .toString()
              )}
              unvaultKey={fromMnemonic(mnemonic).unvaultKey}
              network={network}
              onNewVaultCreated={onNewVaultCreated}
            />
          </Modal>
        )}
        <Modal visible={!!unvault} animationType="slide">
          <View style={[styles.modal, { padding: 40 }]}>
            <Text style={styles.title}>Trigger Unvault</Text>
            <Unvault
              minFeeRate={MIN_FEE_RATE}
              maxFeeRate={
                unvault === null
                  ? (settings || defaultSettings).PRESIGNED_FEE_RATE_CEILING
                  : maxTriggerFeeRate(unvault)
              }
              onNewValues={async ({ feeRate }: { feeRate: number }) => {
                if (!unvault) throw new Error('Vault unset');
                await handleTriggerUnvault({
                  feeRate,
                  vault: unvault
                });
              }}
              onCancel={() => setUnvault(null)}
              formatFeeRate={({ feeRate }: { feeRate: number }) => {
                if (!unvault) throw new Error('Trigger Vault unavailable');
                return formatTriggerFeeRate(
                  {
                    feeRate,
                    btcFiat,
                    locale: (settings || defaultSettings).LOCALE,
                    currency: (settings || defaultSettings).CURRENCY,
                    feeEstimates,
                    vault: unvault
                  },
                  t
                );
              }}
            />
          </View>
        </Modal>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

export default () => (
  <StorageProvider>
    <App />
  </StorageProvider>
);
