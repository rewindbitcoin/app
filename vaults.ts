const FEE = 500;
import { Network, Psbt, address, networks } from 'bitcoinjs-lib';
import * as secp256k1 from '@bitcoinerlab/secp256k1';
import * as descriptors from '@bitcoinerlab/descriptors';
const { Output, ECPair } = descriptors.DescriptorsFactory(secp256k1);
import { EsploraExplorer } from '@bitcoinerlab/explorer';
import { DiscoveryFactory, DiscoveryInstance } from '@bitcoinerlab/discovery';

import { compilePolicy } from '@bitcoinerlab/miniscript';
const { encode: olderEncode } = require('bip68');
import { signBIP32, signECPair } from '@bitcoinerlab/descriptors/dist/signers';
import type { BIP32Interface } from 'bip32';

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
};

export function createVault({
  nextInternalAddress,
  panicAddr,
  lockBlocks,
  masterNode,
  network,
  utxos,
  balance,
  discovery
}: {
  nextInternalAddress: string;
  panicAddr: string;
  lockBlocks: number;
  masterNode: BIP32Interface;
  network: Network;
  utxos: string[]; // Replace 'any' with a more specific type if possible
  balance: number;
  discovery: DiscoveryInstance;
}): Vault {
  ////////////////////////////////
  //Prepare the Vault Tx:
  ////////////////////////////////

  const psbtVault = new Psbt({ network });
  //Add the inputs to psbtVault:
  const vaultFinalizers = [];
  for (const utxo of utxos) {
    const [txId, strVout] = utxo.split(':');
    if (txId === undefined) throw new Error(`Error: invalid utxo`);
    const indexedDescriptor = discovery.getDescriptor({ utxo });
    if (!indexedDescriptor) throw new Error(`Error: unmatched ${utxo}`);
    const output = new Output({ ...indexedDescriptor, network });
    // Add the utxo as input of psbtVault:
    const inputFinalizer = output.updatePsbtAsInput({
      psbt: psbtVault,
      txHex: discovery.getTxHex({ txId }),
      vout: Number(strVout)
    });
    vaultFinalizers.push(inputFinalizer);
  }

  //Add the output to psbtVault:
  const vaultPair = ECPair.makeRandom();
  const vaultOutput = new Output({
    descriptor: `wpkh(${vaultPair.publicKey.toString('hex')})`,
    network
  });
  const vaultBalance = balance - FEE;
  vaultOutput.updatePsbtAsOutput({ psbt: psbtVault, value: vaultBalance });
  //Sign
  signBIP32({ psbt: psbtVault, masterNode });
  //Finalize
  vaultFinalizers.forEach(finalizer => finalizer({ psbt: psbtVault }));

  ////////////////////////////////
  //Prepare the Trigger Unvault Tx
  ////////////////////////////////

  const psbtTrigger = new Psbt({ network });
  const vaultTxHex = psbtVault.extractTransaction().toHex();
  //Add the input (vaultOutput) to psbtTrigger as input:
  const triggerInputFinalizer = vaultOutput.updatePsbtAsInput({
    psbt: psbtTrigger,
    txHex: vaultTxHex,
    vout: 0
  });
  //Prepare the output...
  const POLICY = (older: number) =>
    `or(pk(@panicKey),99@and(pk(@unvaultKey),older(${older})))`;
  const older = olderEncode({ blocks: lockBlocks });
  const { miniscript, issane } = compilePolicy(POLICY(older));
  if (!issane) throw new Error('Policy not sane');

  const panicPair = ECPair.makeRandom();
  const panicPubKey = panicPair.publicKey;
  const unvaultPair = ECPair.makeRandom();
  const unvaultPubKey = unvaultPair.publicKey;

  const triggerDescriptor = `wsh(${miniscript
    .replace('@unvaultKey', unvaultPubKey.toString('hex'))
    .replace('@panicKey', panicPubKey.toString('hex'))})`;

  const triggerOutput = new Output({ descriptor: triggerDescriptor, network });
  //Add the output to psbtTrigger:
  const triggerBalance = vaultBalance - FEE;
  triggerOutput.updatePsbtAsOutput({
    psbt: psbtTrigger,
    value: triggerBalance
  });
  //Sign
  signECPair({ psbt: psbtTrigger, ecpair: vaultPair });
  //Finalize
  triggerInputFinalizer({ psbt: psbtTrigger });
  const triggerTxHex = psbtTrigger.extractTransaction().toHex();

  //////////////////////
  //Prepare the Panic Tx
  //////////////////////

  const psbtPanic = new Psbt({ network });
  //Create the trigger output descriptor instance spendable by Panic
  const triggerOutputPanicPath = new Output({
    descriptor: triggerDescriptor,
    network,
    signersPubKeys: [panicPubKey]
  });
  //Add the input to psbtPanic:
  const panicInputFinalizer = triggerOutputPanicPath.updatePsbtAsInput({
    psbt: psbtPanic,
    txHex: triggerTxHex,
    vout: 0
  });
  //Add the output to psbtPanic:
  new Output({ descriptor: `addr(${panicAddr})`, network }).updatePsbtAsOutput({
    psbt: psbtPanic,
    value: triggerBalance - FEE
  });
  //Sign
  signECPair({ psbt: psbtPanic, ecpair: panicPair });
  //Finalize
  panicInputFinalizer({ psbt: psbtPanic });

  ////////////////////////
  //Prepare the Unvault Tx
  ////////////////////////

  const psbtUnvault = new Psbt({ network });
  //Create the trigger output descriptor instance spendable by Unvault.
  const triggerOutputUnvaultPath = new Output({
    descriptor: triggerDescriptor,
    signersPubKeys: [unvaultPubKey],
    network
  });
  //Add the input to psbtUnvault:
  const unvaultInputFinalizer = triggerOutputUnvaultPath.updatePsbtAsInput({
    psbt: psbtUnvault,
    txHex: triggerTxHex,
    vout: 0
  });
  //Add the output to psbtUnvault:
  //Consolidates into an internal BIP84 address
  new Output({
    descriptor: `addr(${nextInternalAddress})`,
    network
  }).updatePsbtAsOutput({
    psbt: psbtUnvault,
    value: triggerBalance - FEE
  });
  //Sign
  signECPair({ psbt: psbtUnvault, ecpair: unvaultPair });
  //Finalize
  unvaultInputFinalizer({ psbt: psbtUnvault });

  const vaultAddress = vaultOutput.getAddress();
  const triggerAddress = triggerOutput.getAddress();
  const panicTxHex = psbtPanic.extractTransaction().toHex();
  const unvaultTxHex = psbtUnvault.extractTransaction().toHex();

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
    vaultTime: Math.floor(Date.now() / 1000)
  };
}

export function esploraUrl(network: Network) {
  const url =
    network === networks.testnet
      ? 'https://blockstream.info/testnet/api/'
      : network === networks.bitcoin
      ? 'https://blockstream.info/api/'
      : null;
  if (!url)
    throw new Error(`Error: Esplora API not available for this network`);
  return url;
}

export async function remainingBlocks(vault: Vault, network: Network) {
  const url = esploraUrl(network);
  const explorer = new EsploraExplorer({ url });
  const { Discovery } = DiscoveryFactory(explorer, network);
  await explorer.connect();
  const discovery = new Discovery();
  const descriptor = `addr(${vault.triggerAddress})`;
  await discovery.fetch({ descriptor, gapLimit: 3 });
  const history = discovery.getHistory({ descriptor });
  const triggerBlockHeight = history[0]?.blockHeight || 0;
  const blockHeight = await explorer.fetchBlockHeight();
  await explorer.close();
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
