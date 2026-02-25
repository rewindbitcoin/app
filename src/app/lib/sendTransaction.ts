// Copyright (C) 2025 Jose-Luis Landabaso - https://rewindbitcoin.com
// Licensed under the GNU GPL v3 or later. See the LICENSE file for details.

import moize from 'moize';
import { getOutputsWithValue, UtxosData } from './vaults';

import { OutputInstance, signers } from '@bitcoinerlab/descriptors';
import { ensureDescriptorsFactoryInstance } from './descriptorsFactory';
import { Network, Psbt } from 'bitcoinjs-lib';
import { coinselect, dustThreshold, maxFunds } from '@bitcoinerlab/coinselect';
import { DUMMY_PKH_OUTPUT, getMasterNode } from './vaultDescriptors';
import type { Signer } from './wallets';
import { satsToNumber, toSats } from './sats';

type CoinselectUtxo = {
  output: OutputInstance;
  value: bigint;
};

type SendCoinselectResult = {
  fee: bigint;
  vsize: number;
  targets: Array<{ output: OutputInstance; value: bigint }>;
  selectedUtxos: Array<CoinselectUtxo>;
  allUtxos: Array<CoinselectUtxo>;
};

const computeOutput = moize((address: string, network: Network) => {
  const { Output } = ensureDescriptorsFactoryInstance();
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
    const output = address
      ? computeOutput(address, network)
      : DUMMY_PKH_OUTPUT();
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
        max = coinselected.targets.reduce(
          (a, { value }) => a + satsToNumber(value, 'max target'),
          0
        );
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
          (a, { value }) => a + satsToNumber(value, 'max1 target'),
          0
        );
    }

    return {
      min: satsToNumber(dustThreshold(output), 'send dust threshold') + 1,
      max,
      maxWhen1SxB
    };
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
  }): SendCoinselectResult | null => {
    const utxos = getOutputsWithValue(utxosData);
    if (!feeRate || !amount || !address || !utxos.length) return null;
    const output = address
      ? computeOutput(address, network)
      : DUMMY_PKH_OUTPUT();
    const amountSats = toSats(amount, 'send amount');
    const coinselected = coinselect({
      utxos,
      targets: [{ output, value: amountSats }],
      remainder: changeOutput,
      feeRate
    });
    if (!coinselected) return null;
    return {
      fee: coinselected.fee,
      vsize: coinselected.vsize,
      targets: coinselected.targets,
      selectedUtxos: coinselected.utxos,
      allUtxos: utxos
    };
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
  return satsToNumber(coinselected.fee, 'send estimated fee');
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
  const sendUtxosData =
    coinselected.selectedUtxos.length === utxosData.length
      ? utxosData
      : coinselected.selectedUtxos.map(utxo => {
          const utxoData = utxosData[coinselected.allUtxos.indexOf(utxo)];
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
    fee: satsToNumber(coinselected.fee, 'send selected fee')
  };
};
