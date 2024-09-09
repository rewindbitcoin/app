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
import { transactionFromHex } from './bitcoin';

export type TxHex = string;
export type TxId = string;

export type VaultSettings = {
  /** transactionAmount + minerFees = total user spendings = value extracted from user utxos
   * vaultedAmount = tansactionAmount - serviceFee
   */
  vaultedAmount: number;
  coldAddress: string;
  feeRate: number;
  lockBlocks: number;
};

export type Vault = {
  /** vaultId and vaultPath universally identify this vault.
   *
   *  const vaultPath = VAULT_PATH.replace(
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
  /**
   * the mining fee of the initial vaulting tx
   */
  vaultFee: number;
  vaultPath: string;
  /** Per definition, transactionAmount includes serviceFee. In other words:
   *  - There is an output with value: (transactionAmount - serviceFee).
   *    Note that the second output for serviceFee is sometimes not set.
   *    See: selectVaultUtxosData.
   *  - There is another output with value: serviceFee
   *  - and maybe there an additional output with change.
   *  So, the user will pay transactionAmount + miner fee.
   */
  serviceFee: number;
  /**
   * the vaulted amount after the vaultTxHex has been mined. It already excludes
   * serviceFee. Note that serviceFee is not always set.
   */
  vaultedAmount: number;

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
  minPanicAmount: number;

  /**
   * the keyExpression for the unlocking using the unvaulting path
   **/
  unvaultKey: string; //This is an input in createVault
  triggerDescriptor: string; //This is an outout since the panicKey is randoml generated here

  creationTime: number;
};

export type VaultStatus = {
  /**
   * whether to show it isHidden !== true or not
   */
  isHidden?: boolean;

  /**
   * if vaultTxBlockHeight is not set then it's because it was never pushed
   * or because it expired or was RBFd
   */
  vaultTxBlockHeight?: number;
  vaultTxBlockTime?: number;

  /**
   * tx, height & unix time when the vault unfreeze trigger was mined.
   * If these are not set, then the other times and heights below cannot be
   * computed and will be undefined.
   */
  triggerTxHex?: string;
  triggerTxBlockHeight?: number;
  triggerTxBlockTime?: number;

  /**
   * These are the block height & timestamp for
   * (triggerTxBlockHeight + lockBlocks)
   * Note that hotBlockTime can only be retrieved when the blockchain tip is
   * equal or above (triggerTxBlockHeight + lockBlocks).
   * The two props below are set if and only if:
   *  - triggerTx has been mined
   *  - and the tip is equal or above (triggerTxBlockHeight + lockBlocks)
   */
  hotBlockHeight?: number;
  hotBlockTime?: number;

  panicTxHex?: string; //Maybe the samer as unlockingTxHex or not
  panicTxBlockHeight?: number;
  panicTxBlockTime?: number;

  //If it was spent as hot:
  spendAsHotTxHex?: string;
  spendAsHotTxBlockHeight?: number;
  spendAsHotTxBlockTime?: number;

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
  version: 'rewbtc_rescue_v0';
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

type VaultPresignedTx = {
  txId: TxId;
  blockHeight: number;
  blockTime?: number; //when blockHeight !== 0
  tx: Transaction;
  /**
   * TRIGGER_EXTERNAL when the triggertx is not part of the hot wallet:
   *  - while the trigger tx output cannot be spent by the hot wallet (it's waiting)
   *  - if the output of the trigger tx was spent as rescue
   *
   * TRIGGER_HOT_WALLET when this tx is part of the hot wallet:
   *  - the output of the triggertx is an utxo of the hot wallet
   *  - the output of the triggrertx was an utxo of the hot wallet and was spent
   *    as hot
   */
  vaultTxType: 'TRIGGER_EXTERNAL' | 'RESCUE' | 'VAULT' | 'TRIGGER_HOT_WALLET';
  outValue: number; //The amount in the vout[0] in sats. F.ex.: for 'VAULT' is the vaulted amount after mining fees and servive fees. For 'TRIGGER_*' is the amount that will become ready for the user and for 'RESCUE' the available amount after rescuing.
  vaultId: string;
  vaultNumber: number;
  pushTime?: number; //when pushed using this wallet
  spentAsPanic?: 'CONFIRMING' | 'CONFIRMED'; //set only if this vault was spent as panic
};
export type HistoryDataItem =
  //hot wallet normal Transactions (not associated with the Vaults):
  | (TxAttribution & { tx: Transaction })

  // Vault-related presigned txs that are not part of the hot wallet:
  // 'RESCUE' and 'TRIGGER_EXTERNAL':
  | VaultPresignedTx

  // Vault-related presigned txs that are also part of the hot wallet
  // ('VAULT' and 'TRIGGER_HOT_WALLET'):
  | (TxAttribution & VaultPresignedTx);

export type HistoryData = Array<HistoryDataItem>;

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
 * the discoveryExport internal representation in any way, so there is no need
 * to save to disk exported discoveryExport after using this function.
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

const getVaultNumber = moize((vaultId: string, vaults: Vaults) => {
  const sortedVaults = Object.values(vaults).sort(
    (a, b) => b.creationTime - a.creationTime
  );
  const index = sortedVaults.findIndex(vault => vault.vaultId === vaultId);
  if (index === -1) throw new Error(`Vault with ID ${vaultId} not found`);
  return sortedVaults.length - index;
});

/**
 * Returns an array of TxAttribution including also the Transaction.
 * In addition it also adds all vaults presigned txs with their corresponding
 * statuses.
 *
 * It returns txs in an Array ordered from old to new.
 *
 * Note here we use moize vs memoize in getUtxosData, since in this case, when
 * vaultsStatuses change, then the history also changes, since in the history
 * we not only provide the history of the hot descriptors but also the
 * different stages of a vault (as recorded in vaultsStatuses).
 */
export const getHistoryData = moize(
  (
    /**
     * this is the history of the hot descriptors only
     * hot descriptors include trigger descriptors only when they are spendable
     */
    hotHistory: Array<TxAttribution>,
    vaults: Vaults,
    vaultsStatuses: VaultsStatuses,
    discovery: DiscoveryInstance
  ): HistoryData => {
    if (!areVaultsSynched(vaults, vaultsStatuses))
      throw new Error('getHistoryData: vaults and statuses not synched');
    const historyData: HistoryData = [];

    const vaultTxs: Map<TxId, VaultPresignedTx> = new Map();
    const triggerExternalTxs: Map<TxId, VaultPresignedTx> = new Map();
    const triggerHotWalletTxs: Map<TxId, VaultPresignedTx> = new Map();
    const panicTxs: Map<TxId, VaultPresignedTx> = new Map();

    Object.entries(vaultsStatuses).forEach(([vaultId, vaultStatus]) => {
      const vault = vaults[vaultId];
      if (!vault) throw new Error('Vault unsynchd');
      const vaultTxHex = vault.vaultTxHex;
      const triggerTxHex = vaultStatus.triggerTxHex;
      const panicTxHex = vaultStatus.panicTxHex;
      const vaultNumber = getVaultNumber(vaultId, vaults);
      if (vaultStatus.vaultTxBlockHeight !== undefined) {
        // vaultTxBlockHeight may be undefined if VAULT_NOT_FOUND
        const { txId, tx } = transactionFromHex(vaultTxHex);
        const outValue = tx.outs[0]?.value;
        if (outValue === undefined) throw new Error('Unset output');
        const pushTime = vaultStatus.vaultPushTime;
        const blockTime = vaultStatus.vaultTxBlockTime;
        vaultTxs.set(txId, {
          txId,
          blockHeight: vaultStatus.vaultTxBlockHeight,
          ...(blockTime !== undefined ? { blockTime } : {}),
          tx,
          vaultTxType: 'VAULT',
          vaultId,
          vaultNumber,
          outValue,
          ...(pushTime !== undefined ? { pushTime } : {})
        });
      }
      if (triggerTxHex) {
        const { txId, tx } = transactionFromHex(triggerTxHex);
        const outValue = tx.outs[0]?.value;
        if (outValue === undefined) throw new Error('Unset output');
        const pushTime = vaultStatus.triggerPushTime;
        const blockTime = vaultStatus.triggerTxBlockTime;
        const blockHeight = vaultStatus.triggerTxBlockHeight;
        if (blockHeight === undefined)
          throw new Error('Unset trigger blockHeight');
        //TODO: this "some" call below is potentially slow
        const vaultTxType = hotHistory.some(hotEntry => hotEntry.txId === txId)
          ? 'TRIGGER_HOT_WALLET'
          : 'TRIGGER_EXTERNAL';
        const triggerTxs =
          vaultTxType === 'TRIGGER_HOT_WALLET'
            ? triggerHotWalletTxs
            : triggerExternalTxs;
        triggerTxs.set(txId, {
          txId,
          blockHeight,
          ...(vaultStatus.panicTxBlockHeight !== undefined
            ? {
                spentAsPanic:
                  vaultStatus.panicTxBlockHeight === 0
                    ? 'CONFIRMING'
                    : 'CONFIRMED'
              }
            : {}),
          ...(blockTime !== undefined ? { blockTime } : {}),
          tx,
          vaultTxType,
          vaultId,
          vaultNumber,
          outValue,
          ...(pushTime !== undefined ? { pushTime } : {})
        });
      }
      if (panicTxHex) {
        const { txId, tx } = transactionFromHex(panicTxHex);
        const outValue = tx.outs[0]?.value;
        if (outValue === undefined) throw new Error('Unset output');
        const pushTime = vaultStatus.panicPushTime;
        const blockTime = vaultStatus.panicTxBlockTime;
        const blockHeight = vaultStatus.panicTxBlockHeight;
        if (blockHeight === undefined)
          throw new Error('Unset panic blockHeight');
        panicTxs.set(txId, {
          txId,
          blockHeight,
          ...(blockTime !== undefined ? { blockTime } : {}),
          tx,
          vaultTxType: 'RESCUE',
          vaultId,
          vaultNumber,
          outValue,
          ...(pushTime !== undefined ? { pushTime } : {})
        });
      }
    });

    //Merge all the 'TRIGGER_HOT_WALLET' and the 'VAULT'. Those are part of
    //hotHistory already
    hotHistory.forEach(txAttribution => {
      const txId = txAttribution.txId;
      const tx = discovery.getTransaction({ txId });
      const vaultTx = vaultTxs.get(txId);
      const triggerHotWalletTx = triggerHotWalletTxs.get(txId);
      const historyEntry = {
        ...txAttribution,
        tx,
        ...(vaultTx ? vaultTx : {}),
        ...(triggerHotWalletTx ? triggerHotWalletTx : {})
      };
      historyData.push(historyEntry);
    });
    //Add the remainig 'RESCUE' AND 'TRIGGER_EXTERNAL'
    triggerExternalTxs.forEach(triggerExternalTx =>
      historyData.push(triggerExternalTx)
    );
    panicTxs.forEach(panicTx => historyData.push(panicTx));

    return (
      historyData
        //ascending pushTime order (old to new). Only apply if pushTime is known
        .sort((txA, txB) =>
          'pushTime' in txA &&
          'pushTime' in txB &&
          txA.blockHeight === 0 &&
          txB.blockHeight === 0
            ? txA.pushTime - txB.pushTime
            : 0
        )
        //Use the final sorting method from discovery (takes into account
        //blockHeight and tx dependencies
        .sort(discovery.compareTxOrder.bind(discovery))
    );
  }
);

export const getOutputsWithValue = memoize((utxosData: UtxosData) =>
  utxosData.map(utxo => {
    const out = utxo.tx.outs[utxo.vout];
    if (!out) throw new Error('Invalid utxo');
    return { output: utxo.output, value: out.value };
  })
);

export const calculateServiceFee = ({
  serviceFeeRate,
  serviceOutput,
  vaultedAmount
}: {
  serviceFeeRate: number;
  serviceOutput: OutputInstance;
  vaultedAmount: number;
}) => {
  return serviceFeeRate
    ? Math.max(
        dustThreshold(serviceOutput) + 1,
        Math.floor(serviceFeeRate * vaultedAmount)
      )
    : 0;
};

/**
 * splitTransactionAmount makes sure serviceFee and vaultedAmount are
 * above dust, otherwise undefined is returned.
 * If serviceFeeRate is zero, then serviceFee is also zero and it is assumed
 * the vault won't have a serviceFee output.
 * So:
 *  - serviceFee will be at least dust + 1
 *  - if serviceFee makes the vaultedAmount to be <= its own dust limit
 * then return zero
 */
export const splitTransactionAmount = ({
  transactionAmount,
  vaultOutput,
  serviceOutput,
  serviceFeeRate
}: {
  transactionAmount: number;
  vaultOutput: OutputInstance;
  serviceOutput: OutputInstance;
  serviceFeeRate: number;
}) => {
  // transactionAmount = serviceFee + vaultedAmount
  // serviceFee = serviceFeeRate * vaultedAmount
  // =>
  //
  //
  // transactionAmount = serviceFee + (serviceFee / serviceFeeRate)
  //        = serviceFee * (1 + 1/serviceFeeRate) =
  //        = serviceFee * (serviceFeeRate + 1) / serviceFeeRate
  // =>
  // serviceFee = transactionAmount * serviceFeeRate / (1 + serviceFeeRate)
  // serviceFee / serviceFeeRate = vaultedAmount = transactionAmount / (1 + serviceFeeRate)

  const serviceFee = calculateServiceFee({
    serviceOutput,
    serviceFeeRate,
    vaultedAmount: transactionAmount / (1 + serviceFeeRate)
  });
  const vaultedAmount = transactionAmount - serviceFee;
  if (vaultedAmount <= dustThreshold(vaultOutput)) return;
  else return { vaultedAmount, serviceFee, transactionAmount };
};

/**
 * The vault coinselector
 */

const selectVaultUtxosData = ({
  utxosData,
  vaultOutput,
  serviceOutput,
  changeOutput,
  vaultedAmount,
  feeRate,
  serviceFeeRate
}: {
  utxosData: UtxosData;
  vaultOutput: OutputInstance;
  serviceOutput: OutputInstance;
  changeOutput: OutputInstance;
  /** vaultedAmount = transactionAmount - serviceFee
   * The user spends transactionAmount `+ minerFees -> this vaults a total of vaultedAmount
   * In other words, transactionAmount = vaultedAmount + serviceFee
   */
  vaultedAmount: number;
  feeRate: number;
  serviceFeeRate: number;
}) => {
  const utxos = getOutputsWithValue(utxosData);
  if (vaultedAmount <= dustThreshold(vaultOutput)) return;
  const serviceFee = calculateServiceFee({
    vaultedAmount,
    serviceFeeRate,
    serviceOutput
  });
  const coinselected = coinselect({
    utxos,
    targets: [
      { output: vaultOutput, value: vaultedAmount },
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

//createVault does not throw. It returns errors as strings:
export async function createVault({
  vaultedAmount,
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
  /** transactionAmount includes vaultedAmount + serviceFee */
  vaultedAmount: number;
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
    let minPanicAmount = vaultedAmount; //Initialize to a large value

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
      vaultedAmount,
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

    if (vaultedAmount !== vaultTargets[0].value)
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
    for (const [feeRateIndex, feeRateTrigger] of feeRates.entries()) {
      const psbtTrigger = psbtTriggerBase.clone();
      const feeTrigger = Math.ceil(
        feeRateTrigger * estimateTriggerTxSize(lockBlocks)
      );
      const triggerAmount = vaultedAmount - feeTrigger;

      if (triggerAmount <= dustThreshold(triggerOutput)) {
        console.warn(
          `triggerAmount <= dust: ${triggerAmount} <= ${dustThreshold(triggerOutput)}`
        );
        return 'NOT_ENOUGH_FUNDS';
      }

      //Add the output to psbtTrigger:
      triggerOutput.updatePsbtAsOutput({
        psbt: psbtTrigger,
        value: triggerAmount
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
      for (const [feeRateIndex, feeRatePanic] of feeRates.entries()) {
        const psbtPanic = psbtPanicBase.clone();
        const feePanic = Math.ceil(
          feeRatePanic * estimatePanicTxSize(lockBlocks, coldAddress, network)
        );
        const panicAmount = triggerAmount - feePanic;

        if (panicAmount <= dustThreshold(coldOutput)) {
          console.warn(
            `panicAmount <= dust: ${panicAmount} <= ${dustThreshold(coldOutput)}`
          );
          return 'NOT_ENOUGH_FUNDS';
        }
        if (panicAmount < minPanicAmount) minPanicAmount = panicAmount;

        coldOutput.updatePsbtAsOutput({
          psbt: psbtPanic,
          value: triggerAmount - feePanic
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

    if (minPanicAmount === vaultedAmount)
      throw new Error('Could not find minPanicAmount');
    return {
      networkId,
      vaultId: nextVaultId,
      vaultPath: nextVaultPath,
      vaultFee,
      serviceFee: calculateServiceFee({
        vaultedAmount,
        serviceOutput,
        serviceFeeRate
      }),
      vaultedAmount,
      minPanicAmount,
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
 * returns 'VAULT_NOT_FOUND' if vaultTxBlockHeight is not set; when not set
 * it's because the vault was never pushed or because it expired or was RBFd
 * returns 'TRIGGER_NOT_PUSHED' if the trigger tx has not been pushed yet
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
):
  | 'VAULT_NOT_FOUND'
  | 'TRIGGER_NOT_PUSHED'
  | 'SPENT_AS_PANIC'
  | 'SPENT_AS_HOT'
  | number {
  if (vaultStatus.vaultTxBlockHeight === undefined) return 'VAULT_NOT_FOUND';
  if (vaultStatus.triggerTxBlockHeight === undefined)
    return 'TRIGGER_NOT_PUSHED';
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

/**
 *
 * If remainingBlocks is zero this function returns zero vaulted amount
 * vaulted amount = frozen balance = balance that is not hot
 *
 * When the trigger as been init (and while it's still locked), this function
 * substracts the trigger tx fee from the balance.
 *
 * This is per definition.
 */

export const getVaultFrozenBalance = (
  vault: Vault,
  vaultStatus: VaultStatus,
  blockchainTip: number
) => {
  const remainingBlocks = getRemainingBlocks(vault, vaultStatus, blockchainTip);
  if (
    vaultStatus.vaultTxBlockHeight === undefined ||
    vaultStatus.panicTxHex ||
    vaultStatus.spendAsHotTxHex ||
    remainingBlocks === 0
  )
    return 0;

  const triggerTxHex = vaultStatus.triggerTxHex;
  //Not triggered yet:
  if (triggerTxHex === undefined) return vault.vaultedAmount;

  //Unvaulting triggered:
  const triggerFee = vault.txMap[triggerTxHex]?.fee;
  if (triggerFee === undefined)
    throw new Error('Trigger tx fee should have been set');

  return vault.vaultedAmount - triggerFee;
};
/**
 * Returns the vault current hot amount or the hot amount this vault
 * ever had before being spent as hot
 */
export const getVaultUnfrozenBalance = (
  vault: Vault,
  vaultStatus: VaultStatus,
  blockchainTip: number
) => {
  const remainingBlocks = getRemainingBlocks(vault, vaultStatus, blockchainTip);
  if (
    vaultStatus.vaultTxBlockHeight === undefined ||
    vaultStatus.panicTxHex ||
    !vaultStatus.triggerTxHex ||
    (typeof remainingBlocks === 'number' && remainingBlocks > 0)
  )
    return 0;

  //Unvaulting triggered:
  const triggerFee = vault.txMap[vaultStatus.triggerTxHex]?.fee;
  if (triggerFee === undefined)
    throw new Error('Trigger tx fee should have been set');

  return vault.vaultedAmount - triggerFee;
};
/**
 * Returns the vault rescued amount
 */
export const getVaultRescuedBalance = (
  vault: Vault,
  vaultStatus: VaultStatus
) => {
  if (!vaultStatus.panicTxHex) return 0;

  if (!vaultStatus.triggerTxHex)
    throw new Error('triggerTxHex unset for a panicTxHex');
  //Unvaulting triggered:
  const triggerFee = vault.txMap[vaultStatus.triggerTxHex]?.fee;
  if (triggerFee === undefined)
    throw new Error('Trigger tx fee should have been set');

  const panicFee = vault.txMap[vaultStatus.panicTxHex]?.fee;
  if (panicFee === undefined)
    throw new Error('Panic tx fee should have been set');

  return vault.vaultedAmount - triggerFee - panicFee;
};

/**
 * When a new vault is created, vaults, vaultsStatuses are not
 * atomically set in state at the same time.
 * Wait until both are set before proceeding. This is important because
 * updateVaultsStatuses upddate status based on vaults so they must be
 * synched
 *
 * If remainingBlocks is zero this function returns zero vaulted balance
 * vaulted balance = frozen balance = balance that is not hot
 *
 * This is per definition.
 */
export const areVaultsSynched = (
  vaults: Vaults,
  vaultsStatuses: VaultsStatuses
) => {
  return shallowEqualArrays(Object.keys(vaults), Object.keys(vaultsStatuses));
};

export const getVaultsFrozenBalance = moize(
  (
    vaults: Vaults,
    vaultsStatuses: VaultsStatuses,

    blockchainTip: number
  ) => {
    let totalVaulted = 0;
    Object.entries(vaults).map(([vaultId, vault]) => {
      const vaultStatus = vaultsStatuses[vaultId];
      if (!vaultStatus)
        throw new Error(
          `vaultsStatuses is not synchd. It should have key ${vaultId}`
        );
      const vaulted = getVaultFrozenBalance(vault, vaultStatus, blockchainTip);
      totalVaulted += vaulted;
    });
    return totalVaulted;
  }
);

/**
 * Retrieve all the trigger descriptors which form part of the hot wallet, that
 * is, they are:
 *  -they are currently spendable: This means the current blockhainTip is over
 *  lockBlocks and it has not been spent.
 *  -they used to be spendable as hot and were spent as hot.
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
      const remainingBlocks = getRemainingBlocks(
        vault,
        vaultStatus,
        blockhainTip
      );
      return remainingBlocks === 0 || remainingBlocks === 'SPENT_AS_HOT';
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
async function fetchSpendingTx(
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

  const { tx, txId } = transactionFromHex(txHex);

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
    const { tx: txHistory } = transactionFromHex(historyTxHex);
    //For all the inputs in the tx see if one of them was spending from vout and txId
    const found = txHistory.ins.some(input => {
      const inputPrevtxId = Buffer.from(input.hash).reverse().toString('hex');
      const inputPrevOutput = input.index;
      return inputPrevtxId === txId && inputPrevOutput === vout;
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
  const { txId: vaultTxId } = transactionFromHex(vaultTxHex);
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
    ? {
        ...(currvaultStatus.isHidden !== undefined && {
          isHidden: currvaultStatus.isHidden
        }),
        ...(currvaultStatus.vaultPushTime !== undefined && {
          vaultPushTime: currvaultStatus.vaultPushTime
        }),
        ...(currvaultStatus.triggerPushTime !== undefined && {
          triggerPushTime: currvaultStatus.triggerPushTime
        }),
        ...(currvaultStatus.panicPushTime !== undefined && {
          panicPushTime: currvaultStatus.panicPushTime
        }),
        ...(currvaultStatus.unvaultPushTime !== undefined && {
          unvaultPushTime: currvaultStatus.unvaultPushTime
        })
      }
    : {};
  const vaultTxData = await fetchVaultTx(
    vault.vaultAddress,
    vault.vaultTxHex,
    explorer
  );
  if (vaultTxData) {
    if (
      currvaultStatus?.isHidden &&
      currvaultStatus.vaultTxBlockHeight === undefined
    )
      //If the user hid the vault because it was VAULT_NOT_FOUND but then all
      //of a sudden we find it again in the blockchain, then show it!
      newVaultStatus.isHidden = false;
    newVaultStatus.vaultTxBlockHeight = vaultTxData.blockHeight;
    if (newVaultStatus.vaultTxBlockHeight !== 0) {
      const vaultBlockStatus = await explorer.fetchBlockStatus(
        newVaultStatus.vaultTxBlockHeight
      );
      if (!vaultBlockStatus)
        throw new Error(
          `Block status should exist for existing block height: ${newVaultStatus.vaultTxBlockHeight}`
        );
      newVaultStatus.vaultTxBlockTime = vaultBlockStatus.blockTime;
    }
  }

  const triggerTxData = await fetchSpendingTx(vault.vaultTxHex, 0, explorer);
  if (triggerTxData) {
    newVaultStatus.triggerTxHex = triggerTxData.txHex;
    newVaultStatus.triggerTxBlockHeight = triggerTxData.blockHeight;
    if (newVaultStatus.triggerTxBlockHeight !== 0) {
      const triggerBlockStatus = await explorer.fetchBlockStatus(
        newVaultStatus.triggerTxBlockHeight
      );
      if (!triggerBlockStatus)
        throw new Error(
          `Block status should exist for existing block height: ${newVaultStatus.triggerTxBlockHeight}`
        );
      newVaultStatus.triggerTxBlockTime = triggerBlockStatus.blockTime;
      const hotBlockHeight =
        newVaultStatus.triggerTxBlockHeight + vault.lockBlocks;
      const hotVaultStatus = await explorer.fetchBlockStatus(hotBlockHeight);
      if (hotVaultStatus) {
        newVaultStatus.hotBlockHeight = hotBlockHeight;
        newVaultStatus.hotBlockTime = hotVaultStatus.blockTime;
      }
    }
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
        if (newVaultStatus.panicTxBlockHeight !== 0) {
          const panicBlockStatus = await explorer.fetchBlockStatus(
            newVaultStatus.panicTxBlockHeight
          );
          if (!panicBlockStatus)
            throw new Error(
              `Block status should exist for existing block height: ${newVaultStatus.panicTxBlockHeight}`
            );
          newVaultStatus.panicTxBlockTime = panicBlockStatus.blockTime;
        }
      } else {
        newVaultStatus.spendAsHotTxHex = unlockingTxData.txHex;
        newVaultStatus.spendAsHotTxBlockHeight = unlockingTxData.blockHeight;
        if (newVaultStatus.spendAsHotTxBlockHeight !== 0) {
          const spendAsHotBlockStatus = await explorer.fetchBlockStatus(
            newVaultStatus.spendAsHotTxBlockHeight
          );
          if (!spendAsHotBlockStatus)
            throw new Error(
              `Block status should exist for existing block height: ${newVaultStatus.spendAsHotTxBlockHeight}`
            );
          newVaultStatus.spendAsHotTxBlockTime =
            spendAsHotBlockStatus.blockTime;
        }
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
            vaultedAmount,
            feeRate,
            serviceFeeRate
          }: {
            vaultedAmount: number;
            feeRate: number;
            serviceFeeRate: number;
          }) =>
            selectVaultUtxosData({
              utxosData,
              vaultOutput,
              serviceOutput,
              changeOutput,
              vaultedAmount,
              feeRate,
              serviceFeeRate
            }),
          ({ vaultedAmount, feeRate, serviceFeeRate }) =>
            JSON.stringify({ vaultedAmount, feeRate, serviceFeeRate })
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
  vaultedAmount,
  feeRate,
  serviceFeeRate
}: {
  utxosData: UtxosData;
  vaultOutput: OutputInstance;
  serviceOutput: OutputInstance;
  changeOutput: OutputInstance;
  vaultedAmount: number;
  feeRate: number;
  serviceFeeRate: number;
}) =>
  selectVaultUtxosDataFactory(utxosData)(vaultOutput)(serviceOutput)(
    changeOutput
  )({
    vaultedAmount,
    feeRate,
    serviceFeeRate
  });
export { selectVaultUtxosDataMemo as selectVaultUtxosData };

/**
 * returns all the descriptors which can be spent right now (hot) or which
 * were spent as hot already.
 * This includes: spendable unfrozen vaults, spent vaults as hot, change and
 * external.
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
