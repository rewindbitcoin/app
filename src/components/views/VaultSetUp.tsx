//In the fee rate validation in coinselect i have the 0.1 + 0.2 = 0.30000004 error
//      `Final fee rate ${finalFeeRate} lower than required ${feeRate}`
//TODO: Test performance with 100 UTXOs
//TODO: Put the Fiat currency this in the Context: btcFiat - also the get currency
//TODO: I need a proper formatBitcoin and formatFiat function
//TODO: dec, 2, 7:09 i used to have 80k+ sats in hot, now less! Why!?!?!

//  This is 4: Math.ceil((0.1+0.2)*10)
//share styles VaultSetUp / Unvault
import React, { useState } from 'react';
import type { GestureResponderEvent } from 'react-native';
import {
  View,
  Text,
  Button,
  Alert,
  StyleSheet,
  TouchableWithoutFeedback,
  Keyboard
} from 'react-native';

import { useSettings } from '../../contexts/SettingsContext';
import EditableSlider from '../common/EditableSlider';
import {
  UtxosData,
  utxosDataBalance,
  estimateVaultTxSize,
  estimateMaxVaultAmount,
  estimateMinVaultAmount,
  selectUtxosData
} from '../../lib/vaults';
import {
  FeeEstimates,
  pickFeeEstimate,
  formatFeeRate,
  formatBlocks
} from '../../lib/fees';
import { Currency, formatBtc } from '../../lib/btcRates';

/**
 * Given a feeRate, it formats the fee.
 * TODO: memoize this
 */
const formatVaultFeeRate = ({
  feeRate,
  feeEstimates,
  btcFiat,
  currency,
  selectedUtxosData
}: {
  feeRate: number;
  feeEstimates: FeeEstimates | null;
  btcFiat: number | null;
  currency: Currency;
  selectedUtxosData: UtxosData;
}) => {
  const txSize = estimateVaultTxSize(selectedUtxosData);
  return formatFeeRate({ feeRate, currency, txSize, btcFiat, feeEstimates });
};

const formatLockTime = (blocks: number): string => {
  return `Spendable ${formatBlocks(blocks)} after Unvault`;
};

export default function VaultSetUp({
  utxosData,
  feeEstimates,
  btcFiat,
  onNewValues,
  onCancel = undefined
}: {
  utxosData: UtxosData;
  feeEstimates: FeeEstimates | null;
  btcFiat: number | null;
  onNewValues: (values: {
    selectedUtxosData: UtxosData;
    feeRate: number;
    lockBlocks?: number;
  }) => Promise<void>;
  onCancel?: (event: GestureResponderEvent) => void;
}) {
  const { settings } = useSettings();
  const [lockBlocks, setLockBlocks] = useState<number | null>(
    settings.INITIAL_LOCK_BLOCKS
  );
  //const feeRateStep = 0.01;
  //const snapUpFeeRate = (feeRate: number) =>
  //  feeRateStep * Math.ceil(feeRate / feeRateStep);

  const [feeRate, setFeeRate] = useState<number | null>(
    feeEstimates
      ? pickFeeEstimate(feeEstimates, settings.INITIAL_CONFIRMATION_TIME)
      : settings.MIN_FEE_RATE
  );
  const maxFeeRate = feeEstimates
    ? Math.max(
        // Max fee reported from electrum / esplora servers
        ...Object.values(feeEstimates),
        // Make sure maximumValue > minimumValue
        settings.MIN_FEE_RATE * 1.01
      )
    : // when feeEstimates still not available, show default values
      settings.PRESIGNED_FEE_RATE_CEILING;

  // When the user sends max funds. It will depend on the feeRate the user picks
  const maxVaultAmount = estimateMaxVaultAmount({
    utxosData,
    // while feeRate has not been set, estimate using the largest possible
    // feeRate. We allow the maxVaultAmount to change depending on the fee
    // rate selected by the uset
    feeRate: feeRate !== null ? feeRate : maxFeeRate
  });
  const [amount, setAmount] = useState<number | null>(maxVaultAmount || null);

  const handlePressOutside = () => Keyboard.dismiss();
  const handleCancel = (event: GestureResponderEvent) => {
    Keyboard.dismiss();
    if (onCancel) onCancel(event);
  };

  const handleOK = () => {
    Keyboard.dismiss();
    const errorMessages = [];

    // Validation for lockBlocks (if requested)
    if (lockBlocks === null) {
      errorMessages.push('Pick a valid Lock Time.');
    }

    //Validation for feeRate
    if (feeRate === null) {
      errorMessages.push(`Pick a valid Fee Rate.`);
    }

    //Validation for amount
    if (amount === null) {
      errorMessages.push('Pick a valid amount of Btc.');
    }

    // If any errors, display them
    if (errorMessages.length > 0) {
      Alert.alert('Invalid Values', errorMessages.join('\n\n'));
      return;
    } else {
      if (feeRate === null || amount === null || lockBlocks === null)
        throw new Error(`Faulty validation`);
      const selectedUtxosData = selectUtxosData({ utxosData, amount, feeRate });
      if (!selectedUtxosData)
        throw new Error('Could not extract utxos from amount');
      onNewValues({ feeRate, selectedUtxosData, lockBlocks });
    }
  };

  //The most restrictive maxVaultAmount, that is the LOWEST value possible
  //(if the user chooses the largest feeRate)
  const lowestMaxVaultAmount =
    estimateMaxVaultAmount({
      utxosData,
      feeRate: maxFeeRate
    }) || 0;
  //The most restrictive minVaultAmount, that is the LARGEST value possible
  //(if the user chose the largest feeRate)
  const largestMinVaultAmount = estimateMinVaultAmount({
    utxosData,
    // set it to worst case, so that largestMinVaultAmount does not change
    // when user interacts setting lockBlocks
    lockBlocks: 0xffff,
    // Set it to worst case: express confirmation time so that
    // largestMinVaultAmount in the Slider does not change when the user
    // changes the feeRate
    feeRate: maxFeeRate,
    feeRateCeiling: settings.PRESIGNED_FEE_RATE_CEILING,
    minRecoverableRatio: settings.MIN_RECOVERABLE_RATIO
  });
  // If user chooses the largest possible feeRate is it there a solution
  // possible?
  const missingFunds =
    lowestMaxVaultAmount > largestMinVaultAmount
      ? 0
      : largestMinVaultAmount -
        lowestMaxVaultAmount +
        1 +
        //The fee of a new pkh utxo:
        Math.ceil(maxFeeRate * 148);

  //TODO: better format of message when !enoughFunds
  const content =
    missingFunds > 0 ? (
      <View>
        <Text>
          Not enough funds, ThunderDen requests vaulting at least{' '}
          {largestMinVaultAmount} sats (after fees) so that it will be possible
          to recover at least {Math.round(settings.MIN_RECOVERABLE_RATIO * 100)}
          % of the vaulted value in case of an scenario of extreme high fees in
          the future. You currently have {utxosDataBalance(utxosData)} sats.
          However you can only vault {lowestMaxVaultAmount} at most (after
          fees), assuming you pick express confirmation times. Please add an
          additional {missingFunds} sats.
        </Text>
        <Button title="Cancel" onPress={handleCancel} />
      </View>
    ) : (
      <View style={styles.content}>
        {maxVaultAmount !== undefined &&
          largestMinVaultAmount !== undefined &&
          maxVaultAmount >= largestMinVaultAmount && (
            <View style={styles.settingGroup}>
              <Text style={styles.label}>Amount:</Text>
              <EditableSlider
                minimumValue={largestMinVaultAmount}
                maximumValue={maxVaultAmount}
                value={amount}
                onValueChange={setAmount}
                step={1}
                formatValue={amount =>
                  //TODO: memoize this
                  formatBtc({
                    amount,
                    subUnit: settings.SUB_UNIT,
                    btcFiat,
                    currency: settings.CURRENCY
                  })
                }
              />
            </View>
          )}
        {settings.MIN_LOCK_BLOCKS &&
          settings.MAX_LOCK_BLOCKS &&
          formatLockTime && (
            <View style={styles.settingGroup}>
              <Text style={styles.label}>Security Lock Time (blocks):</Text>
              <EditableSlider
                minimumValue={settings.MIN_LOCK_BLOCKS}
                maximumValue={settings.MAX_LOCK_BLOCKS}
                value={lockBlocks}
                step={1}
                onValueChange={setLockBlocks}
                formatValue={value => formatLockTime(value)}
              />
            </View>
          )}
        <View style={styles.settingGroup}>
          <Text style={styles.label}>Confirmation Speed (sat/vbyte):</Text>
          <EditableSlider
            value={feeRate}
            minimumValue={settings.MIN_FEE_RATE}
            maximumValue={maxFeeRate}
            onValueChange={setFeeRate}
            formatValue={feeRate => {
              //TODO: memoize this
              //memoizing the formatVaultFeeRate will only work well
              //if selectUtxosData reference does not change (it currently does)
              const selectedUtxosData =
                (feeRate !== null &&
                  amount !== null &&
                  selectUtxosData({ utxosData, feeRate, amount })) ||
                utxosData;
              return formatVaultFeeRate({
                feeRate,
                feeEstimates,
                btcFiat,
                currency: settings.CURRENCY,
                selectedUtxosData
              });
            }}
          />
        </View>
        <View style={styles.buttonGroup}>
          <Button title={onCancel ? 'OK' : 'Save'} onPress={handleOK} />
          {onCancel && <Button title="Cancel" onPress={handleCancel} />}
        </View>
      </View>
    );

  return (
    <TouchableWithoutFeedback onPress={handlePressOutside}>
      {content}
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  content: {
    backgroundColor: 'white',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%'
  },
  settingGroup: { marginBottom: 30 },
  label: {
    marginVertical: 10,
    fontSize: 15,
    alignSelf: 'stretch', //To ensure that textAlign works with short texts too
    textAlign: 'left',
    fontWeight: '500'
  },
  input: {
    fontSize: 15,
    padding: 10,
    borderWidth: 1,
    borderColor: 'gray',
    borderRadius: 5
  },
  buttonGroup: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
    width: '40%'
  },
  wrapper: {
    marginRight: 20,
    marginLeft: 20,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e0e0e0'
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 15
  }
});
