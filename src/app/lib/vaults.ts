// Copyright (C) 2025 Jose-Luis Landabaso - https://rewindbitcoin.com
// Licensed under the GNU GPL v3 or later. See the LICENSE file for details.

//FIXME: note that once a vault is created (f.ex. using P2A_TRUC or
//P2A_NON_TRUC) then its very important that the flow regarding this vault
//(acceletations (for trigger/rescue), init trigger, rescue and any other) keep
//using the same P2A mode as initiated
//even if the user later changes the mode in Settings. One can infer the mode
//dynamically by analyzing the triggerTx stored f.ex. Is this being done/Applied?
//
//TODO: keep anchor buffer
//
//TODO: in demo mode, Tape should send a couple of utxos so that its
//possible to do a quick -> create vault -> init trigger -> rescue

// TODO: very imporant to only allow Vaulting funds with 1 confirmatin at least (make this a setting) - test realistic vaults (P2A_TRUC)
//
//FIXME: the Fee bump message with "Accelerate" is confussing. We use "Accelerate"
//for the RBF to accelerate rescue/init trigger presigned txs.
//The tx with the rocker icon shows the tx that is the child used to boost the
//package
//TODO: verify the the final txs are built with in vault, acceleration, CPFP are
//done with the requested fee rate. not the absolute fee computed, since the
//signatures sizes will change after signing. vsize assumes signatures of 72
//bytes but they can also be 71
//FIXME: what if the reserve cannot provide enough funds to trigger the
//tx? does the app provide a way to add funds or use internal utxos?
const PUSH_TIMEOUT = 30 * 60; // 30 minutes

import { type Network, type Transaction, Psbt } from 'bitcoinjs-lib';
import { fromHex, toHex } from 'uint8array-tools';
import memoize from 'lodash.memoize';
import { SOFTWARE, type Accounts, type Signer } from './wallets';
import moize from 'moize';

import {
  keyExpressionBIP32,
  type OutputInstance,
  signers
} from '@bitcoinerlab/descriptors';
import { ensureDescriptorsFactoryInstance } from './descriptorsFactory';
import {
  getMasterNode,
  createVaultDescriptor,
  createTriggerDescriptor,
  createColdDescriptor,
  DUMMY_PUBKEY,
  DUMMY_PUBKEY_2
} from './vaultDescriptors';
import { shallowEqualArrays, shallowEqualObjects } from 'shallow-equal';

import type {
  DiscoveryInstance,
  TxAttribution,
  TxoMap
} from '@bitcoinerlab/discovery';
import { coinselect, maxFunds, dustThreshold } from './coinselect';
import type { Explorer } from '@bitcoinerlab/explorer';
import { coinTypeFromNetwork, type NetworkId, networkMapping } from './network';
import {
  fetchSpendingTx,
  findVoutByScript,
  RBF_SEQUENCE,
  type SpendingTxData,
  transactionFromHex,
  txSpendsOutpoint
} from './bitcoin';
import { MIN_FEE_RATE } from './fees';
import { maxBigInt, toBigInt, toNumber, toNumberOrUndefined } from './sats';
import {
  getPresignedRescueParentFee,
  getPresignedTriggerParentFee
} from './vaultFees';
import { getBackupFunding, getOnChainBackupDescriptor } from './backup/onchain';
export { getBackupFunding, getOnChainBackupDescriptor };
export {
  assertP2AParentPolicy,
  findP2AOutputData,
  P2A_NON_TRUC_ANCHOR_VALUE
} from './p2aPolicy';

import {
  estimateCpfpChildVSizeFromOutputs,
  findTriggerReserveVout,
  getAdditionalP2AOutputValue,
  getTriggerReserveDescriptorForVaultIndex,
  getTriggerReserveOutput
} from './p2aReserve';
import {
  assertP2AParentPolicy,
  findP2AOutputData,
  getRescueAnchorValue,
  getTriggerAnchorValue,
  MAX_P2A_TRUC_CHILD_VSIZE,
  P2A_DUST_THRESHOLD,
  P2A_OUTPUT_SCRIPT
} from './p2aPolicy';

import {
  OP_RETURN_BACKUP_TX_VBYTES,
  RESCUE_TX_VBYTES,
  TRIGGER_TX_VBYTES
} from './vaultSizes';
import { generateMnemonic } from 'bip39';
import { parseVaultIndex } from './rewindPaths';

export type TxHex = string;
export type TxId = string;

export type VaultSettings = {
  /**
   * Requested vault amount. `MAX_FUNDS` preserves max intent so creation can
   * rerun coinselection with the real vault outputs.
   */
  vaultedAmount: number | 'MAX_FUNDS';
  coldAddress: string;
  /**
   * User-facing fee-rate target for the vault tx plus its on-chain backup tx.
   *
   * This is not the final feerate of the vault tx alone.
   */
  packageFeeRate: number;
  lockBlocks: number;
  /** It's important to have the same accounts and utxosData reference as
   * used in SetUpVaultScreen. These were used to compute the package fee
   * and should be tied together. Note those could change on a refresh.
   */
  accounts: Accounts;
  /**
   * Set only when the user chose a custom wallet change address during vault
   * setup. Vault creation uses this exact descriptor/index for change and asks
   * the wallet to track it after broadcast. Leave unset for automatic wallet
   * change.
   */
  customChangeDescriptorWithIndex?: { descriptor: string; index: number };
  utxosData: UtxosData;
  /**
   * When true, `utxosData` is the exact manual UTXO selection from the user.
   * Coin selection must spend every provided UTXO and no others.
   */
  coinControl: boolean;
  /** when we present the confirmation text in CreateVaultScreen we want to
   * display the same fiat values
   */
  btcFiat: number | undefined;
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
  vaultPath: string;
  /** The value locked in the vault output after the vault tx is mined. */
  vaultedAmount: number;
  /** Laddered (legacy) compatibility only. New P2A vault creation does not use it. */
  serviceFee?: number;

  vaultAddress: string;
  triggerAddress: string;
  coldAddress: string;

  /** Laddered (legacy) compatibility only. New P2A vault creation does not use it. */
  feeRateCeiling?: number;
  lockBlocks: number;

  vaultTxHex: string;

  txMap: TxMap;
  triggerMap: TriggerMap; // In laddered vaults length ~80 txs. In P2A vaults length=1

  networkId: NetworkId;

  /** Laddered (legacy) compatibility only. New P2A vault creation does not use it. */
  minPanicAmount?: number;

  /**
   * the keyExpression for the unlocking using the unvaulting path
   **/
  unvaultKey: string; //This is an input in createVault
  triggerDescriptor: string; //This is an output since the panic key expression is randomly generated here

  creationTime: number;
};

export type VaultStatus = {
  /**
   * whether to show it isHidden !== true or not
   */
  isHidden?: boolean;

  /** Array of watchtower API URLs where this vault has been successfully registered */
  registeredWatchtowers?: string[];

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
   * Units are SECONDS.
   * They are kept so that the App knows the last action the user did WITHIN the
   * app:
   * - doesn't mean the action succeed. Perhaps a vault process did not have
   *   enough fees to complete, for example.
   * - also, those actions could have also be performed externally.
   *   For example a delegated person could have pushed a panic process.
   *
   * So, not reliable. To be used ONLY for UX purposes: For example to prevent
   * users to re-push txs in short periods of time.
   *
   * These variables are reset after PUSH_TIMEOUT seconds if the
   * pushed tx cannot be found in the mempool or in a block.
   */
  vaultPushTime?: number;
  triggerPushTime?: number;
  panicPushTime?: number;

  /** Last known trigger CPFP child tx hex (if any). */
  triggerCpfpTxHex?: string;
  /** Last known panic CPFP child tx hex (if any). */
  panicCpfpTxHex?: string;
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
/** maps a triggerTx with its corresponding Array of rescue txs */
type TriggerMap = Record<TxHex, Array<TxHex>>;

export type UtxosData = Array<{
  tx: Transaction;
  txHex: string;
  vout: number;
  output: OutputInstance;
}>;

const getDescriptorAndIndexFromTxoMap = (txo: string, txoMap: TxoMap) => {
  const [txId, strVout] = txo.split(':');
  const indexedDescriptor = txoMap[`${txId}:${strVout}`];
  if (!indexedDescriptor) return;

  const separatorIndex = indexedDescriptor.lastIndexOf('~');
  if (separatorIndex === -1)
    throw new Error(`Invalid indexed descriptor for ${txo}`);
  const descriptor = indexedDescriptor.slice(0, separatorIndex);
  const rawIndex = indexedDescriptor.slice(separatorIndex + 1);
  if (rawIndex === 'non-ranged') return { descriptor };

  const index = Number(rawIndex);
  if (!Number.isInteger(index) || index < 0)
    throw new Error(`Invalid descriptor index ${rawIndex} for ${txo}`);
  return { descriptor, index };
};

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
  spentAsRescue?: 'CONFIRMING' | 'CONFIRMED';
};

type VaultAnchorChildTx = {
  tx: Transaction;
  feePayerTxType: 'TRIGGER' | 'RESCUE';
  vaultId: string;
  vaultNumber: number;
};

/**
 * Infers vault mode from trigger transaction shape.
 *
 * Trigger-shape rule of thumb:
 * - no P2A output => `LADDERED`
 * - version 3 + 0-sat trigger anchor => `P2A_TRUC`
 * - version 2 + non-dust trigger anchor => `P2A_NON_TRUC`
 * - other P2A trigger shapes are invalid for the current vault format
 */
export const getVaultMode = (
  vault: Vault
): 'LADDERED' | 'P2A_TRUC' | 'P2A_NON_TRUC' => {
  for (const triggerTxHex of Object.keys(vault.triggerMap)) {
    const { tx } = transactionFromHex(triggerTxHex);
    const anchor = findP2AOutputData(tx);
    if (!anchor) continue;
    if (tx.version === 3 && anchor.value === 0) return 'P2A_TRUC';
    if (tx.version === 2 && BigInt(anchor.value) >= P2A_DUST_THRESHOLD)
      return 'P2A_NON_TRUC';
    throw new Error(
      `Unknown P2A vault mode from trigger tx version ${tx.version} and anchor value ${anchor.value}`
    );
  }
  return 'LADDERED';
};

/**
 * Estimates a feasible parent+child CPFP package for a target
 * package fee rate.
 *
 * The selected package fee rate is interpreted as:
 * `(parentFee + childFee) / (parentVSize + childVSize)`.
 *
 * @returns Package fee/size data when the package can be built; `undefined`
 * when the child would violate the TRUC size limit or cannot leave a dust-safe
 * change output at the requested fee rate.
 */
export const estimateCpfpPackage = ({
  parentTxHex,
  parentFee,
  targetPackageFeeRate,
  utxosData,
  changeOutput
}: {
  parentTxHex: TxHex;
  parentFee: number;
  targetPackageFeeRate: number;
  utxosData: UtxosData;
  changeOutput: OutputInstance;
}):
  | {
      anchorOutputIndex: number;
      anchorValue: number;
      childVSize: number;
      childFee: number;
      childOutputValue: number;
      packageFee: number;
      packageFeeRate: number;
    }
  | undefined => {
  const { tx: parentTx } = transactionFromHex(parentTxHex);
  const anchor = findP2AOutputData(parentTx);
  if (!anchor) throw new Error('Expected exactly one P2A output in parent tx');

  const parentVSize = parentTx.virtualSize();
  const dust = toNumber(dustThreshold(changeOutput));
  const utxosValue = utxosData.reduce((sum, utxoData) => {
    const output = utxoData.tx.outs[utxoData.vout];
    if (!output) throw new Error('Invalid utxoData output');
    return sum + toNumber(output.value);
  }, 0);
  const childVSize = estimateCpfpChildVSizeFromOutputs(
    utxosData.map(utxoData => utxoData.output),
    changeOutput
  );
  if (parentTx.version === 3 && childVSize > MAX_P2A_TRUC_CHILD_VSIZE) return;

  const totalPackageVSize = parentVSize + childVSize;
  const totalTargetFee = Math.ceil(targetPackageFeeRate * totalPackageVSize);
  // The package target alone is not enough. The child must also satisfy its own
  // tx-level minimum relay fee or package submission is rejected by the node.
  const childFee = Math.max(
    Math.ceil(childVSize * MIN_FEE_RATE),
    totalTargetFee - parentFee
  );
  const childOutputValue = anchor.value + utxosValue - childFee;
  if (childOutputValue <= dust) return;

  const packageFee = parentFee + childFee;
  return {
    anchorOutputIndex: anchor.index,
    anchorValue: anchor.value,
    childVSize,
    childFee,
    childOutputValue,
    packageFee,
    packageFeeRate: packageFee / totalPackageVSize
  };
};

/**
 * Builds and signs the Rewind2 CPFP child tx for a selected package fee
 * rate.
 *
 * @returns Signed child transaction hex, or `undefined` when the requested
 * package cannot be built under the same constraints as `estimateCpfpPackage`.
 */
export const createCpfpChildTxHex = async ({
  parentTxHex,
  parentFee,
  targetPackageFeeRate,
  utxosData,
  changeOutput,
  signer,
  network
}: {
  parentTxHex: TxHex;
  parentFee: number;
  targetPackageFeeRate: number;
  utxosData: UtxosData;
  changeOutput: OutputInstance;
  signer: Signer;
  network: Network;
}): Promise<TxHex | undefined> => {
  const packageEstimate = estimateCpfpPackage({
    parentTxHex,
    parentFee,
    targetPackageFeeRate,
    utxosData,
    changeOutput
  });
  if (!packageEstimate) return;

  const { tx: parentTx } = transactionFromHex(parentTxHex);
  const psbt = new Psbt({ network });
  psbt.setVersion(parentTx.version === 3 ? 3 : 2);
  psbt.addInput({
    hash: parentTx.getId(),
    index: packageEstimate.anchorOutputIndex,
    sequence: RBF_SEQUENCE,
    witnessUtxo: {
      script: P2A_OUTPUT_SCRIPT,
      value: toBigInt(packageEstimate.anchorValue)
    }
  });

  const childInputFinalizers = utxosData.map(utxoData =>
    utxoData.output.updatePsbtAsInput({
      psbt,
      txHex: utxoData.txHex,
      vout: utxoData.vout
    })
  );
  changeOutput.updatePsbtAsOutput({
    psbt,
    value: toBigInt(packageEstimate.childOutputValue)
  });

  if (utxosData.length > 0) await signPsbt(signer, network, psbt);
  psbt.finalizeInput(0, () => ({
    finalScriptSig: new Uint8Array(0),
    finalScriptWitness: Uint8Array.of(0)
  }));
  childInputFinalizers.forEach(finalizer => finalizer({ psbt }));

  const tx = psbt.extractTransaction(true);
  return tx.toHex();
};

export type HistoryDataItem =
  //hot wallet normal Transactions (not associated with the Vaults):
  | (TxAttribution & { tx: Transaction })

  // Vault-related presigned txs that are not part of the hot wallet:
  // 'RESCUE' and 'TRIGGER_EXTERNAL':
  | VaultPresignedTx

  // Vault-related presigned txs that are also part of the hot wallet
  // ('VAULT' and 'TRIGGER_HOT_WALLET'):
  | (TxAttribution & VaultPresignedTx)

  // CPFP children used to bump trigger/rescue flows
  | (TxAttribution & VaultAnchorChildTx);

export type HistoryData = Array<HistoryDataItem>;

export type TxHistory = Array<{
  txHex: TxHex;
  blockHeight: number;
  irreversible: boolean;
}>;

/**
 * For each txo, get its corresponding:
 * - previous txHex and vout
 * - output descriptor
 * - index? if the descriptor retrieved in discovery was ranged
 * - signersPubKeys? if it can only be spent through a specific spending path
 *
 * Important: Returns same reference for txosData if txos did not change.
 *
 * Important: discovery is used to retrieve info. It does not modify
 * the discoveryExport internal representation in any way, so there is no need
 * to save to disk exported discoveryExport after using this function.
 *
 * Note that it's fine using shallow memoization and checking for changes in
 * txos. The rest of params are just tooling to complete txosData but won't
 * change the result.
 */
export const getTxosDataFromVaults = moize.shallow(
  (
    txos: Array<string>,
    vaults: Vaults,
    network: Network,
    discovery: DiscoveryInstance,
    txoMap: TxoMap
  ): UtxosData => {
    const { Output, parseKeyExpression } = ensureDescriptorsFactoryInstance();
    return txos.map(txo => {
      const [txId, strVout] = txo.split(':');
      const vout = Number(strVout);
      if (!txId || isNaN(vout) || !Number.isInteger(vout) || vout < 0)
        throw new Error(`Invalid txo ${txo}`);
      const descriptorAndIndex = getDescriptorAndIndexFromTxoMap(txo, txoMap);
      if (!descriptorAndIndex) throw new Error(`Unmatched ${txo}`);
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
  },
  { maxSize: 10 }
);

export const getVaultNumber = moize((vaultId: string, vaults: Vaults) => {
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
 * Note here we use moize vs memoize in getTxosDataFromVaults, since in this case, when
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
    const rescueTxs: Map<TxId, VaultPresignedTx> = new Map();
    const anchorChildTxs: Map<TxId, VaultAnchorChildTx> = new Map();

    Object.entries(vaultsStatuses).forEach(([vaultId, vaultStatus]) => {
      const vault = vaults[vaultId];
      if (!vault) throw new Error('Vault unsynchd');
      const vaultTxHex = vault.vaultTxHex;
      const triggerTxHex = vaultStatus.triggerTxHex;
      const rescueTxHex = vaultStatus.panicTxHex;
      const triggerCpfpTxHex = vaultStatus.triggerCpfpTxHex;
      const rescueCpfpTxHex = vaultStatus.panicCpfpTxHex;
      const vaultNumber = getVaultNumber(vaultId, vaults);
      if (vaultStatus.vaultTxBlockHeight !== undefined) {
        // vaultTxBlockHeight may be undefined if VAULT_NOT_FOUND
        const { txId, tx } = transactionFromHex(vaultTxHex);
        const outValue = toNumberOrUndefined(tx.outs[0]?.value);
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
        const outValue = toNumberOrUndefined(tx.outs[0]?.value);
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
                spentAsRescue:
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
      if (rescueTxHex) {
        const { txId, tx } = transactionFromHex(rescueTxHex);
        const outValue = toNumberOrUndefined(tx.outs[0]?.value);
        if (outValue === undefined) throw new Error('Unset output');
        const pushTime = vaultStatus.panicPushTime;
        const blockTime = vaultStatus.panicTxBlockTime;
        const blockHeight = vaultStatus.panicTxBlockHeight;
        if (blockHeight === undefined)
          throw new Error('Unset rescue blockHeight');
        rescueTxs.set(txId, {
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
      if (triggerCpfpTxHex) {
        const { txId, tx } = transactionFromHex(triggerCpfpTxHex);
        anchorChildTxs.set(txId, {
          tx,
          feePayerTxType: 'TRIGGER',
          vaultId,
          vaultNumber
        });
      }
      if (rescueCpfpTxHex) {
        const { txId, tx } = transactionFromHex(rescueCpfpTxHex);
        anchorChildTxs.set(txId, {
          tx,
          feePayerTxType: 'RESCUE',
          vaultId,
          vaultNumber
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
      const anchorChildTx = anchorChildTxs.get(txId);
      const historyEntry = {
        ...txAttribution,
        tx,
        ...(vaultTx ? vaultTx : {}),
        ...(triggerHotWalletTx ? triggerHotWalletTx : {}),
        ...(anchorChildTx ? anchorChildTx : {})
      };
      historyData.push(historyEntry);
    });
    //Add the remainig 'RESCUE' AND 'TRIGGER_EXTERNAL'
    triggerExternalTxs.forEach(triggerExternalTx =>
      historyData.push(triggerExternalTx)
    );
    rescueTxs.forEach(rescueTx => historyData.push(rescueTx));

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
    return {
      output: utxo.output,
      value: out.value
    };
  })
);

export const utxosDataBalance = memoize((utxosData: UtxosData): number =>
  getOutputsWithValue(utxosData).reduce(
    (a, { value }) => a + toNumber(value),
    0
  )
);

/**
 * Async interface - this will make it easier to port this code to HWW
 */
const signPsbt = async (signer: Signer, network: Network, psbtVault: Psbt) => {
  const mnemonic = signer?.mnemonic;
  if (!mnemonic) throw new Error('Could not initialize the signer');
  const masterNode = getMasterNode(mnemonic, network);
  signers.signBIP32({ psbt: psbtVault, masterNode });
};

type OutputTarget = {
  output: OutputInstance;
  value: bigint;
};

const getTargetIndex = (
  targets: Array<OutputTarget>,
  output: OutputInstance
): number => {
  const index = targets.findIndex(target => target.output === output);
  if (index < 0) throw new Error('Target output not found');
  return index;
};

export const getTargetValue = (
  targets: Array<OutputTarget>,
  output: OutputInstance
): bigint => {
  const target = targets[getTargetIndex(targets, output)];
  if (!target) throw new Error('Target output not found');
  return target.value;
};

/**
 * Async interface - this will make it easier to port this code to HWW
 */
const deriveKeyExpressionAndPubKey = async ({
  signer,
  originPath,
  keyPath,
  network
}: {
  signer: Signer;
  originPath: string;
  keyPath: string;
  network: Network;
}) => {
  const mnemonic = signer?.mnemonic;
  if (!mnemonic)
    throw new Error('Could not initialize the key expression deriver');
  const masterNode = getMasterNode(mnemonic, network);
  return {
    keyExpression: keyExpressionBIP32({
      masterNode,
      originPath,
      keyPath
    }),
    pubkey: masterNode.derivePath(`m${originPath}${keyPath}`).publicKey
  };
};

/**
 * Reconstructs the funded P2A vault-creation outputs from the vault tx itself.
 *
 * This is strict P2A-only logic. Laddered vault creation is not part of the
 * current flow, so calling this for a laddered vault is invalid and throws.
 */
export const getP2AVaultFundingBreakdown = ({
  vault,
  signer
}: {
  vault: Vault;
  signer: Signer;
}) => {
  if (getVaultMode(vault) === 'LADDERED')
    throw new Error('getP2AVaultFundingBreakdown only supports P2A vaults');

  const network = networkMapping[vault.networkId];
  const { Output } = ensureDescriptorsFactoryInstance();
  const vaultIndex = parseVaultIndex(vault.vaultPath);
  const backupOutput = new Output({
    descriptor: getOnChainBackupDescriptor({
      signer,
      network,
      index: vaultIndex
    }),
    network
  });
  const { tx: vaultTx } = transactionFromHex(vault.vaultTxHex);
  const triggerReserveDescriptor = getTriggerReserveDescriptorForVaultIndex({
    signer,
    network,
    vaultIndex
  });
  const triggerReserveVout = findTriggerReserveVout({
    vaultTxHex: vault.vaultTxHex,
    descriptor: triggerReserveDescriptor,
    network
  });
  const backupVout = findVoutByScript(vaultTx, backupOutput.getScriptPubKey());
  if (backupVout < 0) throw new Error('Backup output not found in vault tx');

  const backupOutputValue = vaultTx.outs[backupVout]?.value;
  const vaultTxData = vault.txMap[vault.vaultTxHex];
  if (backupOutputValue === undefined)
    throw new Error('Vault tx is missing backup output');
  if (!vaultTxData) throw new Error('Vault tx is not mapped');
  const triggerReserveValue =
    triggerReserveVout >= 0
      ? vaultTx.outs[triggerReserveVout]?.value
      : BigInt(0);
  if (triggerReserveValue === undefined)
    throw new Error('Vault tx is missing trigger reserve output');

  return {
    vaultTxFee: vaultTxData.fee,
    backupTxCost: toNumber(backupOutputValue),
    triggerReserveValue: toNumber(triggerReserveValue)
  };
};

const getMinimumVaultTxFeeRate = (vaultMode: 'P2A_TRUC' | 'P2A_NON_TRUC') =>
  vaultMode === 'P2A_TRUC' ? 0 : MIN_FEE_RATE;

const MAX_BACKUP_TX_VSIZE = Math.max(...OP_RETURN_BACKUP_TX_VBYTES);

/**
 * Runs the initial vault coinselection using the user-selected fee rate.
 *
 * The selected fee rate is first applied directly to the vault tx so the app
 * can choose inputs/change using a normal coinselection pass. The backup output
 * starts at `backupFunding`, which is only a lower bound. Later, the vault
 * tx fee can be reduced to the minimum parent fee allowed for that vault kind
 * (`0` for P2A_TRUC, `0.1 sat/vB` for P2A_NON_TRUC`) and
 * the excess is shifted into the backup output without changing the chosen
 * inputs or the overall tx shape.
 *
 * In the current backup model, `backupFunding` later equals the backup tx fee
 * itself because the backup tx only creates an OP_RETURN output.
 *
 * When `shiftFeesToBackupTx` is enabled, the returned `selected` object is
 * already adjusted to the final post-shift state: its backup target value is
 * the final backup fee budget and its `fee` is the final vault-tx fee.
 */
export const coinSelectVaultTx = moize.shallow(
  ({
    utxosData,
    coinControl,
    vaultOutput,
    backupOutput,
    triggerReserveOutput,
    triggerReserveValue,
    changeOutput,
    packageFeeRate,
    vaultMode,
    vaultedAmount,
    shiftFeesToBackupTx
  }: {
    utxosData: UtxosData;
    /**
     * When true, `utxosData` is the exact manual UTXO selection from the user.
     * Coin selection must spend every provided UTXO and no others.
     */
    coinControl: boolean;
    vaultOutput: OutputInstance;
    backupOutput: OutputInstance;
    triggerReserveOutput?: OutputInstance;
    triggerReserveValue?: bigint;
    changeOutput: OutputInstance;
    packageFeeRate: number;
    vaultMode: 'P2A_TRUC' | 'P2A_NON_TRUC';
    vaultedAmount: bigint | 'MAX_FUNDS';
    shiftFeesToBackupTx: boolean;
  }) => {
    if (
      (triggerReserveOutput === undefined) !==
      (triggerReserveValue === undefined)
    ) {
      throw new Error(
        'triggerReserveOutput and triggerReserveValue must be provided together'
      );
    }
    if (!shiftFeesToBackupTx) {
      return regularCoinSelectVaultTx({
        utxosData,
        coinControl,
        vaultOutput,
        backupOutput,
        backupFunding: getBackupFunding(packageFeeRate, backupOutput),
        changeOutput,
        feeRate: packageFeeRate,
        minimumFeeRate: MIN_FEE_RATE,
        vaultedAmount,
        ...(triggerReserveOutput !== undefined ? { triggerReserveOutput } : {}),
        ...(triggerReserveValue !== undefined ? { triggerReserveValue } : {})
      });
    } else {
      const minimumVaultTxFeeRate = getMinimumVaultTxFeeRate(vaultMode); //0 || 0.1
      if (packageFeeRate < minimumVaultTxFeeRate)
        throw new Error('packageFeeRate below minimum vault tx fee rate');
      const lowestBackupFunding = getBackupFunding(MIN_FEE_RATE, backupOutput); //dust or 0.1 * vault tx size

      // Solve `backupFunding` by fixed-point iteration.
      // There is no simple one-shot calculation here because:
      // - `backupFunding` affects coinselection
      // - coinselection affects `selected.vsize`
      // - `selected.vsize` affects the backup funding needed for the target package fee
      // `backupFunding` only moves upward between attempts, but the tx shape itself
      // may still jump as coinselection picks different inputs or change.
      // In practice the first pass usually lands close to the final self-consistent
      // shape, and later passes only tighten the budget if needed.
      // The attempt cap of 5 is only a safety guard in case convergence is slower
      // than expected.
      for (
        let attempt = 0, backupFunding = lowestBackupFunding;
        attempt < 5;
        attempt++
      ) {
        const selected = regularCoinSelectVaultTx({
          utxosData,
          coinControl,
          vaultOutput,
          backupOutput,
          backupFunding,
          changeOutput,
          feeRate: minimumVaultTxFeeRate, //0 or 0.1 for P2A_NON_TRUC
          minimumFeeRate: minimumVaultTxFeeRate, //0 or 0.1 for P2A_NON_TRUC
          vaultedAmount,
          ...(triggerReserveOutput !== undefined
            ? { triggerReserveOutput }
            : {}),
          ...(triggerReserveValue !== undefined ? { triggerReserveValue } : {})
        });
        if (typeof selected === 'string') return selected; //Forward errors

        const candidatePackageFee = BigInt(
          Math.ceil(packageFeeRate * (selected.vsize + MAX_BACKUP_TX_VSIZE))
        );

        //console.log({
        //  attempt,
        //  backupFunding,
        //  candidateBackupFunding: candidatePackageFee - selected.fee
        //});
        if (candidatePackageFee - selected.fee > backupFunding)
          backupFunding = candidatePackageFee - selected.fee; //keep iterating
        else return selected; //stop iterating
      }

      // If the fixed-point search does not settle quickly, fall back to one
      // simpler pass at the package fee rate. Then move any parent fee
      // above the allowed minimum into the backup output. In this backup model,
      // that backup funding amount is in fact the backup tx fee itself because the
      // backup tx only creates an OP_RETURN output with no value. This can overpay a bit
      // compared with the fixed-point result, but it still preserves a valid
      // selected shape and avoids failing the setup flow.
      console.warn(
        'Vault package fee selection did not converge; using conservative fallback',
        { packageFeeRate, vaultMode }
      );
      const backupFundingAtPackageFeeRate = getBackupFunding(
        packageFeeRate,
        backupOutput
      );
      const selected = regularCoinSelectVaultTx({
        utxosData,
        coinControl,
        vaultOutput,
        backupOutput,
        backupFunding: backupFundingAtPackageFeeRate,
        changeOutput,
        feeRate: packageFeeRate,
        minimumFeeRate: minimumVaultTxFeeRate,
        vaultedAmount,
        ...(triggerReserveOutput !== undefined ? { triggerReserveOutput } : {}),
        ...(triggerReserveValue !== undefined ? { triggerReserveValue } : {})
      });
      if (typeof selected === 'string') return selected;

      const minimumVaultTxFee = BigInt(
        Math.ceil(selected.vsize * minimumVaultTxFeeRate)
      );
      // In the fallback path, any parent fee above the minimum parent fee for
      // this vault kind (`0` for P2A_TRUC, `0.1 sat/vB` for P2A_NON_TRUC`) is
      // shifted into the backup output. That funded amount later becomes the
      // backup tx fee itself because the backup tx only creates an OP_RETURN
      // output.
      const shiftedFeeAmount = selected.fee - minimumVaultTxFee;
      const finalBackupFunding =
        backupFundingAtPackageFeeRate + shiftedFeeAmount;
      const backupTargetIndex = getTargetIndex(selected.targets, backupOutput);
      selected.targets = selected.targets.map((target, index) =>
        index === backupTargetIndex
          ? { ...target, value: finalBackupFunding }
          : target
      );
      selected.fee = minimumVaultTxFee;
      return selected;
    }
  }
);

/**
 * Estimates the smallest `vaultedAmount` that can produce a valid new Rewind2
 * vault for the given emergency path.
 *
 * This is a structural lower bound only. It does not inspect wallet UTXOs or
 * decide whether funding is possible. Instead it computes the minimum amount
 * needed so all three outputs implied by a new vault remain valid:
 * - the vault output itself must stay above dust
 * - the trigger output must stay above dust after subtracting any required
 *   parent fee and P2A_NON_TRUC anchor
 * - the rescue output must stay above dust after subtracting everything that
 *   must already be paid before rescue can exist
 *
 * This lower bound does not include the separate trigger reserve output funded
 * by the wallet at vault creation time.
 *
 * @returns The minimum `vaultedAmount` in sats required by the current
 * Rewind2 vault structure. This is the largest of the vault, trigger, and
 * rescue minimums because one vaulted amount must satisfy all three.
 */
export const estimateMinimumRequiredVaultedAmount = moize.shallow(
  ({
    coldAddress,
    lockBlocks,
    network,
    vaultMode,
    presignedTriggerFeeRate,
    presignedRescueFeeRate
  }: {
    coldAddress: string;
    lockBlocks: number;
    network: Network;
    /**
     * Structural vault mode. P2A_TRUC uses version-3 parents; anchor value is
     * action-specific. P2A_NON_TRUC uses version-2 parents with funded anchors.
     */
    vaultMode: 'P2A_TRUC' | 'P2A_NON_TRUC';
    /** Mode-specific fee rate baked directly into the trigger parent transaction. */
    presignedTriggerFeeRate: number;
    /** Fee rate baked directly into the rescue parent transaction. */
    presignedRescueFeeRate: number;
  }) => {
    const { Output } = ensureDescriptorsFactoryInstance();
    const vaultOutput = new Output({
      descriptor: createVaultDescriptor(DUMMY_PUBKEY),
      network
    });
    const triggerOutputRescuePath = new Output({
      descriptor: createTriggerDescriptor({
        unvaultKeyExpression: DUMMY_PUBKEY,
        rescueKeyExpression: DUMMY_PUBKEY_2,
        lockBlocks
      }),
      signersPubKeys: [fromHex(DUMMY_PUBKEY_2)],
      network
    });
    const coldOutput = new Output({
      descriptor: createColdDescriptor(coldAddress),
      network
    });
    const triggerAnchorValue = getTriggerAnchorValue(vaultMode);
    const rescueAnchorValue = getRescueAnchorValue();
    const triggerParentFee = getPresignedTriggerParentFee(
      presignedTriggerFeeRate
    );
    const rescueParentFee = getPresignedRescueParentFee(presignedRescueFeeRate);

    const minimumVaultOutputValue = dustThreshold(vaultOutput) + BigInt(1);
    const minimumTriggerOutputValue =
      dustThreshold(triggerOutputRescuePath) +
      BigInt(1) +
      triggerAnchorValue +
      triggerParentFee;
    const minimumRescueOutputValue =
      dustThreshold(coldOutput) +
      BigInt(1) +
      rescueAnchorValue +
      rescueParentFee +
      triggerAnchorValue +
      triggerParentFee;

    const minimumRequiredVaultedAmount = maxBigInt(
      minimumVaultOutputValue,
      minimumTriggerOutputValue,
      minimumRescueOutputValue
    );

    return toNumber(minimumRequiredVaultedAmount);
  }
);

/**
 * Runs the regular vault coinselection path without any later fee shifting.
 *
 * This still builds the full vault-specific target set (vault, backup,
 * reserve, and optional change), but it leaves the selected fee exactly where
 * coinselection put it. `coinSelectVaultTx(...)` can then optionally take this
 * regular result and shift part of the parent fee into the backup output.
 */
const regularCoinSelectVaultTx = ({
  utxosData,
  coinControl,
  vaultOutput,
  vaultedAmount,
  backupOutput,
  triggerReserveOutput,
  triggerReserveValue,
  backupFunding,
  changeOutput,
  feeRate,
  minimumFeeRate
}: {
  utxosData: UtxosData;
  /**
   * When true, `utxosData` is the exact manual UTXO selection from the user.
   * Coin selection must spend every provided UTXO and no others.
   */
  coinControl: boolean;
  vaultOutput: OutputInstance;
  vaultedAmount: bigint | 'MAX_FUNDS';
  backupOutput?: OutputInstance;
  triggerReserveOutput?: OutputInstance;
  triggerReserveValue?: bigint;
  backupFunding?: bigint;
  changeOutput: OutputInstance;
  feeRate: number;
  /** this is typically 0.1 but can be 0 for P2A_TRUC */
  minimumFeeRate: number;
}) => {
  const utxos = getOutputsWithValue(utxosData);
  if (!utxos.length) return 'NO_UTXOS';
  if (
    typeof vaultedAmount === 'bigint' &&
    vaultedAmount <= dustThreshold(vaultOutput)
  )
    return `VAULT OUT BELOW DUST: ${vaultedAmount} <= ${dustThreshold(vaultOutput)}`;
  if (backupOutput && backupFunding !== undefined) {
    if (backupFunding <= dustThreshold(backupOutput))
      return `BACKUP OUT BELOW DUST: ${backupFunding} <= ${dustThreshold(backupOutput)}`;
  } else if (backupOutput || backupFunding !== undefined) {
    throw new Error('backupOutput and backupFunding must be provided together');
  }
  if (triggerReserveOutput && triggerReserveValue !== undefined) {
    if (triggerReserveValue <= dustThreshold(triggerReserveOutput))
      return `TRIGGER RESERVE OUT BELOW DUST: ${triggerReserveValue} <= ${dustThreshold(triggerReserveOutput)}`;
  } else if (triggerReserveOutput || triggerReserveValue !== undefined) {
    throw new Error(
      'triggerReserveOutput and triggerReserveValue must be provided together'
    );
  }
  let coinselected;
  let targets;
  if (vaultedAmount === 'MAX_FUNDS') {
    targets = [];
    if (backupOutput && backupFunding !== undefined)
      targets.push({ output: backupOutput, value: backupFunding });
    if (triggerReserveOutput && triggerReserveValue !== undefined)
      targets.push({
        output: triggerReserveOutput,
        value: triggerReserveValue
      });

    coinselected = maxFunds({
      utxos,
      coinControl,
      targets,
      remainder: vaultOutput,
      feeRate,
      minimumFeeRate
    });
    if (!coinselected) return 'MAX_FUNDS COINSELECTOR FAILED';
    const vaultTarget = coinselected.targets.find(
      target => target.output === vaultOutput
    );
    if (!vaultTarget) throw new Error('Could not find vaultOutput');
    if (vaultTarget.value <= dustThreshold(vaultOutput))
      return `VAULT TARGET OUT BELOW DUST: ${vaultTarget.value} <= ${dustThreshold(vaultOutput)}`;
    // maxFunds returns the remainder last. Rebuild targets in canonical order:
    // vault output first, backup output second, reserve output third, optional
    // change last.
    targets = [{ output: vaultOutput, value: vaultTarget.value }];
    if (backupOutput && backupFunding !== undefined)
      targets.push({ output: backupOutput, value: backupFunding });
    if (triggerReserveOutput && triggerReserveValue !== undefined)
      targets.push({
        output: triggerReserveOutput,
        value: triggerReserveValue
      });
  } else {
    targets = [{ output: vaultOutput, value: vaultedAmount }];
    if (backupOutput && backupFunding !== undefined)
      targets.push({ output: backupOutput, value: backupFunding });
    if (triggerReserveOutput && triggerReserveValue !== undefined)
      targets.push({
        output: triggerReserveOutput,
        value: triggerReserveValue
      });

    coinselected = coinselect({
      utxos,
      coinControl,
      targets,
      remainder: changeOutput,
      feeRate,
      minimumFeeRate
    });
    if (!coinselected) return 'REGULAR COINSELECTOR FAILED';
    targets = coinselected.targets;
  }
  const selectedUtxosData =
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
    targets,
    utxosData: selectedUtxosData
  };
};

/**
 * Builds deterministic vault outputs and runs coin selection for them.
 *
 * Uses a randomly derived vault output, a deterministic backup output derived
 * from the vault index, and a wallet change output to compute the coinselector
 * for the requested vaulted amount.
 *
 * The `packageFeeRate` parameter is the user-selected fee-rate target. The
 * vault tx is first built at that rate. If `shiftFeesToBackupTx` is enabled,
 * any vault-tx fee above the minimum parent fee for that vault kind (`0` for
 * P2A_TRUC, `0.1 sat/vB` for P2A_NON_TRUC`) is moved into the backup output
 * while keeping the selected inputs, change, and tx shape unchanged.
 */
const buildVaultTxContext = async ({
  signer,
  randomSigner,
  changeDescriptorWithIndex,
  vaultIndex,
  vaultMode,
  presignedTriggerFeeRate,
  maxTriggerFeeRate,
  packageFeeRate,
  utxosData,
  coinControl,
  vaultedAmount,
  shiftFeesToBackupTx,
  network
}: {
  signer: Signer;
  randomSigner: Signer;
  changeDescriptorWithIndex: { descriptor: string; index: number };
  vaultIndex: number;
  /**
   * Structural vault mode. P2A_TRUC uses version-3 parents; anchor value is
   * action-specific. P2A_NON_TRUC uses version-2 parents with funded anchors.
   */
  vaultMode: 'P2A_TRUC' | 'P2A_NON_TRUC';
  /** Mode-specific fee rate baked directly into the trigger parent transaction. */
  presignedTriggerFeeRate: number;
  /** Trigger package-feerate ceiling used to size the dedicated reserve. */
  maxTriggerFeeRate: number;
  packageFeeRate: number;
  vaultedAmount: bigint | 'MAX_FUNDS';
  utxosData: UtxosData;
  /**
   * When true, `utxosData` is the exact manual UTXO selection from the user.
   * Coin selection must spend every provided UTXO and no others.
   */
  coinControl: boolean;
  shiftFeesToBackupTx: boolean;
  network: Network;
}) => {
  const { Output } = ensureDescriptorsFactoryInstance();
  const randomKeyOriginPath = `/84'/${coinTypeFromNetwork(network)}'/0'`;
  const randomKeyDerivationPath = `/0/0`;
  const { keyExpression: randomKeyExpression, pubkey: randomPubKey } =
    await deriveKeyExpressionAndPubKey({
      signer: randomSigner,
      network,
      originPath: randomKeyOriginPath,
      keyPath: randomKeyDerivationPath
    });
  const vaultOutput = new Output({
    descriptor: `wpkh(${randomKeyExpression})`,
    network
  });
  const backupOutput = new Output({
    descriptor: getOnChainBackupDescriptor({
      signer,
      network,
      index: vaultIndex
    }),
    network
  });
  const changeOutput = new Output({ ...changeDescriptorWithIndex, network });
  const triggerReserveDescriptor = getTriggerReserveDescriptorForVaultIndex({
    signer,
    network,
    vaultIndex
  });
  const triggerReserveOutput = getTriggerReserveOutput({
    descriptor: triggerReserveDescriptor,
    network
  });
  const triggerReserveValue = getAdditionalP2AOutputValue({
    outputsWithValue: [],
    additionalOutput: triggerReserveOutput,
    changeOutput,
    parentAnchorValue: toNumber(getTriggerAnchorValue(vaultMode)),
    presignedParentVSize: Math.max(...TRIGGER_TX_VBYTES),
    presignedParentFeeRate: presignedTriggerFeeRate,
    targetPackageFeeRate: maxTriggerFeeRate
  });
  const shouldFundTriggerReserve = triggerReserveValue > BigInt(0);

  const selected = coinSelectVaultTx({
    utxosData,
    coinControl,
    vaultOutput,
    backupOutput,
    changeOutput,
    packageFeeRate,
    vaultMode,
    vaultedAmount,
    shiftFeesToBackupTx,
    ...(shouldFundTriggerReserve
      ? { triggerReserveOutput, triggerReserveValue }
      : {})
  });
  return {
    randomKeyExpression,
    randomPubKey,
    vaultOutput,
    backupOutput,
    triggerReserveOutput,
    selected
  };
};

export const createVault = async ({
  vaultedAmount,
  unvaultKeyExpression,
  packageFeeRate,
  presignedTriggerFeeRate,
  presignedRescueFeeRate,
  maxTriggerFeeRate,
  utxosData,
  coinControl,
  signer,
  randomSigner,
  coldAddress,
  lockBlocks,
  changeDescriptorWithIndex,
  vaultIndex,
  vaultMode,
  shiftFeesToBackupTx,
  networkId
}: {
  vaultedAmount: bigint | 'MAX_FUNDS';
  /** The unvault key expression that must be used to create triggerDescriptor */
  unvaultKeyExpression: string;
  /** Selected fee-rate target for the vault tx plus the backup tx package. */
  packageFeeRate: number;
  /** Mode-specific fee rate baked directly into the trigger parent transaction. */
  presignedTriggerFeeRate: number;
  /** Fee rate baked directly into the presigned rescue parent transaction. */
  presignedRescueFeeRate: number;
  /** Highest trigger package feerate the dedicated reserve must support. */
  maxTriggerFeeRate: number;
  utxosData: UtxosData;
  /**
   * When true, `utxosData` is the exact manual UTXO selection from the user.
   * Coin selection must spend every provided UTXO and no others.
   */
  coinControl: boolean;
  signer: Signer;
  randomSigner: Signer;
  coldAddress: string;
  changeDescriptorWithIndex: { descriptor: string; index: number };
  lockBlocks: number;
  vaultIndex: number;
  /**
   * Structural vault mode. P2A_TRUC uses version-3 parents; anchor value is
   * action-specific. P2A_NON_TRUC uses version-2 parents with funded anchors.
   */
  vaultMode: 'P2A_TRUC' | 'P2A_NON_TRUC';
  shiftFeesToBackupTx: boolean;
  networkId: NetworkId;
}) => {
  const network = networkMapping[networkId];
  const {
    randomKeyExpression,
    randomPubKey,
    vaultOutput,
    backupOutput,
    triggerReserveOutput,
    selected
  } = await buildVaultTxContext({
    signer,
    randomSigner,
    changeDescriptorWithIndex,
    vaultIndex,
    vaultMode,
    presignedTriggerFeeRate,
    maxTriggerFeeRate,
    packageFeeRate,
    utxosData,
    coinControl,
    vaultedAmount,
    shiftFeesToBackupTx,
    network
  });
  const { Output, parseKeyExpression } = ensureDescriptorsFactoryInstance();
  if (typeof selected === 'string') return 'COINSELECT_ERROR: ' + selected;
  const vaultUtxosData = selected.utxosData;
  const vaultTargets = selected.targets;
  const vaultOutputIndex = getTargetIndex(vaultTargets, vaultOutput);
  if (vaultOutputIndex !== 0)
    throw new Error("coinselect first output should be the vault's output");
  getTargetIndex(vaultTargets, backupOutput); // throws if backup target is missing
  const usesTriggerReserve = vaultTargets.some(
    target => target.output === triggerReserveOutput
  );
  if (vaultTargets.length > (usesTriggerReserve ? 4 : 3))
    throw new Error(
      usesTriggerReserve
        ? 'coinselect outputs should be vault, backup, trigger reserve, and change at most'
        : 'coinselect outputs should be vault, backup, and change at most'
    );
  const psbtVault = new Psbt({ network });
  const selectedVaultedAmount = getTargetValue(vaultTargets, vaultOutput);

  psbtVault.setVersion(vaultMode === 'P2A_TRUC' ? 3 : 2);

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
  const vaultTx = psbtVault.extractTransaction();
  const vaultTxHex = vaultTx.toHex();
  const vaultVsize = vaultTx.virtualSize();
  if (vaultVsize > selected.vsize)
    throw new Error('vsize larger than coinselected estimated one');
  const rescueKeyExpression = randomKeyExpression;
  const triggerDescriptor = createTriggerDescriptor({
    unvaultKeyExpression,
    rescueKeyExpression,
    lockBlocks
  });
  const triggerOutputRescuePath = new Output({
    descriptor: triggerDescriptor,
    network,
    signersPubKeys: [randomPubKey]
  });
  const { pubkey: unvaultPubKey } = parseKeyExpression({
    keyExpression: unvaultKeyExpression,
    network
  });
  if (!unvaultPubKey) throw new Error('Could not extract unvaultPubKey');

  const triggerAnchorValue = getTriggerAnchorValue(vaultMode);
  const rescueAnchorValue = getRescueAnchorValue();
  const triggerParentFee = getPresignedTriggerParentFee(
    presignedTriggerFeeRate
  );
  const rescueParentFee = getPresignedRescueParentFee(presignedRescueFeeRate);
  const triggerOutputValue =
    selectedVaultedAmount - triggerAnchorValue - triggerParentFee;
  const triggerDust = dustThreshold(triggerOutputRescuePath);
  if (triggerOutputValue <= triggerDust)
    return `COINSELECT_ERROR: trigger output below dust ${triggerOutputValue} <= ${triggerDust}`;

  const psbtTrigger = new Psbt({ network });
  psbtTrigger.setVersion(vaultMode === 'P2A_TRUC' ? 3 : 2);
  //Add the input (vaultOutput) to psbtTrigger as input:
  const triggerInputFinalizer = vaultOutput.updatePsbtAsInput({
    psbt: psbtTrigger,
    txHex: vaultTxHex,
    vout: vaultOutputIndex
  });
  triggerOutputRescuePath.updatePsbtAsOutput({
    psbt: psbtTrigger,
    value: triggerOutputValue
  }); //vout: 0
  psbtTrigger.addOutput({
    script: P2A_OUTPUT_SCRIPT,
    value: triggerAnchorValue
  }); //vout: 1
  await signPsbt(randomSigner, network, psbtTrigger);
  triggerInputFinalizer({ psbt: psbtTrigger });
  const triggerTx = psbtTrigger.extractTransaction();
  const triggerTxHex = triggerTx.toHex();
  const triggerVsize = triggerTx.virtualSize();
  if (!TRIGGER_TX_VBYTES.includes(triggerVsize))
    throw new Error(`Unexpected trigger vsize: ${triggerVsize}`);

  const psbtRescue = new Psbt({ network });
  psbtRescue.setVersion(vaultMode === 'P2A_TRUC' ? 3 : 2);
  const rescueInputFinalizer = triggerOutputRescuePath.updatePsbtAsInput({
    psbt: psbtRescue,
    txHex: triggerTxHex,
    vout: 0
  });
  const coldOutput = new Output({
    descriptor: `addr(${coldAddress})`,
    network
  });
  const rescueOutputValue =
    triggerOutputValue - rescueAnchorValue - rescueParentFee;
  const rescueDust = dustThreshold(coldOutput);
  if (rescueOutputValue <= rescueDust)
    return `COINSELECT_ERROR: rescue output below dust ${rescueOutputValue} <= ${rescueDust}`;
  coldOutput.updatePsbtAsOutput({ psbt: psbtRescue, value: rescueOutputValue }); //vout: 0
  psbtRescue.addOutput({
    script: P2A_OUTPUT_SCRIPT,
    value: rescueAnchorValue
  }); //vout: 1
  await signPsbt(randomSigner, network, psbtRescue);
  rescueInputFinalizer({ psbt: psbtRescue });
  const rescueTx = psbtRescue.extractTransaction();
  const rescueTxHex = rescueTx.toHex();
  const rescueVsize = rescueTx.virtualSize();
  if (!RESCUE_TX_VBYTES.includes(rescueVsize))
    throw new Error(`Unexpected rescue vsize: ${rescueVsize}`);

  const vaultFee = Number(psbtVault.getFee());
  const triggerFee = Number(psbtTrigger.getFee());
  const rescueFee = Number(psbtRescue.getFee());
  const minTriggerFee = Math.ceil(triggerVsize * presignedTriggerFeeRate);
  const minRescueFee = Math.ceil(rescueVsize * presignedRescueFeeRate);
  if (triggerFee < minTriggerFee)
    throw new Error(`Invalid trigger fee ${triggerFee} < ${minTriggerFee}`);
  if (rescueFee < minRescueFee)
    throw new Error(`Invalid rescue fee ${rescueFee} < ${minRescueFee}`);
  assertP2AParentPolicy({
    tx: triggerTx,
    fee: triggerFee,
    txName: 'trigger tx',
    vaultMode
  });
  assertP2AParentPolicy({
    tx: rescueTx,
    fee: rescueFee,
    txName: 'rescue tx',
    vaultMode
  });
  return {
    triggerDescriptor,
    selectedVaultedAmount: toNumber(selectedVaultedAmount),
    creationTime: Math.floor(Date.now() / 1000),
    vaultAddress: vaultOutput.getAddress(),
    triggerAddress: triggerOutputRescuePath.getAddress(),
    vaultTxHex,
    txMap: {
      [vaultTxHex]: {
        txId: vaultTx.getId(),
        fee: vaultFee,
        feeRate: vaultFee / vaultTx.virtualSize()
      },
      [triggerTxHex]: {
        txId: triggerTx.getId(),
        fee: triggerFee,
        feeRate: triggerFee / triggerTx.virtualSize()
      },
      [rescueTxHex]: {
        txId: rescueTx.getId(),
        fee: rescueFee,
        feeRate: rescueFee / rescueTx.virtualSize()
      }
    },
    triggerMap: { [triggerTxHex]: [rescueTxHex] }
  };
};

export const getRandomSigner = async (networkId: NetworkId) => {
  const network = networkMapping[networkId];
  const randomMnemonic = generateMnemonic();
  const masterNode = getMasterNode(randomMnemonic, network);
  const masterFingerprint = toHex(masterNode.fingerprint);
  return { masterFingerprint, type: SOFTWARE, mnemonic: randomMnemonic };
};

/**
 * How many blocks must be waited for spending from a triggerUnvault tx?
 *
 * returns 'VAULT_NOT_FOUND' if vaultTxBlockHeight is not set; when not set
 * it's because the vault was never pushed or because it expired or was RBFd
 * returns 'TRIGGER_NOT_FOUND' if the trigger tx is not in the mempool/blockchain
 * returns 'FOUND_AS_HOT'/'FOUND_AS_RESCUE' if the trigger tx has already been
 * spent by a tx confirmed or is found in the mempool.
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
  | 'TRIGGER_NOT_FOUND'
  | 'FOUND_AS_RESCUE'
  | 'FOUND_AS_HOT'
  | number {
  if (vaultStatus.vaultTxBlockHeight === undefined) return 'VAULT_NOT_FOUND';
  if (vaultStatus.triggerTxBlockHeight === undefined)
    return 'TRIGGER_NOT_FOUND';
  if (vaultStatus.panicTxHex) return 'FOUND_AS_RESCUE'; //will be set if in mempool or confirmed
  if (vaultStatus.spendAsHotTxHex) return 'FOUND_AS_HOT'; //will be set if in mempool or confirmed
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
    throw new Error('triggerTxHex unset for a rescue tx');
  //Unvaulting triggered:
  const triggerFee = vault.txMap[vaultStatus.triggerTxHex]?.fee;
  if (triggerFee === undefined)
    throw new Error('Trigger tx fee should have been set');

  const rescueFee = vault.txMap[vaultStatus.panicTxHex]?.fee;
  if (rescueFee === undefined)
    throw new Error('Rescue tx fee should have been set');

  return vault.vaultedAmount - triggerFee - rescueFee;
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
 * Finds the trigger CPFP child through the vault's deterministic trigger reserve.
 *
 * The tempting lookup is to ask which transaction spent the trigger parent's P2A
 * anchor. That must not be done through `fetchSpendingTx(...)`: all P2A anchors
 * share the same script, so script-history lookup scans unrelated P2A activity
 * and can make refresh unusably slow as network P2A usage grows.
 *
 * Rewind trigger fee-payer children also spend the per-vault trigger reserve
 * output funded in the vault transaction. That reserve output is unique to the
 * vault and described by the stored trigger reserve descriptor. We therefore
 * discover the candidate child by checking the setup-funded reserve output's
 * spender, then validate that the candidate also spends the trigger parent's P2A
 * anchor. This keeps cross-device discovery while avoiding the global P2A
 * script-history scan.
 */
async function fetchTriggerCpfpTxFromReserve({
  vault,
  triggerTxHex,
  signer,
  network,
  explorer
}: {
  vault: Vault;
  triggerTxHex: string;
  signer: Signer;
  network: Network;
  explorer: Explorer;
}): Promise<SpendingTxData | undefined> {
  const { tx: triggerTx, txId: triggerTxId } = transactionFromHex(triggerTxHex);
  const anchor = findP2AOutputData(triggerTx);
  if (!anchor) return;

  const triggerReserveDescriptor = getTriggerReserveDescriptorForVaultIndex({
    signer,
    network,
    vaultIndex: parseVaultIndex(vault.vaultPath)
  });
  const triggerReserveVout = findTriggerReserveVout({
    vaultTxHex: vault.vaultTxHex,
    descriptor: triggerReserveDescriptor,
    network
  });
  if (triggerReserveVout < 0) return;

  const candidateTxData = await fetchSpendingTx(
    vault.vaultTxHex,
    triggerReserveVout,
    explorer
  );
  if (
    candidateTxData &&
    txSpendsOutpoint(candidateTxData.txHex, triggerTxId, anchor.index)
  )
    return candidateTxData;
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
 * vaultPushTime, triggerPushTime and the legacy panicPushTime field cannot be
 * retrieved from the network.
 * Immutable.
 */
async function fetchVaultStatus(
  vault: Vault,
  currVaultStatus: VaultStatus | undefined,
  explorer: Explorer,
  signer: Signer,
  network: Network
) {
  const newVaultStatus: VaultStatus = currVaultStatus
    ? {
        ...(currVaultStatus.isHidden !== undefined && {
          isHidden: currVaultStatus.isHidden
        }),
        ...(currVaultStatus.registeredWatchtowers !== undefined && {
          registeredWatchtowers: currVaultStatus.registeredWatchtowers
        }),
        ...(currVaultStatus.vaultPushTime !== undefined && {
          vaultPushTime: currVaultStatus.vaultPushTime
        }),
        ...(currVaultStatus.triggerPushTime !== undefined && {
          triggerPushTime: currVaultStatus.triggerPushTime
        }),
        ...(currVaultStatus.panicPushTime !== undefined && {
          panicPushTime: currVaultStatus.panicPushTime
        }),
        ...(currVaultStatus.triggerCpfpTxHex !== undefined && {
          triggerCpfpTxHex: currVaultStatus.triggerCpfpTxHex
        }),
        ...(currVaultStatus.panicCpfpTxHex !== undefined && {
          panicCpfpTxHex: currVaultStatus.panicCpfpTxHex
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
      currVaultStatus?.isHidden &&
      currVaultStatus.vaultTxBlockHeight === undefined
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
  // Vault Tx NOT Found - Check if push time should be reset
  else if (
    newVaultStatus.vaultPushTime &&
    Math.floor(Date.now() / 1000) - newVaultStatus.vaultPushTime > PUSH_TIMEOUT
  )
    delete newVaultStatus.vaultPushTime;

  const vaultMode = getVaultMode(vault);
  const triggerTxData = await fetchSpendingTx(vault.vaultTxHex, 0, explorer);
  if (triggerTxData) {
    newVaultStatus.triggerTxHex = triggerTxData.txHex;
    newVaultStatus.triggerTxBlockHeight = triggerTxData.blockHeight;
    if (vaultMode === 'LADDERED') delete newVaultStatus.triggerCpfpTxHex;
    else if (
      triggerTxData.blockHeight === 0 ||
      newVaultStatus.triggerCpfpTxHex === undefined
    ) {
      // Fetch while unconfirmed for acceleration/replacement state. Also fetch
      // once when missing so confirmed trigger fee-payer children can still be
      // recovered for history labeling.
      const triggerCpfpTxData = await fetchTriggerCpfpTxFromReserve({
        vault,
        triggerTxHex: triggerTxData.txHex,
        signer,
        network,
        explorer
      });
      if (triggerCpfpTxData)
        newVaultStatus.triggerCpfpTxHex = triggerCpfpTxData.txHex;
      else delete newVaultStatus.triggerCpfpTxHex;
    }
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
      // Now let's see if this was a rescue or spending as hot:
      const rescueTxs = vault.triggerMap[triggerTxData.txHex];
      if (!rescueTxs) throw new Error('Invalid triggerMap');
      const rescueTxHex = rescueTxs.find(
        txHex => txHex === unlockingTxData.txHex
      );

      if (rescueTxHex) {
        newVaultStatus.panicTxHex = unlockingTxData.txHex;
        newVaultStatus.panicTxBlockHeight = unlockingTxData.blockHeight;
        if (vaultMode !== 'LADDERED') {
          // Never discover rescue CPFP by scanning the shared P2A anchor script.
          // Rescue fee-payer discovery needs a future unique reserve/hint path.
          // const rescueCpfpTxData = await fetchSpendingTx(
          //   unlockingTxData.txHex,
          //   1,
          //   explorer
          // );
          if (currVaultStatus?.panicCpfpTxHex !== undefined)
            newVaultStatus.panicCpfpTxHex = currVaultStatus.panicCpfpTxHex;
          else delete newVaultStatus.panicCpfpTxHex;
        } else delete newVaultStatus.panicCpfpTxHex;
        if (newVaultStatus.panicTxBlockHeight !== 0) {
          const rescueBlockStatus = await explorer.fetchBlockStatus(
            newVaultStatus.panicTxBlockHeight
          );
          if (!rescueBlockStatus)
            throw new Error(
              `Block status should exist for existing block height: ${newVaultStatus.panicTxBlockHeight}`
            );
          newVaultStatus.panicTxBlockTime = rescueBlockStatus.blockTime;
        }
      } else {
        // Rescue tx not found - reset rescue push state since this
        // was finally spent as hot
        delete newVaultStatus.panicPushTime;
        delete newVaultStatus.panicCpfpTxHex;

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
    // Rescue tx not found - check if push time should be reset
    else if (
      newVaultStatus.panicPushTime &&
      Math.floor(Date.now() / 1000) - newVaultStatus.panicPushTime >
        PUSH_TIMEOUT
    ) {
      delete newVaultStatus.panicPushTime;
      delete newVaultStatus.panicTxHex;
      delete newVaultStatus.panicTxBlockHeight;
      delete newVaultStatus.panicTxBlockTime;
      delete newVaultStatus.panicCpfpTxHex;
    } else if (newVaultStatus.panicPushTime) {
      if (currVaultStatus?.panicTxHex !== undefined)
        newVaultStatus.panicTxHex = currVaultStatus.panicTxHex;
      if (currVaultStatus?.panicTxBlockHeight !== undefined)
        newVaultStatus.panicTxBlockHeight = currVaultStatus.panicTxBlockHeight;
      if (currVaultStatus?.panicTxBlockTime !== undefined)
        newVaultStatus.panicTxBlockTime = currVaultStatus.panicTxBlockTime;
      if (currVaultStatus?.panicCpfpTxHex !== undefined)
        newVaultStatus.panicCpfpTxHex = currVaultStatus.panicCpfpTxHex;
    } else delete newVaultStatus.panicCpfpTxHex;
  }
  // Trigger Tx NOT Found - Check if push time should be reset
  else if (
    newVaultStatus.triggerPushTime &&
    Math.floor(Date.now() / 1000) - newVaultStatus.triggerPushTime >
      PUSH_TIMEOUT
  ) {
    delete newVaultStatus.triggerPushTime;
    delete newVaultStatus.triggerTxHex;
    delete newVaultStatus.triggerTxBlockHeight;
    delete newVaultStatus.triggerTxBlockTime;
    delete newVaultStatus.triggerCpfpTxHex;
    delete newVaultStatus.panicTxHex;
    delete newVaultStatus.panicTxBlockHeight;
    delete newVaultStatus.panicTxBlockTime;
    delete newVaultStatus.panicCpfpTxHex;
  } else if (newVaultStatus.triggerPushTime) {
    if (currVaultStatus?.triggerTxHex !== undefined)
      newVaultStatus.triggerTxHex = currVaultStatus.triggerTxHex;
    if (currVaultStatus?.triggerTxBlockHeight !== undefined)
      newVaultStatus.triggerTxBlockHeight =
        currVaultStatus.triggerTxBlockHeight;
    if (currVaultStatus?.triggerTxBlockTime !== undefined)
      newVaultStatus.triggerTxBlockTime = currVaultStatus.triggerTxBlockTime;
    if (currVaultStatus?.triggerCpfpTxHex !== undefined)
      newVaultStatus.triggerCpfpTxHex = currVaultStatus.triggerCpfpTxHex;
    if (currVaultStatus?.panicTxHex !== undefined)
      newVaultStatus.panicTxHex = currVaultStatus.panicTxHex;
    if (currVaultStatus?.panicTxBlockHeight !== undefined)
      newVaultStatus.panicTxBlockHeight = currVaultStatus.panicTxBlockHeight;
    if (currVaultStatus?.panicTxBlockTime !== undefined)
      newVaultStatus.panicTxBlockTime = currVaultStatus.panicTxBlockTime;
    if (currVaultStatus?.panicCpfpTxHex !== undefined)
      newVaultStatus.panicCpfpTxHex = currVaultStatus.panicCpfpTxHex;
  } else {
    delete newVaultStatus.triggerCpfpTxHex;
    delete newVaultStatus.panicCpfpTxHex;
  }
  if (currVaultStatus && shallowEqualObjects(currVaultStatus, newVaultStatus))
    return currVaultStatus;
  else return newVaultStatus;
}

/**
 * performs a fetchVaultStatus for all vaults in parallel
 * Note that vaultsStatuses fetched are only partial since
 * vaultPushTime, triggerPushTime and the legacy panicPushTime field cannot be
 * retrieved from the network. We add them back using currVaultStatus if they
 * exist.
 * Immutable.
 */
export async function fetchVaultsStatuses(
  vaults: Vaults,
  currVaultStatuses: VaultsStatuses,
  explorer: Explorer,
  signer: Signer,
  network: Network
): Promise<VaultsStatuses> {
  const fetchPromises = Object.entries(vaults).map(async ([vaultId, vault]) => {
    const status = await fetchVaultStatus(
      vault,
      currVaultStatuses[vaultId],
      explorer,
      signer,
      network
    );
    return { [vaultId]: status };
  });

  const results = await Promise.all(fetchPromises);
  const newVaultsStatuses = results.reduce((acc, current) => {
    const vaultAddress = Object.keys(current)[0];
    if (vaultAddress === undefined) throw new Error('vaultAddress undefined');
    const vaultStatus = current[vaultAddress];
    if (vaultStatus === undefined) throw new Error('vaultStatus undefined');
    acc[vaultAddress] = vaultStatus;
    return acc;
  }, {});

  if (shallowEqualObjects(currVaultStatuses, newVaultsStatuses))
    return currVaultStatuses;
  else return newVaultsStatuses;
}

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
      return remainingBlocks === 0 || remainingBlocks === 'FOUND_AS_HOT';
    })
    .map(([, vault]) => vault.triggerDescriptor);

  // Check for duplicates
  const descriptorSet = new Set(descriptors);
  if (descriptorSet.size !== descriptors.length) {
    throw new Error(
      'triggerDescriptors should be unique; rescue key expression should be random'
    );
  }
  return descriptors;
};

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
