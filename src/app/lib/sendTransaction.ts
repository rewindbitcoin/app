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
    let max: number | null = null;

    const utxos = getOutputsWithValue(utxosData);

    if (feeRate !== null && feeRate > 0 && utxos.length) {
      const coinselected = maxFunds({
        utxos,
        targets: [],
        remainder: output,
        feeRate
      });
      if (coinselected)
        max = coinselected.targets.reduce((a, { value }) => a + value, 0);
    }

    let maxWhen1SxB = null;
    if (utxos.length) {
      const coinselected1SxB = maxFunds({
        utxos,
        targets: [],
        remainder: output,
        feeRate: 1
      });
      if (coinselected1SxB)
        maxWhen1SxB = coinselected1SxB.targets.reduce(
          (a, { value }) => a + value,
          0
        );
    }

    return { min: dustThreshold(output) + 1, max, maxWhen1SxB };
  }
);

const sendCoinselect = moize.shallow(
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
    const utxos = getOutputsWithValue(utxosData);
    if (!feeRate || !amount || !address || !utxos.length) return null;
    const output = address ? computeOutput(address, network) : DUMMY_PKH_OUTPUT;
    const coinselected = coinselect({
      utxos,
      targets: [{ output, value: amount }],
      remainder: changeOutput,
      feeRate
    });
    return coinselected;
  }
);

export const estimateSendTxFee = ({
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
  return coinselected.fee;
};

const signPsbt = async (signer: Signer, network: Network, psbtVault: Psbt) => {
  const mnemonic = signer?.mnemonic;
  if (!mnemonic) throw new Error('Could not initialize the signer');
  const masterNode = getMasterNode(mnemonic, network);
  signers.signBIP32({ psbt: psbtVault, masterNode });
};

export const calculateTx = async ({
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
  const utxos = getOutputsWithValue(utxosData);
  const sendUtxosData =
    coinselected.utxos.length === utxosData.length
      ? utxosData
      : coinselected.utxos.map(utxo => {
          const utxoData = utxosData[utxos.indexOf(utxo)];
          if (!utxoData) throw new Error('Invalid utxoData');
          return utxoData;
        });

  const psbt = new Psbt({ network });
  const finalizers = [];
  for (const utxoData of sendUtxosData) {
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
  if (psbt.getFee() !== coinselected.fee)
    throw new Error(
      'Final fee in the psbt differs from the one after coinselect'
    );
  return {
    txHex: tx.toHex(),
    fee: coinselected.fee
  };
};
