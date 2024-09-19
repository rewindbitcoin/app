import moize from 'moize';
import * as secp256k1 from '@bitcoinerlab/secp256k1';
import { getOutputsWithValue, UtxosData } from './vaults';

import { DescriptorsFactory, OutputInstance } from '@bitcoinerlab/descriptors';
const { Output } = DescriptorsFactory(secp256k1);
import { Network } from 'bitcoinjs-lib';
import { coinselect, dustThreshold, maxFunds } from '@bitcoinerlab/coinselect';
import { DUMMY_PKH_OUTPUT } from './vaultDescriptors';
import { add } from 'react-native-libsodium';

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

export const estimateTxSize = moize.shallow(
  ({
    utxosData,
    address = null,
    feeRate = null,
    amount = null,
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
    if (!coinselected) return null;
    return coinselected.vsize;
  }
);
