//TODO: I believe the one below is ok, but double check
//  check discovery.getUtxos. What happens if when computing the utxos i have
//  competing txs in the mempool? getUtxos may be broken!!!
//    Worse than that, what happens if I have chains of txs with different
//    spending txs in different paths?
//    -> Sort the candidate sopending txs by feeRate I guess?
//    Or just randomly discard one. who cares, but don't produce an error!!!
//
//
//
//  TODO: Now -> Focus on the Panic, The Unvault should be optional (for when
//  using fixed Panic Addresses - or for those which we don't have an xpub)
//
//
//
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
//  -> Same for btcUsd
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
const GAP_LIMIT = 3;
const MIN_FEE_RATE = 1;
const DEFAULT_MAX_FEE_RATE = 5000;
const MIN_LOCK_BLOCKS = 1; //TODO: Pass this from parent
const MAX_LOCK_BLOCKS = 30 * 24 * 6; //TODO: Pass this from parent
const SAMPLES = 10;
const FEE_RATE_CEILING = 1000; //22-dec-2017 fee rates
const DEFAULT_PANIC_ADDR = 'tb1qm0k9mn48uqfs2w9gssvzmus4j8srrx5eje7wpf';
import {
  createVault,
  Vault,
  esploraUrl,
  remainingBlocks,
  retrievePresignedSpendingTx
} from './vaults';
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

const maxFeeRate = memoize((feeEstimates: null | Record<string, number>) => {
  if (feeEstimates) {
    const feeRate = Math.max(...Object.values(feeEstimates));
    //Never return a value === 1 because 1 is also the minFeeRate and
    //the EditableSlider won't be able to set a new value
    return Math.max(feeRate * 1.2, 2);
  } else return DEFAULT_MAX_FEE_RATE;
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
  } else {
    return DEFAULT_MAX_FEE_RATE;
  }
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

const utxosData = memoize(
  (utxos: Array<string>, discovery: DiscoveryInstance) => {
    return utxos.map(utxo => {
      const [txId, strVout] = utxo.split(':');
      const vout = Number(strVout);
      if (!txId || isNaN(vout) || !Number.isInteger(vout) || vout < 0)
        throw new Error(`Invalid utxo ${utxo}`);
      const indexedDescriptor = discovery.getDescriptor({ utxo });
      if (!indexedDescriptor) throw new Error(`Unmatched ${utxo}`);
      const txHex = discovery.getTxHex({ txId });
      return { indexedDescriptor, txHex, vout };
    });
  }
);

/**
 * Computes the tx Size for the vault tx for a set of utxos
 * It returns the same result if {utxos} does not change.
 *
 * It will compute a very small vault with 2 samples per tx
 *
 * If vaultTxSize does not return a value, then this means that
 * it is not possible to create a general vault with these utxos.
 */
const vaultTxSize = memoize(
  ({ mnemonic, panicAddress, utxos, balance, discovery }) => {
    if (!discovery) throw new Error(`discovery not instantiated yet!`);
    const masterNode = fromMnemonic(mnemonic).masterNode;
    const descriptor = fromMnemonic(mnemonic).internal;
    const index = discovery.getNextIndex({ descriptor });
    const internalIndexedDescriptor = { descriptor, index };
    if (utxos === null || !utxos.length) throw new Error(`utxos unset`);
    if (balance === null || balance <= 0) throw new Error(`balance unset`);
    //Crete mockup vault:
    const vault = createVault({
      samples: 2,
      feeRate: 1,
      feeRateCeiling: 1,
      internalIndexedDescriptor,
      panicAddress,
      lockBlocks: 1,
      masterNode,
      utxosData: utxosData(utxos, discovery),
      balance,
      network
    });
    if (vault === undefined) return;
    return Transaction.fromHex(vault.vaultTxHex).virtualSize();
  },
  // Custom resolver that uses the utxos object reference as the cache key
  ({ utxos }) => utxos
);

const formatFeeRate = ({
  feeRate,
  txSize,
  btcUsd,
  feeEstimates
}: {
  feeRate: number;
  txSize: number;
  btcUsd: number | null;
  feeEstimates: Record<string, number> | null;
}) => {
  let strBtcUsd = `Waiting for BTC/USD rates...`;
  let strTime = `Waiting for fee estimates...`;
  if (btcUsd !== null)
    strBtcUsd = `Fee: $${((feeRate * txSize * btcUsd) / 1e8).toFixed(2)}`;
  if (feeEstimates && Object.keys(feeEstimates).length) {
    // Convert the feeEstimates object keys to numbers and sort them
    const sortedEstimates = Object.keys(feeEstimates)
      .map(Number)
      .sort((a, b) => feeEstimates[a]! - feeEstimates[b]!);

    //Find confirmation target with closest higher fee rate than given feeRate
    const target = sortedEstimates.find(
      estimate => feeEstimates[estimate]! >= feeRate
    );

    if (target !== undefined) strTime = `Confirms in ${blocksToTime(target)}`;
    // If the provided fee rate is lower than any estimate,
    // it's not possible to estimate the time
    else strTime = `Express confirmation`;
  }
  return `${strBtcUsd} / ${strTime}`;
};

const blocksToTime = (blocks: number): string => {
  const averageBlockTimeInMinutes = 10;

  const timeInMinutes = blocks * averageBlockTimeInMinutes;
  let timeEstimate = '';

  if (timeInMinutes < 60) {
    timeEstimate = `~${timeInMinutes} min${timeInMinutes > 1 ? 's' : ''}`;
  } else if (timeInMinutes < 1440) {
    // Less than a day
    const timeInHours = (timeInMinutes / 60).toFixed(1);
    timeEstimate = `~${timeInHours} hour${timeInHours === '1.0' ? '' : 's'}`;
  } else {
    const timeInDays = (timeInMinutes / 1440).toFixed(1);
    timeEstimate = `~${timeInDays} day${timeInDays === '1.0' ? '' : 's'}`;
  }
  return timeEstimate;
};

const formatLockTime = (blocks: number): string => {
  return `Estimated lock time: ${blocksToTime(blocks)}`;
};

export default function App() {
  const [isSettingsVisible, setIsSettingsVisible] = useState(false);
  const [isVaultSetUp, setIsVaultSetUp] = useState(false);
  const [vaultTriggerSetup, setVaultTriggerSetUp] = useState<Vault | null>(
    null
  );
  const [receiveAddress, setReceiveAddress] = useState<string | null>(null);
  const [mnemonic, setMnemonic] = useState<string | null>(null);
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
    const url = esploraUrl(network);
    const explorer = new EsploraExplorer({ url });
    const { Discovery } = DiscoveryFactory(explorer, network);
    await explorer.connect();
    const discovery = new Discovery();
    const vaults = JSON.parse((await AsyncStorage.getItem('vaults')) || '{}');

    setIsSettingsVisible(false);
    setIsVaultSetUp(false);
    setVaultTriggerSetUp(null);
    setReceiveAddress(null);
    setMnemonic(mnemonic || null);
    setDiscovery(discovery);
    setUtxos(null);
    setBalance(null);
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

    try {
      //TODO: This must be refreshed every 10 minutes of what???
      const btcUsd = await getBTCUSD();
      setBtcUsd(btcUsd);
    } catch (err) {}
  };

  //TODO: Move this one outside this React component. pass params:
  //mnemonic, utxos, balance, panicAddress, discovery
  /**
   * Given a feeRate, it computes a mockup vault, and extracts and formats the
   * total fee and confirmation time.
   * A mockup vault is a very small vault of 2 samples. It is small so that it
   * can be computed very quickly. Then, it is used to obtain the size of the
   * vaultTx, for the current utxos.
   */
  const formatVaultFeeRate = (feeRate: number) => {
    const txSize = vaultTxSize({
      mnemonic,
      panicAddress: DEFAULT_PANIC_ADDR,
      utxos,
      balance,
      discovery
    });
    if (txSize === undefined) throw new Error(`Could not create mockup vault`);
    return formatFeeRate({ feeRate, txSize, btcUsd, feeEstimates });
  };

  const formatTriggerFeeRate = (feeRate: number, vault: Vault) => {
    if (!vaultTriggerSetup) throw new Error('Trigger Vault unavailable');
    const { feeRate: finalFeeRate } = findClosestTriggerFeeRate(feeRate, vault);
    const triggerTxHex = Object.keys(vault.triggerMap)[0];
    if (!triggerTxHex) throw new Error('Unavailable trigger txs');
    const txSize = Transaction.fromHex(triggerTxHex).virtualSize();
    const formattedFeeRate = formatFeeRate({
      feeRate: finalFeeRate,
      txSize,
      btcUsd,
      feeEstimates
    });
    return `Final Fee Rate: ${finalFeeRate.toFixed(2)} sats/vbyte
${formattedFeeRate}`;
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
  //Cache vaultTxSizes for current utxos so that subsequent calls to
  //formatVaultFeeRate are quick. This is just for improving the UX:
  useEffect(() => {
    if (utxos?.length && balance)
      try {
        //Note that current utxos may have very little balance which make it
        //impossible to compute the vaultTxSizes. We will test formatVaultFeeRate(1)
        //again before opening VaultSettings just in case
        formatVaultFeeRate(1);
      } catch (err) {}
  }, [utxos, balance]);

  const handleCreateWallet = async () => {
    const mnemonic = generateMnemonic();
    await AsyncStorage.setItem('mnemonic', mnemonic);
    setMnemonic(mnemonic);
  };

  const handleCheckBalance = async () => {
    if (!checkingBalance) {
      setCheckingBalance(true);
      const descriptors = [
        fromMnemonic(mnemonic).external,
        fromMnemonic(mnemonic).internal
      ];
      if (!discovery) throw new Error(`discovery not instantiated yet!`);
      const blockHeight = await discovery.getExplorer().fetchBlockHeight();
      if (!blockHeight) throw new Error(`Could not bet tip block height`);
      //if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
      await discovery.fetch({ descriptors, gapLimit: GAP_LIMIT });
      const { utxos: newUtxos, balance: newBalance } =
        discovery.getUtxosAndBalance({ descriptors });
      if (utxos !== newUtxos) setUtxos(newUtxos.length ? newUtxos : null);
      if (balance !== newBalance)
        setBalance(newUtxos.length ? newBalance : null);

      if (vaults) {
        let newVaults = vaults;
        for (const vault of Object.values(vaults)) {
          let newVault = vault;
          const triggerTxData = await retrievePresignedSpendingTx(
            vault.vaultAddress,
            Object.keys(vault.triggerMap),
            vault.txMap,
            discovery
          );
          if (!triggerTxData && vault.triggerTxHex) {
            newVault = { ...newVault };
            delete newVault.triggerTxHex;
          }
          if (triggerTxData) {
            if (!triggerTxData.txHex)
              throw new Error('Unavailable hex trigger data');
            if (newVault.triggerTxHex !== triggerTxData.txHex) {
              newVault = { ...newVault, triggerTxHex: triggerTxData.txHex };
            }
            const remainingBlocks =
              vault.lockBlocks - (blockHeight - triggerTxData.blockHeight) - 1; //-1 for the next mined block
            if (remainingBlocks !== newVault.remainingBlocks)
              newVault = { ...newVault, remainingBlocks };
            const unlockingTxs = vault.triggerMap[triggerTxData.txHex];
            if (!unlockingTxs) throw new Error('Invalid triggerMap');
            const unlockingTxData = await retrievePresignedSpendingTx(
              vault.triggerAddress,
              [...unlockingTxs.unvault, ...unlockingTxs.panic],
              vault.txMap,
              discovery
            );
            if (unlockingTxData) {
              if (!unlockingTxData.txHex)
                throw new Error('Unavailable Hex data in unlockingTxData');
              const isUnvault = unlockingTxs.unvault.some(
                unvaultTxHex => unvaultTxHex === unlockingTxData.txHex
              );
              if (isUnvault) {
                if (newVault.unvaultTxHex !== unlockingTxData.txHex)
                  newVault = {
                    ...newVault,
                    unvaultTxHex: unlockingTxData.txHex
                  };
              } else {
                if (newVault.panicTxHex !== unlockingTxData.txHex)
                  newVault = {
                    ...newVault,
                    panicTxHex: unlockingTxData.txHex
                  };
              }
            } else {
              if (newVault.unvaultTxHex) {
                newVault = { ...newVault };
                delete newVault.unvaultTxHex;
              }
              if (newVault.panicTxHex) {
                newVault = { ...newVault };
                delete newVault.panicTxHex;
              }
            }
          }
          if (newVaults[newVault.vaultAddress] !== newVault) {
            newVaults = { ...newVaults, [newVault.vaultAddress]: newVault };
          }
        }
        if (newVaults !== vaults) {
          await AsyncStorage.setItem('vaults', JSON.stringify(newVaults));
          setVaults(newVaults);
        }
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

  //TODO: Must review this one too
  const handleUnvault = async (vault: Vault) => {
    if (!discovery) throw new Error(`discovery not instantiated yet!`);
    try {
      // If successful:
      const newVaults = { ...vaults };
      delete newVaults[vault.vaultAddress];
      await AsyncStorage.setItem('vaults', JSON.stringify(newVaults));
      //TODO: check this push result. This and all pushes in code
      //TODO: Here make SURE that this has been safely stored
      //TODO: Also make the user backp it up. Maybe even back up to thunderDen
      if (!vault.unvaultTxHex) throw new Error('Cannot unvault');
      await discovery.getExplorer().push(vault.unvaultTxHex);
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
      `Funds have been sent to the safe address: ${vault.panicAddress}.`
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
    if (!vaultTriggerSetup) throw new Error('Vault not set');
    const { txHex } = findClosestTriggerFeeRate(feeRate, vault);
    setVaultTriggerSetUp(null);

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
    feeRate,
    lockBlocks
  }: {
    feeRate: number;
    lockBlocks?: number;
  }) => {
    if (lockBlocks === undefined) throw new Error('lockBlocks not retrieved');
    setIsVaultSetUp(false);

    if (!discovery) throw new Error(`discovery not instantiated yet!`);
    const masterNode = fromMnemonic(mnemonic).masterNode;
    const descriptor = fromMnemonic(mnemonic).internal;
    const index = discovery.getNextIndex({ descriptor });
    const internalIndexedDescriptor = { descriptor, index };
    if (utxos === null || !utxos.length) throw new Error(`utxos unset`);
    if (balance === null || balance <= 0) throw new Error(`balance unset`);
    const vault = createVault({
      samples: SAMPLES,
      feeRate,
      feeRateCeiling: FEE_RATE_CEILING,
      internalIndexedDescriptor,
      panicAddress: DEFAULT_PANIC_ADDR,
      lockBlocks,
      masterNode,
      utxosData: utxosData(utxos, discovery),
      balance,
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
              title="Vault Hot Balance"
              onPress={() => {
                try {
                  //Make sure it is possible to create a mockup vault. That is
                  //a small vault in order to compute the txSize of the 1st tx.
                  //This is needed to compute the feeRate of the 1st tx.
                  formatVaultFeeRate(1);
                  setIsVaultSetUp(true);
                } catch (err) {
                  //TODO: here we know it is not possible to create a mockup
                  //Vault. not enough balance even for this small vault.
                  //just stop and warn the user.
                  console.warn(
                    'TODO: Implement this! Here we know it is not possible to create a mockup Vault. not enough balance even for this small vault. just stop and warn the user.'
                  );
                }
              }}
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
              {
                /*TODO - ordering not deterministic, sort my vaultPushTime
                 *
                 * TODO: Remove all thre ! below!!!!
                 * Also do not use triggerPushTime or other push time to select!
                 *
                 * */ Object.entries(vaults).map(
                  ([vaultAddress, vault], index) => (
                    <View key={vaultAddress} style={styles.vaultContainer}>
                      <Text>
                        {`Vault ${index + 1} · ${
                          vault.triggerTxHex
                            ? vault.balance -
                              vault.txMap[vault.vaultTxHex]!.fee -
                              vault.txMap[vault.triggerTxHex]!.fee
                            : vault.balance - vault.txMap[vault.vaultTxHex]!.fee
                        } sats`}
                        {checkingBalance && ' ⏳'}
                      </Text>
                      {vault.triggerTxHex ? (
                        <Text>
                          Triggered On:{' '}
                          {new Date(
                            vault.triggerPushTime! * 1000
                          ).toLocaleString()}
                        </Text>
                      ) : (
                        <Text>
                          Locked On:{' '}
                          {new Date(
                            vault.vaultPushTime! * 1000
                          ).toLocaleString()}
                        </Text>
                      )}
                      <Text>
                        {vault.triggerTxHex
                          ? vault.remainingBlocks <= 0
                            ? `Ready to Unvault 🟢🔓`
                            : `Unlocking In: ${vault.remainingBlocks} blocks 🔒⏱️`
                          : `Time Lock Set: ${vault.lockBlocks} blocks 🔒`}
                      </Text>

                      <View style={styles.buttonGroup}>
                        {vault.triggerPushTime! ? (
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
                            onPress={() => {
                              setVaultTriggerSetUp(vault);
                            }}
                          />
                        )}
                        <Button
                          title="Delegate"
                          onPress={() => handleDelegate(vault)}
                        />
                      </View>
                    </View>
                  )
                )
              }
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
        <Modal visible={isVaultSetUp} animationType="slide">
          <View style={[styles.modal, { padding: 40 }]}>
            <Text style={styles.title}>Vault Set Up</Text>
            <VaultSettings
              minFeeRate={MIN_FEE_RATE}
              maxFeeRate={maxFeeRate(feeEstimates)}
              minLockBlocks={MIN_LOCK_BLOCKS}
              maxLockBlocks={MAX_LOCK_BLOCKS}
              network={network}
              onNewValues={handleVault}
              onCancel={() => setIsVaultSetUp(false)}
              formatFeeRate={formatVaultFeeRate}
              formatLockTime={formatLockTime}
            />
          </View>
        </Modal>
        <Modal visible={!!vaultTriggerSetup} animationType="slide">
          <View style={[styles.modal, { padding: 40 }]}>
            <Text style={styles.title}>Trigger Unvault</Text>
            <VaultSettings
              minFeeRate={MIN_FEE_RATE}
              maxFeeRate={Math.min(
                maxTriggerFeeRate(vaultTriggerSetup),
                maxFeeRate(feeEstimates)
              )}
              network={network}
              onNewValues={async ({ feeRate }: { feeRate: number }) => {
                if (!vaultTriggerSetup) throw new Error('Vault unset');
                await handleTriggerUnvault({
                  feeRate,
                  vault: vaultTriggerSetup
                });
              }}
              onCancel={() => setVaultTriggerSetUp(null)}
              formatFeeRate={(feeRate: number) => {
                if (!vaultTriggerSetup)
                  throw new Error('Trigger Vault unavailable');
                return formatTriggerFeeRate(feeRate, vaultTriggerSetup);
              }}
            />
          </View>
        </Modal>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
