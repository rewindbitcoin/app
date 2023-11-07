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

export type Vault = {
  vaultAddress: string;
  triggerAddress: string;
  vaultTxHex: string;
  vaultBalance: number;
  triggerBalance: number;
  triggerTxHex: string;
  unvaultTxHex: string;
  panicTxHex: string;
  panicAddr: string;
  lockBlocks: number;
  remainingBlocks: number;
  vaultTime: number;
  triggerTime?: number;
  txMap: TxMap;
  triggerMap: TriggerMap;
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

export function createVault({
  samples,
  feeRate,
  feeRateCeiling,
  nextInternalAddress,
  panicAddr,
  lockBlocks,
  masterNode,
  network,
  utxosData,
  balance
}: {
  samples: number;
  feeRate: number;
  /** This is the largest fee rate for which at least one trigger and panic txs
   * must be pre-computed*/
  feeRateCeiling: number;
  nextInternalAddress: string;
  panicAddr: string;
  lockBlocks: number;
  masterNode: BIP32Interface;
  network: Network;
  utxosData: Array<{
    indexedDescriptor: { descriptor: string; index?: number };
    vout: number;
    txHex: string;
  }>;
  balance: number;
}): Vault {
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

  const panicOutput = new Output({ descriptor: `addr(${panicAddr})`, network });
  const nextInternalOutput = new Output({
    descriptor: `addr(${nextInternalAddress})`,
    network
  });

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
  vaultOutput.updatePsbtAsOutput({ psbt: psbtVaultZeroFee, value: balance });
  //Sign
  signBIP32({ psbt: psbtVaultZeroFee, masterNode });
  //Finalize
  vaultFinalizers.forEach(finalizer => finalizer({ psbt: psbtVaultZeroFee }));
  //Compute the correct output value for feeRate
  const vSizeVault = psbtVaultZeroFee.extractTransaction().virtualSize();
  const vaultBalance = balance - feeRate * vSizeVault;

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
  const vaultTxHex = psbtVault.extractTransaction().toHex();
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
    if (feeTrigger > vaultBalance && feeRateTrigger === maxSatsPerByte)
      throw new Error(
        `Not enough funds to create at least 1 trigger tx with feeRate: ${maxSatsPerByte} sats/vbyte`
      );
    if (
      feeTrigger <= vaultBalance &&
      !feeTriggerArray.some(f => f === feeTrigger)
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
          if (feePanic > triggerBalance && feeRatePanic === maxSatsPerByte)
            throw new Error(
              `Not enough funds to create at least 1 panic tx with feeRate: ${maxSatsPerByte} sats/vbyte`
            );
          //Add the output to psbtPanic:
          if (
            feePanic <= triggerBalance &&
            !feePanicArray.some(f => f === feePanic)
          ) {
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
          if (feeUnvault > triggerBalance && feeRateUnvault === maxSatsPerByte)
            throw new Error(
              `Not enough funds to create at least 1 unvault tx with feeRate: ${maxSatsPerByte} sats/vbyte`
            );
          //Add the output to psbtUnvault:
          if (
            feeUnvault <= triggerBalance &&
            !feeUnvaultArray.some(f => f === feeUnvault)
          ) {
            feeUnvaultArray.push(feeUnvault);
            const psbtUnvault = psbtUnvaultBase.clone();
            nextInternalOutput.updatePsbtAsOutput({
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

  const triggerTxHex = Object.keys(triggerMap)[0];
  if (!triggerTxHex) throw new Error(`Could not get triggerMap`);
  const panicTxHex = [...triggerMap[triggerTxHex]!.panic][0]!;
  const unvaultTxHex = [...triggerMap[triggerTxHex]!.unvault][0]!;

  const vaultAddress = vaultOutput.getAddress();
  const triggerAddress = triggerOutput.getAddress();
  const triggerBalance = vaultBalance - txMap[triggerTxHex]!.fee;

  //Double check everything went smooth
  for (const unlockingTxs of Object.values(triggerMap))
    if (unlockingTxs.panic.length === 0 || unlockingTxs.unvault.length === 0)
      throw new Error(`Some spending paths have no solutions. Skipping`);

  return {
    vaultAddress,
    triggerAddress,
    vaultTxHex,
    vaultBalance,
    triggerBalance,
    triggerTxHex,
    unvaultTxHex,
    panicTxHex,
    panicAddr,
    lockBlocks,
    remainingBlocks: lockBlocks,
    vaultTime: Math.floor(Date.now() / 1000),
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

export async function remainingBlocks(
  vault: Vault,
  discovery: DiscoveryInstance
) {
  const descriptor = `addr(${vault.triggerAddress})`;
  const history = discovery.getHistory({ descriptor });
  const triggerBlockHeight = history[0]?.blockHeight || 0;
  const blockHeight = await discovery.getExplorer().fetchBlockHeight();
  if (!blockHeight || !triggerBlockHeight) return vault.lockBlocks;
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
