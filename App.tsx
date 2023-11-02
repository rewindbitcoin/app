import "./init";
import React, { useState, useEffect } from "react";
import {
  ScrollView,
  Text,
  View,
  Button,
  ButtonProps,
  Alert,
  Modal,
  RefreshControl,
} from "react-native";
const MBButton = ({ ...props }: ButtonProps) => (
  <View style={{ marginBottom: 10 }}>
    <Button {...props} />
  </View>
);
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

import VaultSettings from "./VaultSettings";
import AsyncStorage from "@react-native-async-storage/async-storage";
import QRCode from "react-native-qrcode-svg";
import * as Clipboard from "expo-clipboard";
import { Share } from "react-native";
import memoize from "lodash.memoize";

import { networks } from "bitcoinjs-lib";
const network = networks.testnet;

import { generateMnemonic, mnemonicToSeedSync } from "bip39";
import * as secp256k1 from "@bitcoinerlab/secp256k1";
import {
  scriptExpressions,
  DescriptorsFactory,
} from "@bitcoinerlab/descriptors";
const { wpkhBIP32 } = scriptExpressions;

import { EsploraExplorer } from "@bitcoinerlab/explorer";
import { DiscoveryFactory, DiscoveryInstance } from "@bitcoinerlab/discovery";

const { Output, BIP32 } = DescriptorsFactory(secp256k1);
const DEF_PANIC_ADDR = "tb1qm0k9mn48uqfs2w9gssvzmus4j8srrx5eje7wpf";
//FIX TODO Use number
const DEF_LOCK_BLOCKS = String(6 * 24 * 7);
import { createVault, Vault, esploraUrl, remainingBlocks } from "./vaults";
import styles from "./styles";

type Vaults = Record<string, Vault>;

const fromMnemonic = memoize((mnemonic) => {
  if (!mnemonic) throw new Error("mnemonic not passed");
  const masterNode = BIP32.fromSeed(mnemonicToSeedSync(mnemonic), network);
  const descriptors = [0, 1].map((change) =>
    wpkhBIP32({ masterNode, network, account: 0, index: "*", change }),
  );
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

  const init = async () => {
    const mnemonic = await AsyncStorage.getItem("mnemonic");
    const defPanicAddr = await AsyncStorage.getItem("defPanicAddr");
    const defLockBlocks = await AsyncStorage.getItem("defLockBlocks");
    const url = esploraUrl(network);
    const explorer = new EsploraExplorer({ url });
    const { Discovery } = DiscoveryFactory(explorer, network);
    await explorer.connect();
    const discovery = new Discovery();
    const vaults = JSON.parse((await AsyncStorage.getItem("vaults")) || "{}");

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
    await AsyncStorage.setItem("mnemonic", mnemonic);
    setMnemonic(mnemonic);
  };

  const handleCheckBalance = async () => {
    if (!checkingBalance) {
      setCheckingBalance(true);
      const descriptors = [
        fromMnemonic(mnemonic).external,
        fromMnemonic(mnemonic).internal,
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
          const remainingBlocksValue = await remainingBlocks(vault, network);
          if (vault.remainingBlocks !== remainingBlocksValue) {
            newVaults[vaultAddress].remainingBlocks = remainingBlocksValue;
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
    try {
      if (!discovery) throw new Error(`discovery not instantiated yet!`);
      await discovery.getExplorer().push(vault.unvaultTxHex);

      // If successful:
      const newVaults = { ...vaults };
      delete newVaults[vault.vaultAddress];
      await AsyncStorage.setItem("vaults", JSON.stringify(newVaults));
      setVaults(newVaults);
    } catch (error: unknown) {
      const message = (error as Error).message;

      if (message && message.indexOf("non-BIP68-final") !== -1) {
        const remainingBlocksValue = await remainingBlocks(vault, network);
        Alert.alert(
          "Vault Status",
          `The vault remains time-locked. Please wait for an additional ${remainingBlocksValue} blocks before you can proceed.`,
        );
      } else {
        // Handle any other errors or show a general error alert:
        Alert.alert("Error broadcasting the transaction.", message);
      }
    }
  };

  const handlePanic = async (vault: Vault) => {
    if (!discovery) throw new Error(`discovery not instantiated yet!`);
    await discovery.getExplorer().push(vault.panicTxHex);
    Alert.alert(
      "Transaction Successful",
      `Funds have been sent to the safe address: ${vault.panicAddr}.`,
    );
    const newVaults = { ...vaults };
    delete newVaults[vault.vaultAddress];
    await AsyncStorage.setItem("vaults", JSON.stringify(newVaults));
    setVaults(newVaults);
  };

  const handleTriggerUnvault = async (vault: Vault) => {
    if (!discovery) throw new Error(`discovery not instantiated yet!`);
    await discovery.getExplorer().push(vault.triggerTxHex);
    const newVaults = {
      ...vaults,
      [vault.vaultAddress]: {
        ...vault,
        triggerTime: Math.floor(Date.now() / 1000),
      },
    };
    await AsyncStorage.setItem("vaults", JSON.stringify(newVaults));
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
    Share.share({ message: message, title: "Share via" });
  };

  const handleVaultFunds = async ({
    panicAddr,
    lockBlocks,
  }: {
    panicAddr: string;
    lockBlocks: number;
  }) => {
    const masterNode = fromMnemonic(mnemonic).masterNode;
    const internal = fromMnemonic(mnemonic).internal;
    if (!discovery) throw new Error(`discovery not instantiated yet!`);
    const nextInternalAddress = new Output({
      descriptor: internal,
      index: discovery.getNextIndex({ descriptor: internal }),
      network,
    }).getAddress();
    const vault = createVault({
      nextInternalAddress,
      panicAddr,
      lockBlocks,
      masterNode,
      utxos,
      balance,
      discovery,
      network,
    });
    await discovery.getExplorer().push(vault.vaultTxHex);
    const newVaults = { ...vaults, [vault.vaultAddress]: vault };
    await AsyncStorage.setItem("vaults", JSON.stringify(newVaults));
    setVaults(newVaults);
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
                checkingBalance ? "Refreshing Balance…" : "Refresh Balance"
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
              title="Vault Funds"
              onPress={() => setIsVaultSetUp(true)}
            />
          )}
          {mnemonic && balance !== null && (
            <Text style={styles.hotBalance}>
              Hot Balance: {balance} sats{checkingBalance && " ⏳"}
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
                    {checkingBalance && " ⏳"}
                  </Text>
                  {vault.triggerTime ? (
                    <Text>
                      Triggered On:{" "}
                      {new Date(vault.triggerTime * 1000).toLocaleString()}
                    </Text>
                  ) : (
                    <Text>
                      Locked On:{" "}
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
                          title="Unvault"
                          onPress={() => handleUnvault(vault)}
                        />
                        <Button
                          title="Panic!"
                          onPress={() => handlePanic(vault)}
                        />
                      </>
                    ) : (
                      <Button
                        title="Trigger Unvault"
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
          <View style={styles.modal}>
            <QRCode value={receiveAddress || undefined} />
            <Text
              style={styles.addressText}
              onPress={() => {
                if (!receiveAddress) throw new Error(`Invalid receiveAddress`);
                Clipboard.setStringAsync(receiveAddress);
                Alert.alert("Address copied to clipboard");
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
                lockBlocks,
              }: {
                panicAddr: string;
                lockBlocks: number;
              }) => {
                setDefPanicAddr(panicAddr);
                setDefLockBlocks(String(lockBlocks));
              }}
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
                panicAddr,
                lockBlocks,
              }: {
                panicAddr: string;
                lockBlocks: number;
              }) => {
                setIsVaultSetUp(false);
                await handleVaultFunds({ panicAddr, lockBlocks });
              }}
              onCancel={() => setIsVaultSetUp(false)}
            />
          </View>
        </Modal>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
