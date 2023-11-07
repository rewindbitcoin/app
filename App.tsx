//TODO: The Settings Window (mode default) is not scrollable
//In any case, this window should not be aplicable anymore
//TODO: createVault will throw if it's not possible to create a Vault. Maybe return empty?
//TODO: Consider not doing the last unvaultTx. It automatically goes to hot
//This leads to faster tx processing
//TODO: Do not use a hardocded panic address but offer the possibility to create
//one, then show the mnemonic and tell people we will be deleting it automatically
//TODO: Create a Withdrawal Button (when hot > 0)

import './init';
import React, { useState, useEffect } from 'react';
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
const MBButton = ({ ...props }: ButtonProps) => (
  <View style={{ marginBottom: 10 }}>
    <Button {...props} />
  </View>
);
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import VaultSettings from './VaultSettings';
import AsyncStorage from '@react-native-async-storage/async-storage';
import QRCode from 'react-native-qrcode-svg';
import * as Clipboard from 'expo-clipboard';
import { Share } from 'react-native';
import memoize from 'lodash.memoize';
import { getBTCUSD } from './btcRates';

import { Transaction, networks } from 'bitcoinjs-lib';
const network = networks.testnet;

import { generateMnemonic, mnemonicToSeedSync } from 'bip39';
import * as secp256k1 from '@bitcoinerlab/secp256k1';
import {
  scriptExpressions,
  DescriptorsFactory
} from '@bitcoinerlab/descriptors';
const { wpkhBIP32 } = scriptExpressions;

import { EsploraExplorer } from '@bitcoinerlab/explorer';
import { DiscoveryFactory, DiscoveryInstance } from '@bitcoinerlab/discovery';

const { Output, BIP32 } = DescriptorsFactory(secp256k1);
const FEE_RATE = 1;
const SAMPLES = 10;
const FEE_RATE_CEILING = 10; //const FEE_RATE_CEILING = 1000; //22-dec-2017 fee rates
const DEF_PANIC_ADDR = 'tb1qm0k9mn48uqfs2w9gssvzmus4j8srrx5eje7wpf';
//FIX TODO Use number
const DEF_LOCK_BLOCKS = String(6 * 24 * 7);
import { createVault, Vault, esploraUrl, remainingBlocks } from './vaults';
import styles from './styles';

type Vaults = Record<string, Vault>;

const fromMnemonic = memoize(mnemonic => {
  if (!mnemonic) throw new Error('mnemonic not passed');
  const masterNode = BIP32.fromSeed(mnemonicToSeedSync(mnemonic), network);
  const descriptors = [0, 1].map(change =>
    wpkhBIP32({ masterNode, network, account: 0, index: '*', change })
  );
  if (!descriptors[0] || !descriptors[1])
    throw new Error(`Error: descriptors not retrieved`);
  return { masterNode, external: descriptors[0], internal: descriptors[1] };
});

export default function App() {
  const [isSettingsVisible, setIsSettingsVisible] = useState(false);
  const [isVaultSetUp, setIsVaultSetUp] = useState(false);
  const [receiveAddress, setReceiveAddress] = useState<string | null>(null);
  const [mnemonic, setMnemonic] = useState<string | null>(null);
  const [defPanicAddr, setDefPanicAddr] = useState(DEF_PANIC_ADDR);
  const [defLockBlocks, setDefLockBlocks] = useState(DEF_LOCK_BLOCKS);
  const [discovery, setDiscovery] = useState<DiscoveryInstance | null>(null);
  const [utxos, setUtxos] = useState<Array<string> | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [vaults, setVaults] = useState<Vaults>({});
  const [checkingBalance, setCheckingBalance] = useState(false);
  const [feeEstimates, setFeeEstimates] = useState<Record<
    string,
    number
  > | null>(null);
  const [btcUsd, setBtcUsd] = useState<number | null>(null);

  const init = async () => {
    const mnemonic = await AsyncStorage.getItem('mnemonic');
    const defPanicAddr = await AsyncStorage.getItem('defPanicAddr');
    const defLockBlocks = await AsyncStorage.getItem('defLockBlocks');
    const url = esploraUrl(network);
    const explorer = new EsploraExplorer({ url });
    const { Discovery } = DiscoveryFactory(explorer, network);
    await explorer.connect();
    const discovery = new Discovery();
    const vaults = JSON.parse((await AsyncStorage.getItem('vaults')) || '{}');

    setIsSettingsVisible(false);
    setIsVaultSetUp(false);
    setReceiveAddress(null);
    setMnemonic(mnemonic || null);
    if (defPanicAddr) setDefPanicAddr(defPanicAddr);
    if (defLockBlocks) setDefLockBlocks(defLockBlocks);
    setDiscovery(discovery);
    setUtxos(null);
    setBalance(null);
    setVaults(vaults);
    setCheckingBalance(false);

    try {
      //TODO: feeEstimates must update every block or at least every 10 minutes?
      const feeEstimates = await explorer.fetchFeeEstimates();
      setFeeEstimates(feeEstimates);
    } catch (err) {}

    try {
      const btcUsd = await getBTCUSD();
      setBtcUsd(btcUsd);
    } catch (err) {}
  };

  const formatFeeRate = (feeRate: number) => {
    let strBtcUsd = `Waiting for BTC/USD rates...`;
    let strTime = `Waiting for fee estimates...`;
    const txSize = vaultTxSize(utxos);
    const averageBlockTimeInMinutes = 10; // Average time for one block to be mined
    if (btcUsd)
      strBtcUsd = `Fee: $${((feeRate * txSize * btcUsd) / 100000000).toFixed(
        2
      )}.`;
    if (feeEstimates && Object.keys(feeEstimates).length) {
      // Convert the feeEstimates object keys to numbers and sort them
      const sortedEstimates = Object.keys(feeEstimates)
        .map(Number)
        .sort((a, b) => feeEstimates[a]! - feeEstimates[b]!);

      // Find the confirmation target with the closest higher fee rate than the given feeRate
      const target = sortedEstimates.find(
        estimate => feeEstimates[estimate]! >= feeRate
      );

      // If a matching target is found, return the corresponding message
      if (target !== undefined) {
        const timeInMinutes = target * averageBlockTimeInMinutes;
        let timeEstimate = '';

        if (timeInMinutes >= 60) {
          const timeInHours = (timeInMinutes / 60).toFixed(1); // Keep one decimal place for hours
          timeEstimate = `~${timeInHours} ${
            timeInHours === '1.0' ? `hours` : `hour`
          }`;
        } else {
          timeEstimate = `~${timeInMinutes} mins`;
        }

        strTime = `Confirmation: ${timeEstimate}.`;
      } else {
        // If the provided fee rate is lower than any estimate,
        // it's not possible to estimate the time
        strTime = `Will confirm quick.`;
      }
    }
    return `${strBtcUsd} ${strTime}`;
  };
  const formatLockTime = (blocks: number): string => {
    const averageBlockTimeInMinutes = 10;

    const timeInMinutes = blocks * averageBlockTimeInMinutes;
    let timeEstimate = '';

    if (timeInMinutes < 60) {
      timeEstimate = `~${timeInMinutes} minute${timeInMinutes > 1 ? 's' : ''}`;
    } else if (timeInMinutes < 1440) {
      // Less than a day
      const timeInHours = (timeInMinutes / 60).toFixed(1);
      timeEstimate = `~${timeInHours} hour${timeInHours === '1.0' ? '' : 's'}`;
    } else {
      const timeInDays = (timeInMinutes / 1440).toFixed(1);
      timeEstimate = `~${timeInDays} day${timeInDays === '1.0' ? '' : 's'}`;
    }

    return `Estimated lock time: ${timeEstimate}`;
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

  const vaultTxSize = memoize(_utxos => {
    const vault = handleVaultFunds({
      samples: 2,
      feeRate: 1,
      feeRateCeiling: 1,
      panicAddr: DEF_PANIC_ADDR,
      lockBlocks: 1
    });
    const triggerTx = Object.keys(vault.triggerMap)[0];
    if (triggerTx === undefined)
      throw new Error(`Vault cannot be created with current utxos`);
    const vSize = Transaction.fromHex(triggerTx).virtualSize();
    console.log('New _utxos!', vSize);
    return vSize;
  });

  const handleCheckBalance = async () => {
    if (!checkingBalance) {
      setCheckingBalance(true);
      const descriptors = [
        fromMnemonic(mnemonic).external,
        fromMnemonic(mnemonic).internal
      ];
      if (!discovery) throw new Error(`discovery not instantiated yet!`);
      //if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
      await discovery.fetch({ descriptors, gapLimit: 3 });
      const { utxos, balance } = discovery.getUtxosAndBalance({ descriptors });
      setUtxos(utxos.length ? utxos : null);
      setBalance(balance);

      if (vaults) {
        const newVaults = { ...vaults };
        let newVault = false;
        for (const [vaultAddress, vault] of Object.entries(vaults)) {
          const remainingBlocksValue = await remainingBlocks(vault, discovery);
          if (vault.remainingBlocks !== remainingBlocksValue) {
            const vault = newVaults[vaultAddress];
            if (!vault) throw new Error(`Error: invalid vault ${vaultAddress}`);
            vault.remainingBlocks = remainingBlocksValue;
            newVault = true;
          }
        }
        if (newVault) setVaults(newVaults);
      }
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

  const handleUnvault = async (vault: Vault) => {
    if (!discovery) throw new Error(`discovery not instantiated yet!`);
    try {
      await discovery.getExplorer().push(vault.unvaultTxHex);

      // If successful:
      const newVaults = { ...vaults };
      delete newVaults[vault.vaultAddress];
      await AsyncStorage.setItem('vaults', JSON.stringify(newVaults));
      setVaults(newVaults);
    } catch (error: unknown) {
      const message = (error as Error).message;

      if (message && message.indexOf('non-BIP68-final') !== -1) {
        const remainingBlocksValue = await remainingBlocks(vault, discovery);
        Alert.alert(
          'Vault Status',
          `The vault remains time-locked. Please wait for an additional ${remainingBlocksValue} blocks before you can proceed.`
        );
      } else {
        // Handle any other errors or show a general error alert:
        Alert.alert('Error broadcasting the transaction.', message);
      }
    }
  };

  const handlePanic = async (vault: Vault) => {
    if (!discovery) throw new Error(`discovery not instantiated yet!`);
    await discovery.getExplorer().push(vault.panicTxHex);
    Alert.alert(
      'Transaction Successful',
      `Funds have been sent to the safe address: ${vault.panicAddr}.`
    );
    const newVaults = { ...vaults };
    delete newVaults[vault.vaultAddress];
    await AsyncStorage.setItem('vaults', JSON.stringify(newVaults));
    setVaults(newVaults);
  };

  const handleTriggerUnvault = async (vault: Vault) => {
    if (!discovery) throw new Error(`discovery not instantiated yet!`);
    await discovery.getExplorer().push(vault.triggerTxHex);
    const newVaults = {
      ...vaults,
      [vault.vaultAddress]: {
        ...vault,
        triggerTime: Math.floor(Date.now() / 1000)
      }
    };
    await AsyncStorage.setItem('vaults', JSON.stringify(newVaults));
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

  const handleVaultFunds = ({
    samples,
    feeRate,
    feeRateCeiling,
    panicAddr,
    lockBlocks
  }: {
    samples: number;
    feeRate: number;
    /** This is the largest fee rate for which at least one trigger and panic txs
     * must be pre-computed*/
    feeRateCeiling: number;
    panicAddr: string;
    lockBlocks: number;
  }) => {
    const masterNode = fromMnemonic(mnemonic).masterNode;
    const internal = fromMnemonic(mnemonic).internal;
    if (!discovery) throw new Error(`discovery not instantiated yet!`);
    const nextInternalAddress = new Output({
      descriptor: internal,
      index: discovery.getNextIndex({ descriptor: internal }),
      network
    }).getAddress();
    if (balance === null) throw new Error(`Error: unset balance`);
    if (utxos === null) throw new Error(`Error: unset utxos`);
    const utxosData = utxos.map(utxo => {
      const [txId, strVout] = utxo.split(':');
      const vout = Number(strVout);
      if (!txId || isNaN(vout) || !Number.isInteger(vout) || vout < 0)
        throw new Error(`Invalid utxo ${utxo}`);
      const indexedDescriptor = discovery.getDescriptor({ utxo });
      if (!indexedDescriptor) throw new Error(`Unmatched ${utxo}`);
      const txHex = discovery.getTxHex({ txId });
      return { indexedDescriptor, txHex, vout };
    });
    const vault = createVault({
      samples,
      feeRate,
      feeRateCeiling,
      nextInternalAddress,
      panicAddr,
      lockBlocks,
      masterNode,
      utxosData,
      balance,
      network
    });
    return vault;
  };

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
            <MBButton title="Deposit Bitcoin" onPress={handleReceiveBitcoin} />
          )}
          {utxos && (
            <MBButton
              title="Vault Funds"
              onPress={() => setIsVaultSetUp(true)}
            />
          )}
          {mnemonic && balance !== null && (
            <Text style={styles.hotBalance}>
              Hot Balance: {balance} sats{checkingBalance && ' ⏳'}
            </Text>
          )}
          {vaults && Object.keys(vaults).length > 0 && (
            <View style={styles.vaults}>
              <Text style={styles.title}>Vaults</Text>
              {Object.entries(vaults).map(([vaultAddress, vault], index) => (
                <View key={vaultAddress} style={styles.vaultContainer}>
                  <Text>
                    {`Vault ${index + 1} · ${
                      vault.triggerTime
                        ? vault.triggerBalance
                        : vault.vaultBalance
                    } sats`}
                    {checkingBalance && ' ⏳'}
                  </Text>
                  {vault.triggerTime ? (
                    <Text>
                      Triggered On:{' '}
                      {new Date(vault.triggerTime * 1000).toLocaleString()}
                    </Text>
                  ) : (
                    <Text>
                      Locked On:{' '}
                      {new Date(vault.vaultTime * 1000).toLocaleString()}
                    </Text>
                  )}
                  <Text>
                    {vault.triggerTime
                      ? vault.remainingBlocks <= 0
                        ? `Ready to Unvault 🟢🔓`
                        : `Unlocking In: ${
                            vault.lockBlocks - vault.remainingBlocks
                          }/${vault.lockBlocks} blocks 🔒⏱️`
                      : `Time Lock Set: ${vault.lockBlocks} blocks 🔒`}
                  </Text>

                  <View style={styles.buttonGroup}>
                    {vault.triggerTime ? (
                      <>
                        <Button
                          title="Consolidate"
                          onPress={() => handleUnvault(vault)}
                        />
                        <Button
                          title="Panic!"
                          onPress={() => handlePanic(vault)}
                        />
                      </>
                    ) : (
                      <Button
                        title="Unvault"
                        onPress={() => handleTriggerUnvault(vault)}
                      />
                    )}
                    <Button
                      title="Delegate"
                      onPress={() => handleDelegate(vault)}
                    />
                  </View>
                </View>
              ))}
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
            <VaultSettings
              isWrapped
              defPanicAddr={defPanicAddr}
              defLockBlocks={defLockBlocks}
              network={network}
              onNewValues={async ({
                panicAddr,
                lockBlocks
              }: {
                panicAddr: string;
                lockBlocks: number;
              }) => {
                setDefPanicAddr(panicAddr);
                setDefLockBlocks(String(lockBlocks));
              }}
              formatFeeRate={formatFeeRate}
              formatLockTime={formatLockTime}
            />
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
        <Modal visible={isVaultSetUp} animationType="slide">
          <View style={[styles.modal, { padding: 40 }]}>
            <Text style={styles.title}>Vault Set Up</Text>
            <VaultSettings
              defPanicAddr={defPanicAddr}
              defLockBlocks={defLockBlocks}
              network={network}
              onNewValues={async ({
                panicAddr, //TODO: Dont return this one!
                lockBlocks
              }: {
                panicAddr: string;
                lockBlocks: number;
              }) => {
                setIsVaultSetUp(false);
                const vault = handleVaultFunds({
                  samples: SAMPLES,
                  feeRate: FEE_RATE, //TODO: This should be returned from Settings
                  feeRateCeiling: FEE_RATE_CEILING,
                  panicAddr,
                  lockBlocks
                });
                const newVaults = { ...vaults, [vault.vaultAddress]: vault };
                await AsyncStorage.setItem('vaults', JSON.stringify(newVaults));
                if (!discovery)
                  throw new Error(`discovery not instantiated yet!`);
                await discovery.getExplorer().push(vault.vaultTxHex);
                setVaults(newVaults);
              }}
              onCancel={() => setIsVaultSetUp(false)}
              formatFeeRate={formatFeeRate}
              formatLockTime={formatLockTime}
            />
          </View>
        </Modal>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
