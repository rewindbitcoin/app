import { Network, Psbt, address, networks } from 'bitcoinjs-lib';
import * as secp256k1 from '@bitcoinerlab/secp256k1';
import * as descriptors from '@bitcoinerlab/descriptors';
const { Output, ECPair } = descriptors.DescriptorsFactory(secp256k1);

import { compilePolicy } from '@bitcoinerlab/miniscript';
const { encode: olderEncode } = require('bip68');
import { signBIP32, signECPair } from '@bitcoinerlab/descriptors/dist/signers';
import type { BIP32Interface } from 'bip32';

import { feeRateSampling } from './fees';
import type { DiscoveryInstance } from '@bitcoinerlab/discovery';
import type { TxData } from '@bitcoinerlab/discovery/dist/types';

export type Vault = {
  /** the initial balance */
  balance: number;

  vaultAddress: string;
  triggerAddress: string;
  panicAddress: string;
  unvaultAddress: string;

  vaultTxHex: string;

  /** Use it to mark last time it was pushed */
  vaultPushTime?: number;
  triggerPushTime?: number;
  panicPushTime?: number;
  unvaultPushTime?: number;

  /** These are candidate txs. Everytime balance are refetched they should be
   * re-checked */
  triggerTxHex?: string;
  unvaultTxHex?: string;
  panicTxHex?: string;

  feeRateCeiling: number;
  lockBlocks: number;

  remainingBlocks: number; //TODO: do not use this one. This is just the last guessed value saved as cache. Can change.

  txMap: TxMap;
  triggerMap: TriggerMap;

  /** Assuming a scenario of extreme fees (feeRateCeiling), what will be the
   * remaining balance after panicking */
  minPanicBalance: number;
};
type TxHex = string;
type TxMap = Record<TxHex, { txId: string; fee: number; feeRate: number }>;
// Define TxHex as a type alias for string, representing transaction hex strings.
// Define a structure for holding different TxHex for "panic" and "unvault" situations.
type UnlockingTxs = {
  panic: Array<TxHex>;
  unvault: Array<TxHex>;
};
// Define the main type for the vault, which maps a fee rate to the corresponding resulting transactions.
type TriggerMap = Record<TxHex, UnlockingTxs>;

type IndexedDescriptor = { descriptor: string; index?: number };

export function createVault({
  samples,
  feeRate,
  feeRateCeiling,
  internalIndexedDescriptor,
  panicAddress,
  lockBlocks,
  masterNode,
  network,
  utxosData,
  balance
}: {
  /* How many txs to compute. Note that the final number of tx is samples^2*/
  samples: number;
  feeRate: number;
  /** This is the largest fee rate for which at least one trigger and panic txs
   * must be pre-computed*/
  feeRateCeiling: number;
  internalIndexedDescriptor: IndexedDescriptor;
  panicAddress: string;
  lockBlocks: number;
  masterNode: BIP32Interface;
  network: Network;
  utxosData: Array<{
    indexedDescriptor: IndexedDescriptor;
    vout: number;
    txHex: string;
  }>;
  balance: number;
}): Vault | undefined {
  let minPanicBalance = balance;
  const maxSatsPerByte = feeRateCeiling;
  const feeRates = feeRateSampling({ samples, maxSatsPerByte });
  if (
    feeRates.length !== samples ||
    maxSatsPerByte !== feeRateCeiling ||
    maxSatsPerByte !== feeRates.slice(-1)[0]
  )
    throw new Error(`feeRate sampling failed`);
  const txMap: TxMap = {};
  const triggerMap: TriggerMap = {};

  const panicOutput = new Output({
    descriptor: `addr(${panicAddress})`,
    network
  });
  const internalOutput = new Output({ ...internalIndexedDescriptor, network });
  const unvaultAddress = internalOutput.getAddress();

  ////////////////////////////////
  //Prepare the Vault Tx:
  ////////////////////////////////

  const psbtVault = new Psbt({ network });
  //Add the inputs to psbtVault:
  const vaultFinalizers = [];
  for (const utxoData of utxosData) {
    const { indexedDescriptor, vout, txHex } = utxoData;
    const output = new Output({ ...indexedDescriptor, network });
    // Add the utxo as input of psbtVault:
    const inputFinalizer = output.updatePsbtAsInput({
      psbt: psbtVault,
      txHex,
      vout
    });
    vaultFinalizers.push(inputFinalizer);
  }

  //Prepare the output:
  const vaultPair = ECPair.makeRandom();
  const vaultOutput = new Output({
    descriptor: `wpkh(${vaultPair.publicKey.toString('hex')})`,
    network
  });

  //Proceed assuming zero fees:
  const psbtVaultZeroFee = psbtVault.clone();
  //Add the output to psbtVault assuming zero fees value = balance:
  if (!utxosData.length || balance <= 0)
    throw new Error(`Invalid utxos or balance`);
  vaultOutput.updatePsbtAsOutput({ psbt: psbtVaultZeroFee, value: balance });
  //Sign
  signBIP32({ psbt: psbtVaultZeroFee, masterNode });
  //Finalize
  vaultFinalizers.forEach(finalizer => finalizer({ psbt: psbtVaultZeroFee }));
  //Compute the correct output value for feeRate
  const vSizeVault = psbtVaultZeroFee.extractTransaction().virtualSize();
  //The vsize for a tx with different fees may slightly vary because of the
  //signature. Let's assume a slightly larger tx size (+1 vbyte).
  const feeVault = Math.ceil((vSizeVault + 1) * feeRate);
  //Not enough funds to create a vault tx with feeRate: ${feeRate} sats/vbyte
  if (feeVault > balance) return;
  const vaultBalance = balance - feeVault;

  //Add the output to psbtVault assuming feeRate:
  vaultOutput.updatePsbtAsOutput({ psbt: psbtVault, value: vaultBalance });
  //Sign
  signBIP32({ psbt: psbtVault, masterNode });
  //Finalize
  vaultFinalizers.forEach(finalizer => finalizer({ psbt: psbtVault }));

  ////////////////////////////////
  //Prepare the Trigger Unvault Tx
  ////////////////////////////////

  const panicPair = ECPair.makeRandom();
  const panicPubKey = panicPair.publicKey;
  const unvaultPair = ECPair.makeRandom();
  const unvaultPubKey = unvaultPair.publicKey;

  //TODO: The Policy should not be here
  //Prepare the output...
  const POLICY = (older: number) =>
    `or(pk(@panicKey),99@and(pk(@unvaultKey),older(${older})))`;
  const older = olderEncode({ blocks: lockBlocks });
  const { miniscript, issane } = compilePolicy(POLICY(older));
  if (!issane) throw new Error('Policy not sane');

  const triggerDescriptor = `wsh(${miniscript
    .replace('@unvaultKey', unvaultPubKey.toString('hex'))
    .replace('@panicKey', panicPubKey.toString('hex'))})`;

  const triggerOutput = new Output({
    descriptor: triggerDescriptor,
    network
  });
  const triggerOutputPanicPath = new Output({
    descriptor: triggerDescriptor,
    network,
    signersPubKeys: [panicPubKey]
  });
  const triggerOutputUnvaultPath = new Output({
    descriptor: triggerDescriptor,
    signersPubKeys: [unvaultPubKey],
    network
  });
  const psbtTriggerBase = new Psbt({ network });
  const txVault = psbtVault.extractTransaction();
  const vaultTxHex = txVault.toHex();
  txMap[vaultTxHex] = {
    fee: feeVault,
    feeRate: feeVault / vSizeVault,
    txId: txVault.getId()
  };
  //Add the input (vaultOutput) to psbtTrigger as input:
  const triggerInputFinalizer = vaultOutput.updatePsbtAsInput({
    psbt: psbtTriggerBase,
    txHex: vaultTxHex,
    vout: 0
  });
  let vSizeTrigger;
  const feeTriggerArray: Array<number> = [];
  // Get the vSize from a tx, assuming 0 fees:
  for (const feeRateTrigger of [0, ...feeRates]) {
    //The vsize for a tx with different fees may slightly vary because of the
    //signature. Let's assume a slightly larger tx size (+1 vbyte).
    const feeTrigger = vSizeTrigger
      ? Math.ceil((vSizeTrigger + 1) * feeRateTrigger)
      : 0;
    //Not enough funds to create at least 1 trigger tx with feeRate: ${maxSatsPerByte} sats/vbyte`
    if (feeTrigger > vaultBalance && feeRateTrigger === maxSatsPerByte) return;
    if (
      feeTrigger <= vaultBalance &&
      // don't process twice same fee:
      !feeTriggerArray.some(fee => fee === feeTrigger)
    ) {
      feeTriggerArray.push(feeTrigger);
      //Add the output to psbtTrigger:
      const psbtTrigger = psbtTriggerBase.clone();
      triggerOutput.updatePsbtAsOutput({
        psbt: psbtTrigger,
        value: vaultBalance - feeTrigger
      });
      //Sign
      signECPair({ psbt: psbtTrigger, ecpair: vaultPair });
      //Finalize
      triggerInputFinalizer({ psbt: psbtTrigger, validate: !feeTrigger });
      //Take the vsize for a tx with 0 fees.
      const txTrigger = psbtTrigger.extractTransaction();
      vSizeTrigger = txTrigger.virtualSize();
      const triggerTxHex = txTrigger.toHex();
      if (feeTrigger) {
        txMap[triggerTxHex] = {
          fee: feeTrigger,
          feeRate: feeTrigger / vSizeTrigger,
          txId: txTrigger.getId()
        };
        const resultingTxs = (triggerMap[triggerTxHex] = {
          panic: [] as Array<TxHex>,
          unvault: [] as Array<TxHex>
        });
        const triggerBalance = vaultBalance - feeTrigger;

        //////////////////////
        //Prepare the Panic Tx
        //////////////////////

        const psbtPanicBase = new Psbt({ network });
        //Add the input to psbtPanicBase:
        const panicInputFinalizer = triggerOutputPanicPath.updatePsbtAsInput({
          psbt: psbtPanicBase,
          txHex: triggerTxHex,
          vout: 0
        });
        let vSizePanic;
        const feePanicArray: Array<number> = [];
        for (const feeRatePanic of [0, ...feeRates]) {
          const feePanic = vSizePanic
            ? Math.ceil((vSizePanic + 1) * feeRatePanic)
            : 0;

          //Not enough funds to create at least 1 panic tx with feeRate: ${maxSatsPerByte} sats/vbyte
          if (feePanic > triggerBalance && feeRatePanic === maxSatsPerByte)
            return;
          //Add the output to psbtPanic:
          if (
            feePanic <= triggerBalance &&
            // don't process twice same fee:
            !feePanicArray.some(fee => fee === feePanic)
          ) {
            const panicBalance = triggerBalance - feePanic;
            if (panicBalance < minPanicBalance) minPanicBalance = panicBalance;
            feePanicArray.push(feePanic);
            const psbtPanic = psbtPanicBase.clone();
            panicOutput.updatePsbtAsOutput({
              psbt: psbtPanic,
              value: triggerBalance - feePanic
            });
            //Sign
            signECPair({ psbt: psbtPanic, ecpair: panicPair });
            //Finalize
            panicInputFinalizer({ psbt: psbtPanic, validate: !feePanic });
            //Take the vsize for a tx with 0 fees.
            const txPanic = psbtPanic.extractTransaction();
            vSizePanic = txPanic.virtualSize();
            if (feePanic) {
              const panicTxHex = txPanic.toHex();
              txMap[panicTxHex] = {
                fee: feePanic,
                feeRate: feePanic / vSizePanic,
                txId: txPanic.getId()
              };
              resultingTxs.panic.push(panicTxHex);
            }
          }
        }

        ////////////////////////
        //Prepare the Unvault Tx
        ////////////////////////

        const psbtUnvaultBase = new Psbt({ network });
        //Add the input to psbtUnvault:
        const unvaultInputFinalizer =
          triggerOutputUnvaultPath.updatePsbtAsInput({
            psbt: psbtUnvaultBase,
            txHex: triggerTxHex,
            vout: 0
          });
        let vSizeUnvault;
        const feeUnvaultArray: Array<number> = [];
        for (const feeRateUnvault of [0, ...feeRates]) {
          const feeUnvault = vSizeUnvault
            ? Math.ceil((vSizeUnvault + 1) * feeRateUnvault)
            : 0;
          //Not enough funds to create at least 1 unvault tx with feeRate: ${maxSatsPerByte} sats/vbyte
          if (feeUnvault > triggerBalance && feeRateUnvault === maxSatsPerByte)
            return;
          //Add the output to psbtUnvault:
          if (
            feeUnvault <= triggerBalance &&
            // don't process twice same fee:
            !feeUnvaultArray.some(fee => fee === feeUnvault)
          ) {
            feeUnvaultArray.push(feeUnvault);
            const psbtUnvault = psbtUnvaultBase.clone();
            internalOutput.updatePsbtAsOutput({
              psbt: psbtUnvault,
              value: triggerBalance - feeUnvault
            });
            //Sign
            signECPair({ psbt: psbtUnvault, ecpair: unvaultPair });
            //Finalize
            unvaultInputFinalizer({ psbt: psbtUnvault, validate: !feeUnvault });
            //Take the vsize for a tx with 0 fees.
            const txUnvault = psbtUnvault.extractTransaction();
            vSizeUnvault = txUnvault.virtualSize();
            if (feeUnvault) {
              const unvaultTxHex = txUnvault.toHex();
              txMap[unvaultTxHex] = {
                fee: feeUnvault,
                feeRate: feeUnvault / vSizeUnvault,
                txId: txUnvault.getId()
              };
              resultingTxs.unvault.push(unvaultTxHex);
            }
          }
        }
      }
    }
  }

  const vaultAddress = vaultOutput.getAddress();
  const triggerAddress = triggerOutput.getAddress();

  //Double check everything went smooth. This should never throw.
  for (const unlockingTxs of Object.values(triggerMap))
    if (unlockingTxs.panic.length === 0 || unlockingTxs.unvault.length === 0)
      throw new Error(`Some spending paths have no solutions.`);

  return {
    balance,
    minPanicBalance,
    feeRateCeiling,
    vaultAddress,
    triggerAddress,
    unvaultAddress,
    vaultTxHex,
    panicAddress,
    lockBlocks,
    remainingBlocks: lockBlocks,
    txMap,
    triggerMap
  };
}

export function esploraUrl(network: Network) {
  const url =
    network === networks.testnet
      ? 'https://blockstream.info/testnet/api/'
      : network === networks.bitcoin
      ? 'https://blockstream.info/api/'
      : null;
  if (!url) throw new Error(`Esplora API not available for this network`);
  return url;
}

//TODO: probably this function is not being used - remove
export async function remainingBlocks(
  vault: Vault,
  discovery: DiscoveryInstance
) {
  const descriptor = `addr(${vault.triggerAddress})`;
  await discovery.fetch({ descriptor });
  const history = discovery.getHistory({ descriptor });
  if (!history[0]) return vault.lockBlocks;
  const triggerBlockHeight = history[0].blockHeight;
  if (!triggerBlockHeight) return vault.lockBlocks;
  const blockHeight = await discovery.getExplorer().fetchBlockHeight();
  if (!blockHeight) throw new Error(`Could not bet tip block height`);
  else return vault.lockBlocks - (blockHeight - triggerBlockHeight) - 1; //-1 for the next mined block
}

export function validateAddress(addressValue: string, network: Network) {
  try {
    address.toOutputScript(addressValue, network);
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * This function identifies the transaction from a set of presigned spending transactions
 * that has spent funds from a specified address or is pending in the mempool to do so.
 *
 * Constraints:
 * - Only one transaction from the set is allowed to spend from the address. If multiple
 *   confirmed transactions are found to have spent from the address, an exception is thrown.
 * - Presigned transactions imply that only one should exist for spending from the address.
 *
 * Purpose:
 * The function serves as a safeguard against potential attacks where an adversary might
 * send funds to the vault's address with the intent to confuse the transaction management
 * system.
 *
 * @param address - The address from which funds may have been spent.
 * @param spendingTxs - An array of candidate presigned spending transaction identifiers.
 * @param txMap - A mapping of transaction hex strings to their respective transaction data.
 * @param discovery - An instance of the Discovery module used to fetch transaction history.
 * @returns A promise that resolves to either undefined (if no transaction is found) or
 *          to an object of TxData type containing transaction details such as hex string,
 *          block height, and irreversibility status. Reference: https://bitcoinerlab.com/modules/discovery/api/types/_Internal_.TxData.html
 *
 * @throws Error if multiple presigned transactions are confirmed to have spent from the address,
 *         if the transaction history cannot be fetched, or if the transaction data is invalid.
 */
export async function retrievePresignedSpendingTx(
  address: string,
  /** the presigned spending txs candidates*/
  presignedSpendingTxs: Array<string>,
  txMap: TxMap,
  discovery: DiscoveryInstance
): Promise<undefined | TxData> {
  const descriptor = `addr(${address})`;
  await discovery.fetch({ descriptor });
  const historyTxDataMap = discovery.getHistory({ descriptor });
  const spendingTxDataMap = historyTxDataMap.filter(txData => {
    if (!txData.txHex) throw new Error('Unavailabe hex for fetched history');
    return presignedSpendingTxs.includes(txData.txHex);
  });
  /**
   * Sorts transactions primarily by their blockHeight in ascending order to prioritize
   * transactions with more confirmations towards the beginning of the array, indicating
   * a higher probability of being confirmed and irreversible. For transactions with
   * the same blockHeight, it sorts them by feeRate in descending order as a secondary
   * criterion, under the assumption that higher feeRate transactions are more likely
   * to be selected by miners and confirmed first.
   */
  const sortedSpendingTxDataMap = spendingTxDataMap.sort((a, b) => {
    //Init variables:
    const aBlockHeight = a.blockHeight;
    const bBlockHeight = b.blockHeight;
    if (!a.txHex || !b.txHex) throw new Error('Unavailable hex history data');
    if (!txMap[b.txHex] || !txMap[a.txHex]) throw new Error('Invalid txMap');
    const aRecord = txMap[a.txHex];
    const bRecord = txMap[b.txHex];
    if (!aRecord || !bRecord) throw new Error('Invalid txMap');
    const aFeeRate = aRecord.feeRate;
    const bFeeRate = bRecord.feeRate;
    const aTxId = aRecord.txId;
    const bTxId = bRecord.txId;

    //Perform filtering:
    if (aBlockHeight === bBlockHeight) {
      if (aBlockHeight !== 0) {
        throw new Error(
          `2 presigned txs spent from ${address} at blockHeight: ${aBlockHeight}, txIds: ${aTxId}, ${bTxId}`
        );
      } else {
        //If tied and unconfirmed, sort in descending feeRate
        return bFeeRate - aFeeRate;
      }
    } else if (aBlockHeight === 0) {
      return 1; // a is unmined and should be de-prioritized
    } else if (bBlockHeight === 0) {
      return -1; // b is unmined and should be de-prioritized
    } else {
      return aBlockHeight - bBlockHeight; // Otherwise, sort by ascending blockHeight
    }
  });
  return sortedSpendingTxDataMap[0];
}
