import moize from 'moize';
import * as secp256k1 from '@bitcoinerlab/secp256k1';
import { getOutputsWithValue, UtxosData } from './vaults';

import {
  DescriptorsFactory,
  OutputInstance,
  signers
} from '@bitcoinerlab/descriptors';
const { Output } = DescriptorsFactory(secp256k1);
import { Network, Psbt } from 'bitcoinjs-lib';
import { coinselect, dustThreshold, maxFunds } from '@bitcoinerlab/coinselect';
import { DUMMY_PKH_OUTPUT, getMasterNode } from './vaultDescriptors';
import type { Signer } from './wallets';

const computeOutput = moize((address: string, network: Network) => {
  return new Output({
    descriptor: `addr(${address})`,
    network
  });
});

export const estimateSendRange = moize.shallow(
  ({
    utxosData,
    address = null,
    network,
    feeRate = null
  }: {
    utxosData: UtxosData;
    network: Network;
    address: string | null;
    feeRate: number | null;
  }) => {
    const output = address ? computeOutput(address, network) : DUMMY_PKH_OUTPUT;
    let max = 0;

    if (feeRate) {
      const coinselected = maxFunds({
        utxos: getOutputsWithValue(utxosData),
        targets: [],
        remainder: output,
        feeRate
      });
      if (coinselected)
        max = coinselected.targets.reduce((a, { value }) => a + value, 0);
    }
    return { min: dustThreshold(output) + 1, max };
  }
);

export const sendCoinselect = moize.shallow(
  ({
    utxosData,
    address,
    feeRate,
    amount,
    network,
    changeOutput
  }: {
    utxosData: UtxosData;
    address: string | null;
    feeRate: number | null;
    amount: number | null;
    network: Network;
    changeOutput: OutputInstance;
  }) => {
    if (!feeRate || !amount || !address) return null;
    const output = address ? computeOutput(address, network) : DUMMY_PKH_OUTPUT;
    const coinselected = coinselect({
      utxos: getOutputsWithValue(utxosData),
      targets: [{ output, value: amount }],
      remainder: changeOutput,
      feeRate
    });
    return coinselected;
  }
);

export const estimateTxSize = ({
  utxosData,
  address,
  feeRate,
  amount,
  network,
  changeOutput
}: {
  utxosData: UtxosData;
  address: string | null;
  feeRate: number | null;
  amount: number | null;
  network: Network;
  changeOutput: OutputInstance;
}) => {
  const coinselected = sendCoinselect({
    utxosData,
    address,
    feeRate,
    amount,
    network,
    changeOutput
  });
  if (!coinselected) return null;
  return coinselected.vsize;
};

const signPsbt = async (signer: Signer, network: Network, psbtVault: Psbt) => {
  const mnemonic = signer?.mnemonic;
  if (!mnemonic) throw new Error('Could not initialize the signer');
  const masterNode = getMasterNode(mnemonic, network);
  signers.signBIP32({ psbt: psbtVault, masterNode });
};

export const calculateTxHex = async ({
  utxosData,
  address,
  feeRate,
  amount,
  network,
  changeOutput,
  signer
}: {
  utxosData: UtxosData;
  address: string | null;
  feeRate: number | null;
  amount: number | null;
  network: Network;
  changeOutput: OutputInstance;
  signer: Signer;
}) => {
  const coinselected = sendCoinselect({
    utxosData,
    address,
    feeRate,
    amount,
    network,
    changeOutput
  });
  if (!coinselected) return null;
  const targets = coinselected.targets;

  const psbt = new Psbt({ network });
  const finalizers = [];
  for (const utxoData of utxosData) {
    const { output, vout, txHex } = utxoData;
    // Add the utxo as input of psbtVault:
    const inputFinalizer = output.updatePsbtAsInput({
      psbt,
      txHex,
      vout
    });
    finalizers.push(inputFinalizer);
  }
  for (const target of targets) {
    target.output.updatePsbtAsOutput({
      psbt,
      value: target.value
    });
  }
  //Sign
  await signPsbt(signer, network, psbt);
  //Finalize
  finalizers.forEach(finalizer => finalizer({ psbt }));
  const tx = psbt.extractTransaction(true);
  return tx.toHex();
};
