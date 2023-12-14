// TODO: very imporant to only allow Vaulting funds with 1 confirmatin at least (make this a setting)
import {
  Network,
  Psbt,
  Transaction,
  address,
  crypto,
  networks
} from 'bitcoinjs-lib';
import memoize from 'lodash.memoize';
import * as secp256k1 from '@bitcoinerlab/secp256k1';
import {
  signers,
  DescriptorsFactory,
  OutputInstance
} from '@bitcoinerlab/descriptors';
const { Output, ECPair, parseKeyExpression } = DescriptorsFactory(secp256k1);
import {
  createVaultDescriptor,
  createTriggerDescriptor,
  createColdDescriptor,
  createServiceDescriptor,
  DUMMY_PUBKEY,
  DUMMY_PUBKEY_2
} from './vaultDescriptors';

import type { BIP32Interface } from 'bip32';

import { feeRateSampling } from './fees';
import type { DiscoveryInstance } from '@bitcoinerlab/discovery';
import { coinselect, vsize, dustThreshold } from '@bitcoinerlab/coinselect';

export type Vault = {
  //TODO: here add the network too
  /** the initial balance */
  balance: number;

  vaultAddress: string;
  triggerAddress: string;
  coldAddress: string;

  /** Use it to mark last time it was pushed - doesn't mean they succeeded */
  vaultPushTime?: number;
  triggerPushTime?: number;
  panicPushTime?: number; //TODO: This must be set when I implement the push -
  //TODO: however this can be confussing because panic might have been pushed
  //by a 3rd party

  vaultTxHex: string;

  /** These are candidate txs. Everytime balance are refetched they should be
   * re-checked */
  triggerTxHex?: string;
  triggerTxBlockHeight?: number; //Do this one

  unlockingTxHex?: string;
  unlockingTxBlockHeight?: number;

  panicTxHex?: string; //Maybe the samer as unlockingTxHex or not
  panicTxBlockHeight?: number;

  feeRateCeiling: number;
  lockBlocks: number;

  remainingBlocks: number;

  txMap: TxMap;
  triggerMap: TriggerMap;

  /** Assuming a scenario of extreme fees (feeRateCeiling), what will be the
   * remaining balance after panicking */
  minPanicBalance: number;

  /**
   * the keyExpression for the unlocking using the unvaulting path
   **/
  unvaultKey: string; //This is an input in createVault
  triggerDescriptor: string; //This is an outout since the panicKey is randoml generated here
};
export type Vaults = Record<string, Vault>;
type TxHex = string;
type TxMap = Record<TxHex, { txId: string; fee: number; feeRate: number }>;
/** maps a triggerTx with its corresponding Array of panicTxs */
type TriggerMap = Record<TxHex, Array<TxHex>>;

export type UtxosData = Array<{
  txHex: string;
  vout: number;
  output: OutputInstance;
}>;

/**
 * For each utxo, get its corresponding:
 * - previous txHex and vout
 * - output descriptor
 * - index? if the descriptor retrieved in discovery was ranged
 * - signersPubKeys? if it can only be spent through a speciffic spending path
 *
 * Important: Returns same reference for utxosData if utxos did not change
 *
 * Note that it's fine using memoize and just check for changes in utxos.
 * The rest of params are just tooling to complete utxosData but won't change
 * the result
 */
export const getUtxosData = memoize(
  (
    utxos: Array<string>,
    vaults: Vaults,
    network: Network,
    discovery: DiscoveryInstance
  ): UtxosData => {
    return utxos.map(utxo => {
      const [txId, strVout] = utxo.split(':');
      const vout = Number(strVout);
      if (!txId || isNaN(vout) || !Number.isInteger(vout) || vout < 0)
        throw new Error(`Invalid utxo ${utxo}`);
      const indexedDescriptor = discovery.getDescriptor({ utxo });
      if (!indexedDescriptor) throw new Error(`Unmatched ${utxo}`);
      let signersPubKeys;
      for (const vault of Object.values(vaults)) {
        if (vault.triggerDescriptor === indexedDescriptor.descriptor) {
          if (vault.remainingBlocks !== 0)
            throw new Error('utxo is not spendable, should not be set');
          const { pubkey: unvaultPubKey } = parseKeyExpression({
            keyExpression: vault.unvaultKey,
            network
          });
          if (!unvaultPubKey) throw new Error('Could not extract the pubKey');
          signersPubKeys = [unvaultPubKey];
        }
      }
      const txHex = discovery.getTxHex({ txId });
      return {
        ...indexedDescriptor,
        output: new Output({
          ...indexedDescriptor,
          ...(signersPubKeys !== undefined ? { signersPubKeys } : {}),
          network
        }),
        txHex,
        vout
      };
    });
  }
);

export const getOutputsWithValue = memoize((utxosData: UtxosData) =>
  utxosData.map(utxo => {
    const out = Transaction.fromHex(utxo.txHex).outs[utxo.vout];
    if (!out) throw new Error('Invalid utxo');
    return { output: utxo.output, value: out.value };
  })
);

/**
 * serviceFee will be at least dust
 * However if serviceFee makes the vaultedAmount to be < its own dust limit
 * then return zero
 */
export const getServiceFee = ({
  amount,
  vaultOutput,
  serviceOutput,
  serviceFeeRate
}: {
  amount: number;
  vaultOutput: OutputInstance;
  serviceOutput: OutputInstance;
  serviceFeeRate: number;
}) => {
  const serviceFee = Math.max(
    dustThreshold(serviceOutput),
    Math.round(serviceFeeRate * amount)
  );
  if (amount - serviceFee <= dustThreshold(vaultOutput)) return 0;
  else return serviceFee;
};

/**
 * The vault coinselector
 */

const selectVaultUtxosData = ({
  utxosData,
  vaultOutput,
  serviceOutput,
  changeOutput,
  amount,
  feeRate,
  serviceFeeRate
}: {
  utxosData: UtxosData;
  vaultOutput: OutputInstance;
  serviceOutput: OutputInstance;
  changeOutput: OutputInstance;
  amount: number;
  feeRate: number;
  serviceFeeRate: number;
}) => {
  const utxos = getOutputsWithValue(utxosData);
  const serviceFee = getServiceFee({
    amount,
    vaultOutput,
    serviceOutput,
    serviceFeeRate
  });
  const coinselected = coinselect({
    utxos,
    targets: [
      { output: vaultOutput, value: amount - serviceFee },
      ...(serviceFee ? [{ output: serviceOutput, value: serviceFee }] : [])
    ],
    remainder: changeOutput,
    feeRate
  });
  if (!coinselected) return;
  const vaultUtxosData =
    coinselected.utxos.length === utxosData.length
      ? utxosData
      : coinselected.utxos.map(utxo => {
          const utxoData = utxosData[utxos.indexOf(utxo)];
          if (!utxoData) throw new Error('Invalid utxoData');
          return utxoData;
        });
  return {
    vsize: coinselected.vsize,
    fee: coinselected.fee,
    targets: coinselected.targets,
    vaultUtxosData
  };
};

export const utxosDataBalance = memoize((utxosData: UtxosData): number =>
  getOutputsWithValue(utxosData).reduce((a, { value }) => a + value, 0)
);

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
//TODO return dustThreshold as min vault value / its more complex. At least
//it must return something that when unvaulting it recovers a significant amount
export async function createVault({
  balance,
  unvaultKey,
  samples,
  feeRate,
  serviceFeeRate,
  feeRateCeiling,
  coldAddress,
  changeDescriptor,
  serviceAddress,
  lockBlocks,
  masterNode,
  network,
  utxosData,
  onProgress
}: {
  balance: number;
  /** The unvault key expression that must be used to create triggerDescriptor */
  unvaultKey: string;
  /** How many txs to compute. Note that the final number of tx is samples^2*/
  samples: number;
  feeRate: number;
  serviceFeeRate: number;
  /** This is the largest fee rate for which at least one trigger and panic txs
   * must be pre-computed*/
  feeRateCeiling: number;
  coldAddress: string;
  changeDescriptor: string;
  serviceAddress: string;
  lockBlocks: number;
  masterNode: BIP32Interface;
  network: Network;
  utxosData: UtxosData;
  onProgress: (progress: number) => boolean;
}): Promise<
  | Vault
  | 'COINSELECT_ERROR'
  | 'NOT_ENOUGH_FUNDS'
  | 'USER_CANCEL'
  | 'UNKNOWN_ERROR'
> {
  try {
    let signaturesProcessed = 0;
    //TODO: read the comments above. selectVaultUtxosData will also accept
    //the targets already. Change may be used or not. We will know if from
    //selectVaultUtxosData
    //TODO: preapare the targets to be passed to selectVaultUtxosData
    const serviceOutput = new Output({
      descriptor: createServiceDescriptor(serviceAddress),
      network
    });
    const changeOutput = new Output({
      descriptor: changeDescriptor,
      network
    });
    const vaultPair = ECPair.makeRandom();
    const vaultOutput = new Output({
      descriptor: createVaultDescriptor(vaultPair.publicKey.toString('hex')),
      network
    });
    const selected = selectVaultUtxosDataMemo({
      utxosData,
      amount: balance,
      vaultOutput,
      serviceOutput,
      changeOutput,
      feeRate,
      serviceFeeRate
    });
    if (!selected) return 'COINSELECT_ERROR';
    const vaultUtxosData = selected.vaultUtxosData;

    let minPanicBalance = balance;
    const maxSatsPerByte = feeRateCeiling;
    const feeRates = feeRateSampling({ samples, maxSatsPerByte });
    console.log({ feeRates });
    if (
      feeRates.length !== samples ||
      maxSatsPerByte !== feeRateCeiling ||
      maxSatsPerByte !== feeRates.slice(-1)[0]
    )
      throw new Error(`feeRate sampling failed`);
    const txMap: TxMap = {};
    const triggerMap: TriggerMap = {};

    const coldOutput = new Output({
      descriptor: createColdDescriptor(coldAddress),
      network
    });

    ////////////////////////////////
    //Prepare the Vault Tx:
    ////////////////////////////////

    const psbtVault = new Psbt({ network });
    //Add the inputs to psbtVault:
    const vaultFinalizers = [];
    for (const utxoData of vaultUtxosData) {
      const { output, vout, txHex } = utxoData;
      // Add the utxo as input of psbtVault:
      const inputFinalizer = output.updatePsbtAsInput({
        psbt: psbtVault,
        txHex,
        vout
      });
      vaultFinalizers.push(inputFinalizer);
    }

    //Proceed assuming zero fees:
    const psbtVaultZeroFee = psbtVault.clone();
    //Add the output to psbtVault assuming zero fees value = balance:
    if (!vaultUtxosData.length || balance <= 0)
      throw new Error(`Invalid utxos or balance`);
    vaultOutput.updatePsbtAsOutput({ psbt: psbtVaultZeroFee, value: balance });
    //Sign
    signers.signBIP32({ psbt: psbtVaultZeroFee, masterNode });
    //Finalize
    vaultFinalizers.forEach(finalizer => finalizer({ psbt: psbtVaultZeroFee }));
    //Compute the correct output value for feeRate
    const vSizeVault = psbtVaultZeroFee.extractTransaction(true).virtualSize();
    //The vsize for a tx with different fees may slightly vary because of the
    //signature. Let's assume a slightly larger tx size (+1 vbyte).
    const feeVault = Math.ceil((vSizeVault + 1) * feeRate);
    //Not enough funds to create a vault tx with feeRate: ${feeRate} sats/vbyte
    if (feeVault > balance) {
      console.warn('feeVault > balance', { feeVault, balance });
      return 'NOT_ENOUGH_FUNDS';
    }
    const vaultBalance = balance - feeVault;

    //Add the output to psbtVault assuming feeRate:
    vaultOutput.updatePsbtAsOutput({ psbt: psbtVault, value: vaultBalance });
    //Sign
    signers.signBIP32({ psbt: psbtVault, masterNode });
    //Finalize
    vaultFinalizers.forEach(finalizer => finalizer({ psbt: psbtVault }));

    ////////////////////////////////
    //Prepare the Trigger Unvault Tx
    ////////////////////////////////

    const panicPair = ECPair.makeRandom();
    const panicPubKey = panicPair.publicKey;

    //Prepare the output...
    const triggerDescriptor = createTriggerDescriptor({
      unvaultKey,
      panicKey: panicPubKey.toString('hex'),
      lockBlocks
    });

    const triggerOutput = new Output({
      descriptor: triggerDescriptor,
      network
    });
    const triggerOutputPanicPath = new Output({
      descriptor: triggerDescriptor,
      network,
      signersPubKeys: [panicPubKey]
    });
    const { pubkey: unvaultPubKey } = parseKeyExpression({
      keyExpression: unvaultKey,
      network
    });
    if (!unvaultPubKey) throw new Error('Cannot extract unvaultPubKey');
    const psbtTriggerBase = new Psbt({ network });
    const txVault = psbtVault.extractTransaction(true);
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
      if (feeTrigger > vaultBalance && feeRateTrigger === maxSatsPerByte) {
        console.warn(
          'feeTrigger > vaultBalance && feeRateTrigger === maxSatsPerByte',
          { feeTrigger, vaultBalance, maxSatsPerByte }
        );
        return 'NOT_ENOUGH_FUNDS';
      }
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
        signers.signECPair({ psbt: psbtTrigger, ecpair: vaultPair });
        //Finalize
        triggerInputFinalizer({ psbt: psbtTrigger, validate: !feeTrigger });
        if (signaturesProcessed++ % 10 === 0) {
          if (onProgress(signaturesProcessed / (samples * samples)) === false)
            return 'USER_CANCEL';
          await sleep(0);
        }
        //Take the vsize for a tx with 0 fees.
        const txTrigger = psbtTrigger.extractTransaction(true);
        vSizeTrigger = txTrigger.virtualSize();
        const triggerTxHex = txTrigger.toHex();
        if (feeTrigger) {
          txMap[triggerTxHex] = {
            fee: feeTrigger,
            feeRate: feeTrigger / vSizeTrigger,
            txId: txTrigger.getId()
          };
          triggerMap[triggerTxHex] = [];
          const panicTxs = triggerMap[triggerTxHex];
          if (!panicTxs) throw new Error('Invalid assingment');
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
            if (feePanic > triggerBalance && feeRatePanic === maxSatsPerByte) {
              console.warn(
                'feePanic > triggerBalance && feeRatePanic === maxSatsPerByte',
                { feePanic, triggerBalance, feeRatePanic, maxSatsPerByte }
              );
              return 'NOT_ENOUGH_FUNDS';
            }
            //Add the output to psbtPanic:
            if (
              feePanic <= triggerBalance &&
              // don't process twice same fee:
              !feePanicArray.some(fee => fee === feePanic)
            ) {
              const panicBalance = triggerBalance - feePanic;
              if (panicBalance < minPanicBalance)
                minPanicBalance = panicBalance;
              feePanicArray.push(feePanic);
              const psbtPanic = psbtPanicBase.clone();
              coldOutput.updatePsbtAsOutput({
                psbt: psbtPanic,
                value: triggerBalance - feePanic
              });
              //Sign
              signers.signECPair({ psbt: psbtPanic, ecpair: panicPair });
              //Finalize
              panicInputFinalizer({ psbt: psbtPanic, validate: !feePanic });
              if (signaturesProcessed++ % 10 === 0) {
                if (
                  onProgress(signaturesProcessed / (samples * samples)) ===
                  false
                )
                  return 'USER_CANCEL';
                await sleep(0);
              }
              //Take the vsize for a tx with 0 fees.
              const txPanic = psbtPanic.extractTransaction(true);
              vSizePanic = txPanic.virtualSize();
              if (feePanic) {
                const panicTxHex = txPanic.toHex();
                txMap[panicTxHex] = {
                  fee: feePanic,
                  feeRate: feePanic / vSizePanic,
                  txId: txPanic.getId()
                };
                panicTxs.push(panicTxHex);
              }
            }
          }
        }
      }
    }

    console.log({ signaturesProcessed, feeRatesN: feeRates.length });

    const vaultAddress = vaultOutput.getAddress();
    const triggerAddress = triggerOutput.getAddress();

    //Double check everything went smooth. This should never throw.
    for (const panicTxs of Object.values(triggerMap))
      if (panicTxs.length === 0)
        throw new Error(`Panic spending path has no solutions.`);

    return {
      balance,
      minPanicBalance,
      feeRateCeiling,
      vaultAddress,
      triggerAddress,
      vaultTxHex,
      unvaultKey,
      coldAddress,
      lockBlocks,
      remainingBlocks: lockBlocks,
      txMap,
      triggerMap,
      triggerDescriptor
    };
  } catch (error) {
    console.error(error);
    return 'UNKNOWN_ERROR';
  }
}

/**
 * For estimation purposes only, using dummy keys
 */
export const estimateTriggerTxSize = memoize((lockBlocks: number) => {
  // Assumes bitcoin network (not important for txSizes anyway)
  return vsize(
    [new Output({ descriptor: createVaultDescriptor(DUMMY_PUBKEY) })],
    [
      new Output({
        descriptor: createTriggerDescriptor({
          unvaultKey: DUMMY_PUBKEY,
          panicKey: DUMMY_PUBKEY_2,
          lockBlocks
        })
      })
    ]
  );
});

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

export function validateAddress(addressValue: string, network: Network) {
  try {
    address.toOutputScript(addressValue, network);
    return true;
  } catch (e) {
    return false;
  }
}

const spendingTxCache = new Map();

/**
 * Returns the tx that spent a Tx Output (or it's in the mempool about to spend it).
 * If it's in the mempool this is marked by setting blockHeight to zero.
 * This function will return early if last result was irreversible */
export async function fetchSpendingTx(
  txHex: string,
  vout: number,
  discovery: DiscoveryInstance
): Promise<
  { txHex: string; irreversible: boolean; blockHeight: number } | undefined
> {
  const cacheKey = `${txHex}:${vout}`;
  const cachedResult = spendingTxCache.get(cacheKey);

  // Check if cached result exists and is irreversible, then return it
  if (cachedResult && cachedResult.irreversible) {
    return cachedResult;
  }

  const tx = Transaction.fromHex(txHex);

  const output = tx.outs[vout];
  if (!output) throw new Error('Invalid out');
  const scriptHash = Buffer.from(crypto.sha256(output.script))
    .reverse()
    .toString('hex');

  //retrieve all txs that sent / received from this scriptHash
  const history = await discovery.getExplorer().fetchTxHistory({ scriptHash });

  for (let i = 0; i < history.length; i++) {
    const txData = history[i];
    if (!txData) throw new Error('Invalid history');
    //const irreversible = txData.irreversible;
    //console.log({ irreversible });
    //Check if this specific tx was spending my output:
    const historyTxHex = await discovery.getExplorer().fetchTx(txData.txId);
    const txHistory = Transaction.fromHex(historyTxHex);
    //For all the inputs in the tx see if one of them was spending from vout and txId
    const found = txHistory.ins.some(input => {
      const inputPrevtxId = Buffer.from(input.hash).reverse().toString('hex');
      const inputPrevOutput = input.index;
      return inputPrevtxId === tx.getId() && inputPrevOutput === vout;
    });
    if (found)
      return {
        txHex: historyTxHex,
        irreversible: txData.irreversible,
        blockHeight: txData.blockHeight
      };
  }
  return;
}

const selectVaultUtxosDataFactory = memoize((utxosData: UtxosData) =>
  memoize((vaultOutput: OutputInstance) =>
    memoize((serviceOutput: OutputInstance) =>
      memoize((changeOutput: OutputInstance) =>
        memoize(
          ({
            amount,
            feeRate,
            serviceFeeRate
          }: {
            amount: number;
            feeRate: number;
            serviceFeeRate: number;
          }) =>
            selectVaultUtxosData({
              utxosData,
              vaultOutput,
              serviceOutput,
              changeOutput,
              amount,
              feeRate,
              serviceFeeRate
            }),
          ({ amount, feeRate, serviceFeeRate }) =>
            JSON.stringify({ amount, feeRate, serviceFeeRate })
        )
      )
    )
  )
);
const selectVaultUtxosDataMemo = ({
  utxosData,
  vaultOutput,
  serviceOutput,
  changeOutput,
  amount,
  feeRate,
  serviceFeeRate
}: {
  utxosData: UtxosData;
  vaultOutput: OutputInstance;
  serviceOutput: OutputInstance;
  changeOutput: OutputInstance;
  amount: number;
  feeRate: number;
  serviceFeeRate: number;
}) =>
  selectVaultUtxosDataFactory(utxosData)(vaultOutput)(serviceOutput)(
    changeOutput
  )({
    amount,
    feeRate,
    serviceFeeRate
  });
export { selectVaultUtxosDataMemo as selectVaultUtxosData };
