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
  SettingsProvider,
  useSettings,
  Locale,
  Currency
} from './src/contexts/SettingsContext';

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

const MBButton = ({ ...props }: ButtonProps) => (
  <View style={{ marginBottom: 10 }}>
    <Button {...props} />
  </View>
);
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import VaultSetUp from './src/components/views/VaultSetUp';
import Unvault from './src/components/views/Unvault';
import AsyncStorage from '@react-native-async-storage/async-storage';
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
  scriptExpressions,
  DescriptorsFactory
} from '@bitcoinerlab/descriptors';
const { wpkhBIP32 } = scriptExpressions;

import { EsploraExplorer } from '@bitcoinerlab/explorer';
import { DiscoveryFactory, DiscoveryInstance } from '@bitcoinerlab/discovery';
// init to something. The useSettings for correct values
initI18n(defaultSettings.LOCALE);

const { Output, BIP32 } = DescriptorsFactory(secp256k1);
const GAP_LIMIT = 3;
const MIN_FEE_RATE = 1;
const SAMPLES = 10;
//
//TODO: maxTriggerFeeRate, maxFeeRate, FEE_RATE_CEILING and DEFAULT_MAX_FEE_RATE
//are super confussing. Note that the feeRateCeiling should be, in fact, the
//Math.max(FEE_RATE_CEILING, maxFeeRate())
//  -> Maybe it's even better to throw if fees go crazy. Even to more
//  than FEE_RATE_CEILING. In that case it's safer to throw and not allow
//  users to use ThunderDen because it was not desifned to that?
//
//
//This is the maxFeeRate that will be required to be pre-signed in panicTxs
//It there is not enough balance, then it will fail
const FEE_RATE_CEILING = 5 * 1000; //22-dec-2017 fee rates were 1000. TODO: Set this to 5000 which is 5x 22-dec-2017
const DEFAULT_MAX_FEE_RATE = FEE_RATE_CEILING; //Not very important. Use this one while feeEstimates is not retrieved. This is the maxFeeRate that we assume that feeEstimates will return
const DEFAULT_COLD_ADDR = 'tb1qm0k9mn48uqfs2w9gssvzmus4j8srrx5eje7wpf';
import {
  createVault,
  Vault,
  esploraUrl,
  fetchSpendingTx,
  Vaults,
  getUtxosData,
  utxosDataBalance,
  UtxosData,
  estimateTriggerTxSize
} from './src/lib/vaults';
import styles from './styles/styles';
import type { TFunction } from 'i18next';

const fromMnemonic = memoize(mnemonic => {
  if (!mnemonic) throw new Error('mnemonic not passed');
  const masterNode = BIP32.fromSeed(mnemonicToSeedSync(mnemonic), network);
  const descriptors = [0, 1].map(change =>
    wpkhBIP32({ masterNode, network, account: 0, index: '*', change })
  );
  if (!descriptors[0] || !descriptors[1])
    throw new Error(`Error: descriptors not retrieved`);
  const unvaultKey = keyExpressionBIP32({
    masterNode,
    originPath: "/0'",
    keyPath: '/0'
  });
  return {
    masterNode,
    external: descriptors[0],
    internal: descriptors[1],
    unvaultKey
  };
});

const maxTriggerFeeRate = (vault: Vault | null) => {
  if (vault) {
    return Math.max(
      ...Object.keys(vault.triggerMap).map(triggerTx => {
        const txRecord = vault.txMap[triggerTx];
        if (!txRecord) throw new Error('Invalid txMap');
        return txRecord.feeRate;
      })
    );
  } else return DEFAULT_MAX_FEE_RATE;
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
  const [isSettingsVisible, setIsSettingsVisible] = useState(false);
  const [isVaultSetUp, setIsVaultSetUp] = useState(false);
  //Set to a vault value to display the Modal that is called when the user
  //is going to unvault a vault (indicated as unvault).
  //Set it to null to hide the modal.
  const [unvault, setUnvault] = useState<Vault | null>(null);
  const [receiveAddress, setReceiveAddress] = useState<string | null>(null);
  const [mnemonic, setMnemonic] = useState<string | null>(null);
  const [discovery, setDiscovery] = useState<DiscoveryInstance | null>(null);
  const [utxos, setUtxos] = useState<Array<string> | null>(null);
  const [vaults, setVaults] = useState<Vaults>({});
  const [checkingBalance, setCheckingBalance] = useState(false);
  const [feeEstimates, setFeeEstimates] = useState<Record<
    string,
    number
  > | null>(null);
  const [btcFiat, setBtcFiat] = useState<number | null>(null);
  const { settings } = useSettings();
  useEffect(() => {
    initI18n(settings.LOCALE);
  }, [settings.LOCALE]);

  const { t } = useTranslation();
  const intervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchBtcFiat = async () => {
    try {
      const btcFiat = await getBtcFiat(settings.CURRENCY);
      setBtcFiat(btcFiat);
    } catch (err) {
      // TODO: Handle errors here
      console.error(err);
    }
  };

  const lastCurrencyRef = useRef(settings.CURRENCY);
  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (lastCurrencyRef.current !== settings.CURRENCY) fetchBtcFiat();

    lastCurrencyRef.current = settings.CURRENCY;
    intervalRef.current = setInterval(
      fetchBtcFiat,
      settings.BTC_FIAT_REFRESH_INTERVAL_MS
    );

    // Clear interval on unmount or when settings.CURRENCY changes
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [settings.CURRENCY, settings.BTC_FIAT_REFRESH_INTERVAL_MS]);

  const init = async () => {
    const mnemonic = await AsyncStorage.getItem('mnemonic');
    const url = esploraUrl(network);
    const explorer = new EsploraExplorer({ url });
    const { Discovery } = DiscoveryFactory(explorer, network);
    await explorer.connect();
    const discovery = new Discovery();
    const vaults = JSON.parse((await AsyncStorage.getItem('vaults')) || '{}');

    setIsSettingsVisible(false);
    setIsVaultSetUp(false);
    setUnvault(null);
    setReceiveAddress(null);
    setMnemonic(mnemonic || null);
    setDiscovery(discovery);
    setUtxos(null);
    setVaults(vaults);
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
    initI18n(settings.LOCALE);
  };

  useEffect(() => {
    init();
  }, []);
  useEffect(() => {
    if (discovery && mnemonic) handleCheckBalance();
  }, [discovery, mnemonic]);
  const sortedVaultKeys = Object.keys(vaults).sort().toString();
  useEffect(() => {
    if (discovery && !checkingBalance && mnemonic) handleCheckBalance();
  }, [sortedVaultKeys]);
  useEffect(() => {
    if (discovery && !checkingBalance && mnemonic && !receiveAddress)
      handleCheckBalance();
  }, [receiveAddress]);

  const handleCreateWallet = async () => {
    const mnemonic = generateMnemonic();
    await AsyncStorage.setItem('mnemonic', mnemonic);
    setMnemonic(mnemonic);
  };

  const handleCheckBalance = async () => {
    if (!checkingBalance) {
      setCheckingBalance(true);
      if (!discovery) throw new Error(`discovery not instantiated yet!`);
      const blockHeight = await discovery.getExplorer().fetchBlockHeight();
      if (!blockHeight) throw new Error(`Could not bet tip block height`);

      //First update the vaults. Then the utxos
      let newVaults = vaults; //Do not mutate vaults
      for (const vault of Object.values(vaults)) {
        const triggerTxData = await fetchSpendingTx(
          vault.vaultTxHex,
          0,
          discovery
        );
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
        await AsyncStorage.setItem('vaults', JSON.stringify(newVaults));
        setVaults(newVaults);
      }

      //Now update the utxos:
      const descriptors = [
        fromMnemonic(mnemonic).external,
        fromMnemonic(mnemonic).internal,
        ...spendableTriggerDescriptors(newVaults)
      ];
      await discovery.fetch({ descriptors, gapLimit: GAP_LIMIT });
      const { utxos } = discovery.getUtxosAndBalance({ descriptors });
      //console.log('vaults', vaults);
      //I can do this because getUtxosAndBalance uses immutability.
      //Setting same utxo won't produce a re-render in React.
      console.log('UTXOS SET');
      setUtxos(utxos.length ? utxos : null);
      console.log('UTXOS SET - OK');

      setCheckingBalance(false);
    }
  };

  const handleReceiveBitcoin = async () => {
    const external = fromMnemonic(mnemonic).external;
    if (!discovery) throw new Error(`discovery not instantiated yet!`);
    const index = discovery.getNextIndex({ descriptor: external });
    const output = new Output({ descriptor: external, index, network });
    setReceiveAddress(output.getAddress());
  };

  //TODO: Must review this one too
  const handlePanic = async (vault: Vault) => {
    if (!discovery) throw new Error(`discovery not instantiated yet!`);
    const newVaults = { ...vaults };
    delete newVaults[vault.vaultAddress];
    await AsyncStorage.setItem('vaults', JSON.stringify(newVaults));
    //TODO: check this push result. This and all pushes in code
    if (!vault.panicTxHex) throw new Error('Cannot panic');
    await discovery.getExplorer().push(vault.panicTxHex);
    Alert.alert(
      'Transaction Successful',
      `Funds have been sent to the safe address: ${vault.coldAddress}.`
    );
    setVaults(newVaults);
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
    await AsyncStorage.setItem('vaults', JSON.stringify(newVaults));
    if (!discovery) throw new Error(`discovery not instantiated yet!`);
    //TODO: check this push result. This and all pushes in code
    await discovery.getExplorer().push(txHex);
    setVaults(newVaults);
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

  const handleVault = async ({
    utxosData,
    feeRate,
    lockBlocks
  }: {
    utxosData?: UtxosData;
    feeRate: number;
    lockBlocks?: number;
  }) => {
    if (utxosData === undefined)
      throw new Error('VaultSetUp could not coinselect some utxos');
    if (lockBlocks === undefined) throw new Error('lockBlocks not retrieved');
    setIsVaultSetUp(false);

    if (!discovery) throw new Error(`discovery not instantiated yet!`);
    const masterNode = fromMnemonic(mnemonic).masterNode;
    const unvaultKey = fromMnemonic(mnemonic).unvaultKey;
    //HERE CREATE THE triggerDescriptor using the next
    if (utxos === null || !utxos.length) throw new Error(`utxos unset`);
    const vault = createVault({
      unvaultKey,
      samples: SAMPLES,
      feeRate,
      feeRateCeiling: FEE_RATE_CEILING,
      coldAddress: DEFAULT_COLD_ADDR,
      lockBlocks,
      masterNode,
      utxosData,
      network
    });

    if (vault) {
      //TODO: I should index it based on vault.vaultTxHex
      vault.vaultPushTime = Math.floor(Date.now() / 1000);
      const newVaults = { ...vaults, [vault.vaultAddress]: vault };
      await AsyncStorage.setItem('vaults', JSON.stringify(newVaults));
      if (!discovery) throw new Error(`discovery not instantiated yet!`);
      //TODO: check this push result. This and all pushes in code
      await discovery.getExplorer().push(vault.vaultTxHex);
      setVaults(newVaults);
    } else {
      //TODO: It was impossible to create the Vault so that it creates
      //a recoverable path. Warn the user.
      console.warn(
        'TODO: Implement this! It was impossible to create the Vault so that it creates a recoverable path.'
      );
    }
  };

  //TODO: this fails if I type stuff and save it and expo-reloads because then
  //init is not called
  const hotUtxosData =
    utxos === null || discovery === null
      ? null
      : getUtxosData(utxos, vaults, network, discovery);
  const hotBalance =
    hotUtxosData === null ? null : utxosDataBalance(hotUtxosData);

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
                  subUnit: settings.SUB_UNIT,
                  btcFiat,
                  locale: settings.LOCALE,
                  currency: settings.CURRENCY
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
                  Clipboard.setStringAsync(receiveAddress);
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
                  await AsyncStorage.clear();
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
                utxosData={hotUtxosData}
                feeEstimates={feeEstimates}
                btcFiat={btcFiat}
                onNewValues={handleVault}
                onCancel={() => setIsVaultSetUp(false)}
              />
            </View>
          </Modal>
        )}
        <Modal visible={!!unvault} animationType="slide">
          <View style={[styles.modal, { padding: 40 }]}>
            <Text style={styles.title}>Trigger Unvault</Text>
            <Unvault
              minFeeRate={MIN_FEE_RATE}
              maxFeeRate={maxTriggerFeeRate(unvault)}
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
                    locale: settings.LOCALE,
                    currency: settings.CURRENCY,
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
  <SettingsProvider>
    <App />
  </SettingsProvider>
);
