// TODO: very imporant to only allow Vaulting funds with 1 confirmatin at least (make this a setting)
import { Network, Psbt, Transaction, address, crypto } from 'bitcoinjs-lib';
import memoize from 'lodash.memoize';
import type { Accounts, Signer } from './wallets';
import moize from 'moize';

import * as secp256k1 from '@bitcoinerlab/secp256k1';
import {
  signers,
  DescriptorsFactory,
  OutputInstance
} from '@bitcoinerlab/descriptors';
const { Output, ECPair, parseKeyExpression } = DescriptorsFactory(secp256k1);
import {
  getMasterNode,
  createVaultDescriptor,
  createTriggerDescriptor,
  createColdDescriptor,
  createServiceDescriptor,
  DUMMY_PUBKEY,
  DUMMY_PUBKEY_2
} from './vaultDescriptors';
import { shallowEqualArrays } from 'shallow-equal';

import { feeRateSampling } from './fees';
import type { DiscoveryInstance, TxAttribution } from '@bitcoinerlab/discovery';
import { coinselect, vsize, dustThreshold } from '@bitcoinerlab/coinselect';
import type { Explorer } from '@bitcoinerlab/explorer';
import { type NetworkId, networkMapping } from './network';

export type TxHex = string;
export type TxId = string;

export type VaultSettings = {
  /** amount + minerFees = total user spendings = value extracted from user utxos
   * vaultedAmount = amount - serviceFee
   */
  amount: number;
  coldAddress: string;
  feeRate: number;
  lockBlocks: number;
};

export type Vault = {
  /** vaultId and vaultPath universally identify this vault.
   *
   *  const vaultPath = THUNDERDEN_VAULT_PATH.replace(
   *    '<network>',
   *    network === networks.bitcoin ? '0' : '1'
   *  ).replace('<index>', index.toString());
   *  //index is a sequence, increased as new vaults are created
   *  const vaultNode = masterNode.derivePath(vaultPath);
   *  const vaultId = vaultNode.publicKey.toString('hex');
   *
   * They are be obtained from the next available pubKey
   * for path on the online P2P network. See fetchP2PVaultIds */
  vaultId: string;
  vaultPath: string;
  amount: number;

  vaultAddress: string;
  triggerAddress: string;
  coldAddress: string;

  feeRateCeiling: number;
  lockBlocks: number;

  vaultTxHex: string;

  txMap: TxMap;
  triggerMap: TriggerMap;

  networkId: NetworkId;

  /** Assuming a scenario of extreme fees (feeRateCeiling), what will be the
   * remaining balance after panicking */
  minPanicBalance: number;

  /**
   * the keyExpression for the unlocking using the unvaulting path
   **/
  unvaultKey: string; //This is an input in createVault
  triggerDescriptor: string; //This is an outout since the panicKey is randoml generated here

  creationTime: number;
};

export type VaultStatus = {
  vaultTxBlockHeight?: number;

  triggerTxHex?: string;
  triggerTxBlockHeight?: number;

  panicTxHex?: string; //Maybe the samer as unlockingTxHex or not
  panicTxBlockHeight?: number;

  //If it was spent as hot:
  spendAsHotTxHex?: string;
  spendAsHotTxBlockHeight?: number;

  /** Props below are just to keep internal track of users actions.
   * They are kept so that the App knows the last action the user did WITHIN the
   * app:
   * - doesn't mean the action succeed. Perhaps a vault process did not have
   *   enough fees to complete, for example.
   * - also, those actions could have also be performed externally.
   *   For example a delegated person could have pushed a panic process.
   *
   * So, not reliable. To be used ONLY for UX purposes: For example to prevent
   * users to re-push txs in short periods of time.
   */
  vaultPushTime?: number;
  triggerPushTime?: number;
  panicPushTime?: number;
  unvaultPushTime?: number;
};

export type RescueTxMap = Record<
  TxId, //The triggerTxId
  Array<{ txHex: TxHex; fee: number; feeRate: number }>
>;
export type Rescue = {
  version: 'thunderden_rescue_V0';
  readme: Array<string>;
  networkId: NetworkId;
  rescueTxMap: RescueTxMap;
};

export type VaultsStatuses = Record<string, VaultStatus>;

export type Vaults = Record<string, Vault>;
type TxMap = Record<TxHex, { txId: TxId; fee: number; feeRate: number }>;
/** maps a triggerTx with its corresponding Array of panicTxs */
type TriggerMap = Record<TxHex, Array<TxHex>>;

export type UtxosData = Array<{
  tx: Transaction;
  txHex: string;
  vout: number;
  output: OutputInstance;
}>;
export type HistoryData = Array<
  TxAttribution & {
    tx: Transaction;
  }
>;

/**
 * For each utxo, get its corresponding:
 * - previous txHex and vout
 * - output descriptor
 * - index? if the descriptor retrieved in discovery was ranged
 * - signersPubKeys? if it can only be spent through a speciffic spending path
 *
 * Important: Returns same reference for utxosData if utxos did not change
 *
 * Important: discovery is used to retrieve info. It does not modify
 * the discoveryData internal representation in any way, so there is no need
 * to save to disk exported discoveryData after using this function.
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
      const descriptorAndIndex = discovery.getDescriptor({ utxo });
      if (!descriptorAndIndex) throw new Error(`Unmatched ${utxo}`);
      let signersPubKeys;
      for (const vault of Object.values(vaults)) {
        if (vault.triggerDescriptor === descriptorAndIndex.descriptor) {
          const { pubkey: unvaultPubKey } = parseKeyExpression({
            keyExpression: vault.unvaultKey,
            network
          });
          if (!unvaultPubKey) throw new Error('Could not extract the pubKey');
          signersPubKeys = [unvaultPubKey];
        }
      }
      const txHex = discovery.getTxHex({ txId });
      // It's free getting the tx from discovery (memoized). Pass it down:
      const tx = discovery.getTransaction({ txId });
      return {
        ...descriptorAndIndex,
        output: new Output({
          ...descriptorAndIndex,
          ...(signersPubKeys !== undefined ? { signersPubKeys } : {}),
          network
        }),
        tx,
        txHex,
        vout
      };
    });
  }
);

/**
 * Returns an array of TxAttribution including also the Transaction.
 * Note that it's fine using memoize and just check for changes in history.
 * The rest of params are just tooling to complete utxosData but won't change
 * the result
 */
export const getHistoryData = memoize(
  (
    history: Array<TxAttribution>,
    discovery: DiscoveryInstance
  ): HistoryData => {
    return history.map(txAttribution => ({
      ...txAttribution,
      // It's free getting the tx from discovery (memoized). Pass it down:
      tx: discovery.getTransaction({ txId: txAttribution.txId })
    }));
  }
);

export const getOutputsWithValue = memoize((utxosData: UtxosData) =>
  utxosData.map(utxo => {
    const out = utxo.tx.outs[utxo.vout];
    if (!out) throw new Error('Invalid utxo');
    return { output: utxo.output, value: out.value };
  })
);

/**
 * serviceFee will be at least dust + 1
 * However if serviceFee makes the vaultedAmount to be <= its own dust limit
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
    dustThreshold(serviceOutput) + 1,
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
  /** vaultedAmount = amount - serviceFee
   * The user spends amount `+ minerFees and vaults vaultedAmount
   */
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
    serviceFee,
    targets: coinselected.targets,
    vaultUtxosData
  };
};

export const utxosDataBalance = memoize((utxosData: UtxosData): number =>
  getOutputsWithValue(utxosData).reduce((a, { value }) => a + value, 0)
);

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const signPsbt = async (signer: Signer, network: Network, psbtVault: Psbt) => {
  const mnemonic = signer?.mnemonic;
  if (!mnemonic) throw new Error('Could not initialize the signer');
  const masterNode = getMasterNode(mnemonic, network);
  signers.signBIP32({ psbt: psbtVault, masterNode });
};

export async function createVault({
  amount,
  unvaultKey,
  samples,
  feeRate,
  serviceFeeRate,
  feeRateCeiling,
  coldAddress,
  changeDescriptor,
  serviceAddress,
  lockBlocks,
  signer,
  networkId,
  utxosData,
  nextVaultId,
  nextVaultPath,
  onProgress
}: {
  /** amount includes serviceFee */
  amount: number;
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
  /** A signer async function able to sign any of the utxos in utxosData,
   * placed in a Psbt */
  signer: Signer;
  networkId: NetworkId;
  /** There are ALL the utxos (prior to coinselect them) */
  utxosData: UtxosData;
  nextVaultId: string;
  nextVaultPath: string;
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
    let minPanicBalance = amount;

    const network = networkMapping[networkId];

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
    // Run the coinselector
    const selected = selectVaultUtxosDataMemo({
      utxosData,
      amount,
      vaultOutput,
      serviceOutput,
      changeOutput,
      feeRate,
      serviceFeeRate
    });
    if (!selected) return 'COINSELECT_ERROR';
    const vaultUtxosData = selected.vaultUtxosData;
    const vaultTargets = selected.targets;
    const vaultFee = selected.fee;
    if (vaultTargets[0]?.output !== vaultOutput)
      throw new Error("coinselect first output should be the vault's output");
    if (vaultTargets.length > 3)
      throw new Error(
        'coinselect ouputs should be vault, fee and change at most'
      );

    const feeRates = feeRateSampling({
      samples,
      maxSatsPerByte: feeRateCeiling
    });
    if (feeRates.length !== samples || feeRates.slice(-1)[0] !== feeRateCeiling)
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

    const vaultBalance = amount - selected.serviceFee;
    if (vaultBalance !== vaultTargets[0].value)
      throw new Error(
        'The coinselect algo should take into account service fee'
      );
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
    for (const target of vaultTargets) {
      target.output.updatePsbtAsOutput({
        psbt: psbtVault,
        value: target.value
      });
    }
    //Sign
    await signPsbt(signer, network, psbtVault);
    //Finalize
    vaultFinalizers.forEach(finalizer => finalizer({ psbt: psbtVault }));
    const txVault = psbtVault.extractTransaction(true);
    const vaultTxHex = txVault.toHex();
    if (txVault.virtualSize() > selected.vsize)
      throw new Error('vsize larger than coinselected estimated one');
    const feeRateVault = vaultFee / txVault.virtualSize();
    if (feeRateVault < 1) return 'UNKNOWN_ERROR';
    txMap[vaultTxHex] = {
      fee: vaultFee,
      feeRate: feeRateVault,
      txId: txVault.getId()
    };

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
    //Add the input (vaultOutput) to psbtTrigger as input:
    const triggerInputFinalizer = vaultOutput.updatePsbtAsInput({
      psbt: psbtTriggerBase,
      txHex: vaultTxHex,
      vout: 0
    });
    const feeTriggerArray: Array<number> = [];
    for (const [feeRateIndex, feeRateTrigger] of feeRates.entries()) {
      const psbtTrigger = psbtTriggerBase.clone();
      const feeTrigger = Math.ceil(
        feeRateTrigger * estimateTriggerTxSize(lockBlocks)
      );
      const triggerBalance = vaultBalance - feeTrigger;

      if (triggerBalance <= dustThreshold(triggerOutput)) {
        console.warn(
          `triggerBalance <= dust: ${triggerBalance} <= ${dustThreshold(triggerOutput)}`
        );
        return 'NOT_ENOUGH_FUNDS';
      }

      //Add the output to psbtTrigger:
      triggerOutput.updatePsbtAsOutput({
        psbt: psbtTrigger,
        value: triggerBalance
      });
      //Sign
      signers.signECPair({ psbt: psbtTrigger, ecpair: vaultPair });
      //Finalize (validate only 1st time - expensive calculation)
      triggerInputFinalizer({
        psbt: psbtTrigger,
        validate: feeRateIndex === 0
      });
      if (signaturesProcessed++ % 10 === 0) {
        if (onProgress(signaturesProcessed / (samples * samples)) === false)
          return 'USER_CANCEL';
        await sleep(0);
      }
      const txTrigger = psbtTrigger.extractTransaction(true);
      feeTriggerArray.push(feeTrigger); //TODO: wrong
      const triggerTxHex = txTrigger.toHex();
      const feeRate = feeTrigger / txTrigger.virtualSize();
      if (feeRate < 1) return 'UNKNOWN_ERROR';
      txMap[triggerTxHex] = {
        fee: feeTrigger,
        feeRate,
        txId: txTrigger.getId()
      };
      triggerMap[triggerTxHex] = [];
      const panicTxs = triggerMap[triggerTxHex];
      if (!panicTxs) throw new Error('Invalid assingment');

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
      const feePanicArray: Array<number> = [];
      for (const [feeRateIndex, feeRatePanic] of feeRates.entries()) {
        const psbtPanic = psbtPanicBase.clone();
        const feePanic = Math.ceil(
          feeRatePanic * estimatePanicTxSize(lockBlocks, coldAddress, network)
        );
        const panicBalance = triggerBalance - feePanic;

        if (panicBalance <= dustThreshold(coldOutput)) {
          console.warn(
            `panicBalance <= dust: ${panicBalance} <= ${dustThreshold(coldOutput)}`
          );
          return 'NOT_ENOUGH_FUNDS';
        }
        if (panicBalance < minPanicBalance) minPanicBalance = panicBalance;

        feePanicArray.push(feePanic);
        coldOutput.updatePsbtAsOutput({
          psbt: psbtPanic,
          value: triggerBalance - feePanic
        });
        //Sign
        signers.signECPair({ psbt: psbtPanic, ecpair: panicPair });
        //Finalize
        panicInputFinalizer({ psbt: psbtPanic, validate: feeRateIndex === 0 });
        if (signaturesProcessed++ % 10 === 0) {
          if (onProgress(signaturesProcessed / (samples * samples)) === false)
            return 'USER_CANCEL';
          await sleep(0);
        }
        const txPanic = psbtPanic.extractTransaction(true);
        const panicTxHex = txPanic.toHex();
        const feeRate = feePanic / txPanic.virtualSize();
        if (feeRate < 1) return 'UNKNOWN_ERROR';
        txMap[panicTxHex] = {
          fee: feePanic,
          feeRate,
          txId: txPanic.getId()
        };
        panicTxs.push(panicTxHex);
      }
    }
    //console.log({ signaturesProcessed, feeRatesN: feeRates.length });

    const vaultAddress = vaultOutput.getAddress();
    const triggerAddress = triggerOutput.getAddress();

    //Double check everything went smooth. This should never throw.
    for (const panicTxs of Object.values(triggerMap))
      if (panicTxs.length === 0)
        throw new Error(`Panic spending path has no solutions.`);

    return {
      networkId,
      vaultId: nextVaultId,
      vaultPath: nextVaultPath,
      amount,
      minPanicBalance,
      feeRateCeiling,
      vaultAddress,
      triggerAddress,
      vaultTxHex,
      unvaultKey,
      coldAddress,
      lockBlocks,
      triggerDescriptor,
      creationTime: Math.floor(Date.now() / 1000),
      triggerMap,
      txMap
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
export const estimatePanicTxSize = moize(
  (lockBlocks: number, coldAddress: string, network: Network) =>
    vsize(
      [
        new Output({
          descriptor: createTriggerDescriptor({
            unvaultKey: DUMMY_PUBKEY,
            panicKey: DUMMY_PUBKEY_2,
            lockBlocks
          }),
          signersPubKeys: [Buffer.from(DUMMY_PUBKEY_2, 'hex')],
          network
        })
      ],
      [new Output({ descriptor: createColdDescriptor(coldAddress), network })]
    ),
  { maxSize: 100 }
);

export function validateAddress(addressValue: string, network: Network) {
  try {
    address.toOutputScript(addressValue, network);
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * How many blocks must be waited for spending from a triggerUnvault tx?
 *
 * returns 'NOT_PUSHED' if the trigger tx has not been pushed yet
 * returns 'SPENT_AS_HOT'/'SPENT_AS_PANIC' if the trigger tx has already been spent.
 *
 * returns an integer lockBlocks >= remainingBlocks >= 0 with the number of
 * blocks the user must wait before pushing a tx so that they won't get
 * BIP68-non-final.
 *
 */
export function getRemainingBlocks(
  vault: Vault,
  vaultStatus: VaultStatus,
  blockhainTip: number
): 'NOT_PUSHED' | 'SPENT_AS_PANIC' | 'SPENT_AS_HOT' | number {
  if (vaultStatus.triggerTxBlockHeight === undefined) return 'NOT_PUSHED';
  if (vaultStatus.panicTxHex) return 'SPENT_AS_PANIC';
  if (vaultStatus.spendAsHotTxHex) return 'SPENT_AS_HOT';
  let remainingBlocks: number;
  const isTriggerInMempool = vaultStatus.triggerTxBlockHeight === 0;
  if (isTriggerInMempool) {
    remainingBlocks = vault.lockBlocks;
  } else {
    const blocksSinceTrigger = blockhainTip - vaultStatus.triggerTxBlockHeight;
    remainingBlocks = Math.max(
      0,
      //-1 because this means a tx can be pushed already since the new
      //block will be (blockHeight + 1)
      vault.lockBlocks - blocksSinceTrigger - 1
    );
  }
  return remainingBlocks;
}

export const getVaultVaultedBalance = (
  vault: Vault,
  vaultStatus: VaultStatus
) => {
  console.warn(
    'TODO - in fact here, first make sure that the vault was really pushed and is either mined or at least in the mempool'
  );
  if (
    vaultStatus.vaultTxBlockHeight === undefined ||
    vaultStatus.panicTxHex ||
    vaultStatus.spendAsHotTxHex
  )
    return 0;

  const vaultTx = Transaction.fromHex(vault.vaultTxHex);
  const vaultOutput = vaultTx.outs[0];
  if (!vaultOutput) throw new Error('Invalid out');

  const triggerTxHex = vaultStatus.triggerTxHex;
  //Not triggered yet:
  if (triggerTxHex === undefined) return vaultOutput.value;

  //Unvaulting triggered:
  const triggerFee = vault.txMap[triggerTxHex]?.fee;
  if (triggerFee === undefined)
    throw new Error('Trigger tx fee should have been set');

  return vaultOutput.value - triggerFee;
};

/**
 * When a new vault is created, vaults, vaultsStatuses are not
 * atomically set in state at the same time.
 * Wait until both are set before proceeding. This is important because
 * updateVaultsStatuses upddate status based on vaults so they must be
 * synched
 */
export const areVaultsSynched = (
  vaults: Vaults,
  vaultsStatuses: VaultsStatuses
) => {
  return shallowEqualArrays(Object.keys(vaults), Object.keys(vaultsStatuses));
};

export const getVaultsVaultedBalance = moize(
  (vaults: Vaults, vaultsStatuses: VaultsStatuses) => {
    let totalVaulted = 0;
    Object.entries(vaults).map(([vaultId, vault]) => {
      const vaultStatus = vaultsStatuses[vaultId];
      if (!vaultStatus)
        throw new Error(
          `vaultsStatuses is not synchd. It should have key ${vaultId}`
        );
      const vaulted = getVaultVaultedBalance(vault, vaultStatus);
      totalVaulted += vaulted;
    });
    return totalVaulted;
  }
);

/**
 * Retrieve all the trigger descriptors which are currently:
 *  -hot: they are currently spendable.
 *    This means the current blockhainTip is over lockBlocks and it has not been
 *    spent.
 *  -spent
 *  -notTriggered
 *  -defreezing
 */
const getHotTriggerDescriptors = (
  vaults: Vaults,
  vaultsStatuses: VaultsStatuses,
  blockhainTip: number
): Array<string> => {
  const descriptors = Object.entries(vaults)
    .filter(([vaultId, vault]) => {
      const vaultStatus = vaultsStatuses[vaultId];
      if (!vaultStatus)
        throw new Error(
          `vaultsStatuses is not synchd. It should have key ${vaultId}`
        );
      return getRemainingBlocks(vault, vaultStatus, blockhainTip) === 0;
    })
    .map(([, vault]) => vault.triggerDescriptor);

  // Check for duplicates
  const descriptorSet = new Set(descriptors);
  if (descriptorSet.size !== descriptors.length) {
    throw new Error(
      'triggerDescriptors should be unique; panicKey should be random'
    );
  }
  return descriptors;
};

const spendingTxCache = new Map();
/**
 * Returns the tx that spent a Tx Output (or it's in the mempool about to spend it).
 * If it's in the mempool this is marked by setting blockHeight to zero.
 * This function will return early if last result was irreversible */
export async function fetchSpendingTx(
  txHex: string,
  vout: number,
  explorer: Explorer
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
  const history = await explorer.fetchTxHistory({ scriptHash });

  for (let i = 0; i < history.length; i++) {
    const txData = history[i];
    if (!txData) throw new Error('Invalid history');
    //const irreversible = txData.irreversible;
    //console.log({ irreversible });
    //Check if this specific tx was spending my output:
    const historyTxHex = await explorer.fetchTx(txData.txId);
    const txHistory = Transaction.fromHex(historyTxHex);
    //For all the inputs in the tx see if one of them was spending from vout and txId
    const found = txHistory.ins.some(input => {
      const inputPrevtxId = Buffer.from(input.hash).reverse().toString('hex');
      const inputPrevOutput = input.index;
      return inputPrevtxId === tx.getId() && inputPrevOutput === vout;
    });
    if (found) {
      const spendingTx = {
        txHex: historyTxHex,
        irreversible: txData.irreversible,
        blockHeight: txData.blockHeight
      };
      spendingTxCache.set(cacheKey, spendingTx);
      return spendingTx;
    }
  }
  return;
}

const vaultTxCache = new Map();
async function fetchVaultTx(
  vaultAddress: string,
  vaultTxHex: string,
  explorer: Explorer
): Promise<{ irreversible: boolean; blockHeight: number } | undefined> {
  const cachedResult = vaultTxCache.get(vaultAddress);
  // Check if cached result exists and is irreversible, then return it
  if (cachedResult && cachedResult.irreversible) return cachedResult;
  const vaultTxId = Transaction.fromHex(vaultTxHex).getId();
  const history = await explorer.fetchTxHistory({ address: vaultAddress });

  const vaultTx = history.find(txCandidate => txCandidate.txId === vaultTxId);
  if (vaultTx) {
    vaultTxCache.set(vaultAddress, vaultTx);
    return vaultTx;
  }
  return;
}

/**
 * Note that vaultsStatuses fetched are only partial since
 * vaultPushTime, triggerPushTime, panicPushTime and unvaultPushTime cannot be
 * retrieved from the network.
 */
async function fetchVaultStatus(
  vault: Vault,
  currvaultStatus: VaultStatus | undefined,
  explorer: Explorer
) {
  const newVaultStatus: VaultStatus = currvaultStatus
    ? { ...currvaultStatus }
    : {};
  const vaultTxData = await fetchVaultTx(
    vault.vaultAddress,
    vault.vaultTxHex,
    explorer
  );
  if (vaultTxData) newVaultStatus.vaultTxBlockHeight = vaultTxData.blockHeight;

  const triggerTxData = await fetchSpendingTx(vault.vaultTxHex, 0, explorer);
  if (triggerTxData) {
    newVaultStatus.triggerTxHex = triggerTxData.txHex;
    newVaultStatus.triggerTxBlockHeight = triggerTxData.blockHeight;
    const unlockingTxData = await fetchSpendingTx(
      triggerTxData.txHex,
      0,
      explorer
    );
    if (unlockingTxData) {
      // Now let's see if this was a panic or spending as hot:
      const panicTxs = vault.triggerMap[triggerTxData.txHex];
      if (!panicTxs) throw new Error('Invalid triggerMap');
      const panicTxHex = panicTxs.find(
        txHex => txHex === unlockingTxData.txHex
      );

      if (panicTxHex) {
        newVaultStatus.panicTxHex = unlockingTxData.txHex;
        newVaultStatus.panicTxBlockHeight = unlockingTxData.blockHeight;
      } else {
        newVaultStatus.spendAsHotTxHex = unlockingTxData.txHex;
        newVaultStatus.spendAsHotTxBlockHeight = unlockingTxData.blockHeight;
      }
    }
  }
  return newVaultStatus;
}

/**
 * performs a fetchVaultStatus for all vaults in parallel
 * Note that vaultsStatuses fetched are only partial since
 * vaultPushTime, triggerPushTime, panicPushTime and unvaultPushTime cannot be
 * retrieved from the network. We add them back using currvaultStatus if they
 * exist.
 */
export async function fetchVaultsStatuses(
  vaults: Vaults,
  currVaultStatuses: VaultsStatuses,
  explorer: Explorer
): Promise<VaultsStatuses> {
  const fetchPromises = Object.entries(vaults).map(async ([vaultId, vault]) => {
    const status = await fetchVaultStatus(
      vault,
      currVaultStatuses[vaultId],
      explorer
    );
    return { [vaultId]: status };
  });

  const results = await Promise.all(fetchPromises);
  return results.reduce((acc, current) => {
    const vaultAddress = Object.keys(current)[0];
    if (vaultAddress === undefined) throw new Error('vaultAddress undefined');
    const vaultStatus = current[vaultAddress];
    if (vaultStatus === undefined) throw new Error('vaultStatus undefined');
    acc[vaultAddress] = vaultStatus;
    return acc;
  }, {});
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

/**
 * returns all the descriptors which can be spent right now (hot)
 * This includes: spendable vaults, change and external
 */
export const getHotDescriptors = (
  vaults: Vaults,
  vaultsStatuses: VaultsStatuses,
  accounts: Accounts,
  blockhainTip: number
) => {
  if (!areVaultsSynched(vaults, vaultsStatuses))
    throw new Error('vaults and statuses not synched');
  if (Object.keys(vaults).length && !Object.keys(accounts))
    throw new Error('vaults set for non-existing accounts');
  const descriptors: Array<string> = [];
  for (const account of Object.keys(accounts))
    descriptors.push(account, account.replace(/\/0\/\*/g, '/1/*'));

  if (descriptors.length)
    //No need to do extra computations. If there are no
    //accounts, then there are no vaults
    descriptors.push(
      ...getHotTriggerDescriptors(vaults, vaultsStatuses, blockhainTip)
    );
  return descriptors;
};
