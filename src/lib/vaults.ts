//TODO: I'm not 100% convinced about selectVaultUtxosData since it assumes
//change.
//But the real problem may be with estimateVaultTxSize.
//However, estimateMaxVaultAmount is correctly computed assuming no change.
//So, what happens if the user selects maxVaultAmount? I guess selectVaultUtxosData
//will work just fine.
//
//
//However the estimateVaultTxSize is wrong. how is this one used?
//
//-> Solution selectVaultUtxosData should return the targets too. This
//way i know if change was used or not. Then estimateVaultTxSize will also
//pass those targets instead of inventing ones.
//
//Maybe even better selectVaultUtxosData should, in fact, return the size already!
//It should return the whole pack of stuff in fact!!! And then I can get rid
//of estimateVaultTxSize
//  > In fact, this very same function is the one that then has to be used
//  in createVault. So selectVaultUtxosData should also receive some
//  targets already. Then use some "templateTargets" to be used as default
//  when not passed, and those will be the ones used in the VaultSetUp
//
//
//TODO: add service fee in the vault process, also add change
//TODO: very imporant to only allow Vaulting funds with 1 confirmatin at least (make this a setting)
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
import { DescriptorsFactory, OutputInstance } from '@bitcoinerlab/descriptors';
const { Output, ECPair, parseKeyExpression } = DescriptorsFactory(secp256k1);
const wpkhOutput = new Output({
  //Just a random pubkey here...
  descriptor: `wpkh(038ffea936b2df76bf31220ebd56a34b30c6b86f40d3bd92664e2f5f98488dddfa)`
});
const wpkhDustThreshold = dustThreshold(wpkhOutput);

import { compilePolicy } from '@bitcoinerlab/miniscript';
const { encode: olderEncode } = require('bip68');
import { signBIP32, signECPair } from '@bitcoinerlab/descriptors/dist/signers';
import type { BIP32Interface } from 'bip32';

import { feeRateSampling } from './fees';
import type { DiscoveryInstance } from '@bitcoinerlab/discovery';
import {
  maxFunds,
  coinselect,
  vsize,
  dustThreshold
} from '@bitcoinerlab/coinselect';

export type Vault = {
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

const getOutputsWithValue = memoize((utxosData: UtxosData) =>
  utxosData.map(utxo => {
    const out = Transaction.fromHex(utxo.txHex).outs[utxo.vout];
    if (!out) throw new Error('Invalid utxo');
    return { output: utxo.output, value: out.value };
  })
);

const selectVaultUtxosDataFactory = memoize((utxosData: UtxosData) =>
  memoize(
    ({ amount, feeRate }: { amount: number; feeRate: number }) => {
      const utxos = getOutputsWithValue(utxosData);
      const coinselected = coinselect({
        utxos,
        targets: [
          // This will be the main target
          {
            output: wpkhOutput,
            //Set this to 1 sat. We need to create an output to make it count.
            //Service fee will be added later
            value: amount - wpkhDustThreshold
          },
          // This will be the service fee output
          {
            output: wpkhOutput,
            //Set this to 1 sat. We need to create an output to make it count.
            //Service fee will be added later
            value: wpkhDustThreshold
          }
        ],
        remainder: wpkhOutput,
        feeRate
      });
      if (!coinselected) return;
      if (coinselected.utxos.length === utxosData.length) return utxosData;
      else
        return coinselected.utxos.map(utxo => {
          const utxoData = utxosData[utxos.indexOf(utxo)];
          if (!utxoData) throw new Error('Invalid utxoData');
          return utxoData;
        });
    },
    ({ amount, feeRate }) => JSON.stringify({ amount, feeRate })
  )
);

export const selectVaultUtxosData = ({
  utxosData,
  amount,
  feeRate
}: {
  utxosData: UtxosData;
  amount: number;
  feeRate: number;
}) => selectVaultUtxosDataFactory(utxosData)({ amount, feeRate });

export const createTriggerDescriptor = ({
  unvaultKey,
  panicKey,
  lockBlocks
}: {
  unvaultKey: string;
  panicKey: string;
  lockBlocks: number;
}) => {
  //TODO: Do not compile the POLICY. hardcode the miniscript
  const POLICY = (older: number) =>
    `or(pk(@panicKey),99@and(pk(@unvaultKey),older(${older})))`;
  const older = olderEncode({ blocks: lockBlocks });
  const { miniscript, issane } = compilePolicy(POLICY(older));
  if (!issane) throw new Error('Policy not sane');

  const triggerDescriptor = `wsh(${miniscript
    .replace('@unvaultKey', unvaultKey)
    .replace('@panicKey', panicKey)})`;
  return triggerDescriptor;
};

export const utxosDataBalance = memoize((utxosData: UtxosData): number =>
  getOutputsWithValue(utxosData).reduce((a, { value }) => a + value, 0)
);

/** When sending maxFunds, what is the recipient + service fee value?
 * It returns a number or undefined if not possible to obtain a value
 */
const estimateMaxVaultAmountFactory = memoize((utxosData: UtxosData) =>
  memoize((feeRate: number) => {
    const coinselected = maxFunds({
      utxos: getOutputsWithValue(utxosData),
      targets: [
        // This will be the service fee output
        {
          output: wpkhOutput,
          //Set this to 1 sat. We need to create an output to make it count.
          //Service fee will be added later
          value: 1
        }
      ],
      remainder: wpkhOutput,
      feeRate
    });
    if (!coinselected) return;
    const value = coinselected.targets[coinselected.targets.length - 1]?.value;
    if (value === undefined) return;
    return value + 1; //Add the service fee back to the total
  })
);
export const estimateMaxVaultAmount = ({
  utxosData,
  feeRate
}: {
  utxosData: UtxosData;
  feeRate: number;
}) => estimateMaxVaultAmountFactory(utxosData)(feeRate);

/**
 * Require that at least 2/3 (minRecoverableRatio) of funds must be recoverable.
 * In other words, at most loose 1/3 of initial value in fees.
 * It assumes a lockBlocks using the largest possible value (size)
 */
export const estimateMinVaultAmountFactory = memoize(
  (
    utxosData: /** Here ideally pass the selectedUtxos data but it's good (and safe) approach
     * to pass all the utxosData since this is used to compute an estimate of
     * the vault ts size.
     */
    UtxosData
  ) =>
    memoize(
      ({
        lockBlocks,
        feeRate,
        feeRateCeiling,
        minRecoverableRatio
      }: {
        lockBlocks: number;
        /** Fee rate used for the Vault*/
        feeRate: number;
        /** Max Fee rate for the presigned txs */
        feeRateCeiling: number;
        minRecoverableRatio: number;
      }) => {
        if (
          Number.isNaN(minRecoverableRatio) ||
          minRecoverableRatio >= 1 ||
          minRecoverableRatio <= 0
        )
          throw new Error(
            `Invalid minRecoverableRatio: ${minRecoverableRatio}`
          );
        // initialValue - totalFees > minRecoverableRatio * initialValue
        // initialValue - minRecoverableRatio * initialValue > totalFees
        // initialValue * (1 - minRecoverableRatio) > totalFees
        // initialValue > totalFees / (1 - minRecoverableRatio)
        // If minRecoverableRatio =  2/3 => It can loose up to 1/3 of value in fees
        const totalFees =
          Math.ceil(feeRate * estimateVaultTxSize(utxosData)) +
          Math.ceil(feeRateCeiling * estimateTriggerTxSize(lockBlocks));

        return Math.ceil(totalFees / (1 - minRecoverableRatio));
      },
      ({ lockBlocks, feeRate, feeRateCeiling, minRecoverableRatio }) =>
        JSON.stringify({
          lockBlocks,
          feeRate,
          feeRateCeiling,
          minRecoverableRatio
        })
    )
);

export const estimateMinVaultAmount = ({
  utxosData,
  lockBlocks,
  feeRate,
  feeRateCeiling,
  minRecoverableRatio
}: {
  /** Here ideally pass the selectedUtxos data but it's good (and safe) approach
   * to pass all the utxosData since this is used to compute an estimate of
   * the vault ts size.
   */
  utxosData: UtxosData;
  lockBlocks: number;
  /** Fee rate used for the Vault*/
  feeRate: number;
  /** Max Fee rate for the presigned txs */
  feeRateCeiling: number;
  minRecoverableRatio: number;
}) =>
  estimateMinVaultAmountFactory(utxosData)({
    lockBlocks,
    feeRate,
    feeRateCeiling,
    minRecoverableRatio
  });

//TODO return dustThrshold as min vault value / its more complex. At least
//it must return something that when unvaulting it recovers a significant amount

export function createVault({
  balance,
  unvaultKey,
  samples,
  feeRate,
  feeRateCeiling,
  coldAddress,
  changeAddress,
  serviceFeeAddress,
  lockBlocks,
  masterNode,
  network,
  utxosData
}: {
  balance: number;
  /** The unvault key expression that must be used to create triggerDescriptor */
  unvaultKey: string;
  /** How many txs to compute. Note that the final number of tx is samples^2*/
  samples: number;
  feeRate: number;
  /** This is the largest fee rate for which at least one trigger and panic txs
   * must be pre-computed*/
  feeRateCeiling: number;
  coldAddress: string;
  changeAddress: string;
  serviceFeeAddress: string;
  lockBlocks: number;
  masterNode: BIP32Interface;
  network: Network;
  utxosData: UtxosData;
}): Vault | undefined {
  //TODO: read the comments above. selectVaultUtxosData will also accept
  //the targets already. Change may be used or not. We will know if from
  //selectVaultUtxosData
  //TODO: preapare the targets to be passed to selectVaultUtxosData
  const serviceFeeOutput = new Output({
    descriptor: `addr(${serviceFeeAddress})`,
    network
  });
  const remainderOutput = new Output({
    descriptor: `addr(${changeAddress})`,
    network
  });
  const vaultUtxosData = selectVaultUtxosData({
    utxosData,
    amount: balance,
    feeRate
  });
  if (!vaultUtxosData) return;

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
    descriptor: `addr(${coldAddress})`,
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

  //Prepare the output:
  const vaultPair = ECPair.makeRandom();
  const vaultOutput = new Output({
    descriptor: `wpkh(${vaultPair.publicKey.toString('hex')})`,
    network
  });

  //Proceed assuming zero fees:
  const psbtVaultZeroFee = psbtVault.clone();
  //Add the output to psbtVault assuming zero fees value = balance:
  if (!vaultUtxosData.length || balance <= 0)
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

  //TODO: The Policy should not be here
  //Prepare the output...

  const triggerDescriptor = createTriggerDescriptor({
    unvaultKey,
    panicKey: panicPubKey.toString('hex'),
    lockBlocks
  });

  const triggerOutput = new Output({ descriptor: triggerDescriptor, network });
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
            coldOutput.updatePsbtAsOutput({
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
              panicTxs.push(panicTxHex);
            }
          }
        }
      }
    }
  }

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
}

/**
 * Important: assumes wpkh vault address.
 * Assumes bitcoin network (not important for txSizes anyway
 */
export const estimateVaultTxSize = memoize((utxosData: UtxosData) => {
  return vsize(
    utxosData.map(utxoData => utxoData.output),
    [
      //Just a random pubkey here for the target...
      wpkhOutput,
      //Just a random pubkey here for the change...
      wpkhOutput,
      //Just a random pubkey here for the service fee...
      wpkhOutput
    ]
  );
});
/**
 * Important: assumes wpkh vault address.
 * tx size is in fact the largest possible
 * Assumes bitcoin network (not important for txSizes anyway
 */
export const estimateTriggerTxSize = memoize((lockBlocks: number) =>
  vsize(
    [wpkhOutput],
    [
      new Output({
        descriptor: createTriggerDescriptor({
          //Use random keys
          unvaultKey:
            '0330d54fd0dd420a6e5f8d3624f5f3482cae350f79d5f0753bf5beef9c2d91af3c',
          panicKey:
            '03e775fd51f0dfb8cd865d9ff1cca2a158cf651fe997fdc9fee9c1d3b5e995ea77',
          lockBlocks
        })
      })
    ]
  )
);

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
