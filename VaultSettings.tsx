import React, { useState, useEffect } from 'react';
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

import EditableSlider from './EditableSlider';
import type { UtxosData } from './vaults';

export default function VaultSettings({
  minFeeRate,
  maxFeeRate,
  minLockBlocks,
  maxLockBlocks,
  onNewValues,
  onCancel = undefined,
  utxosData,
  formatFeeRate,
  formatLockTime
}: {
  /** next 3 arguments are needed for the fee selection Slider */
  minFeeRate: number;
  maxFeeRate: number;
  formatFeeRate: ({
    feeRate,
    utxosData
  }: {
    feeRate: number;
    utxosData?: UtxosData;
  }) => string;

  /** pass next 3 params to show the Slider for lock time selection */
  minLockBlocks?: number;
  maxLockBlocks?: number;
  formatLockTime?: (lockBlocks: number) => string;

  /** Pass this if you want to run the coinselect algo on the utxos*/
  utxosData?: UtxosData;

  onNewValues: (values: {
    utxosData?: UtxosData;
    feeRate: number;
    lockBlocks?: number;
  }) => Promise<void>;
  onCancel?: (event: GestureResponderEvent) => void;
}) {
  if (
    (minLockBlocks === undefined ||
      maxLockBlocks === undefined ||
      formatLockTime === undefined) &&
    (minLockBlocks !== undefined ||
      maxLockBlocks !== undefined ||
      formatLockTime !== undefined)
  )
    throw new Error(
      'Pass minLockBlocks, maxLockBlocks, and formatLockTime all together or none. Pass them to retrieve a number of blocks for a locking tx'
    );
  const [lockBlocks, setLockBlocks] = useState<number | null>(null);
  const [feeRate, setFeeRate] = useState<number | null>(null);
  const [coinselectedUtxosData, setCoinselectedUtxosData] =
    useState<UtxosData | null>(null);

  //Since we are not using a coinselector yet, we assume that the coinselector
  //returned all the utxos (while this is not implemented):
  //For now, on mount set it to utxosData:
  useEffect(() => {
    if (utxosData) setCoinselectedUtxosData(utxosData);
  }, []);

  useEffect(() => {
    //This is done here for 2 reasons:
    //
    //1) As a caching mechanism. This call uses memoization and computes
    //a mini-vault everytime the passed utxosData changes. It is better to
    //pre-compute it here, rather than when the user starts using the
    //Slider (which makes it a bit unresponsive)
    //The feeRate is non-important for caching the mini-vault
    //
    //2) To detect if it is impossible to create a vault based on the
    //imposed restrictions. The mini-vault uses the same restrictions as
    //the full vault and can be used to detect if it cannot be created.
    //Some of this restrictions are related to being able to have enough
    //balance to apply FEE_RATE_CEILING
    if (coinselectedUtxosData) {
      try {
        formatFeeRate({ feeRate: 1, utxosData: coinselectedUtxosData });
        console.log('formatFeeRate');
      } catch (err) {
        //This should disable the "Ok" button and display an error message
        //explaining that it is not possible to create a vault because
        //there would not be enough funds to panic from it.
        console.warn(
          'TODO: Implement this! Here we know it is not possible to create a mockup mini-vault. Not enough balance even for this small vault. just stop and warn the user.'
        );
      }
    }
  }, [coinselectedUtxosData]);

  const handlePressOutside = () => Keyboard.dismiss();
  const handleCancel = (event: GestureResponderEvent) => {
    Keyboard.dismiss();
    if (onCancel) onCancel(event);
  };

  const handleOK = () => {
    const validateUtxosData = utxosData !== undefined;
    const validateLockBlocks = minLockBlocks !== undefined;

    Keyboard.dismiss();
    const errorMessages = [];

    // Validation for lockBlocks (if requested)
    if (validateLockBlocks && lockBlocks === null) {
      errorMessages.push('Pick a valid Lock Time.');
    }

    //Validation for feeRate
    if (feeRate === null) {
      errorMessages.push(`Pick a valid Fee Rate.`);
    }

    //Validation for utxos
    if (validateUtxosData && coinselectedUtxosData === null) {
      errorMessages.push('Pick a valid amount of Btc.');
    }

    // If any errors, display them
    if (errorMessages.length > 0) {
      Alert.alert('Invalid Values', errorMessages.join('\n\n'));
      return;
    } else {
      if (feeRate === null) throw new Error(`feeRate faulty validation`);
      if (utxosData && !coinselectedUtxosData)
        throw new Error('The coinselector algorithm failed');
      onNewValues({
        feeRate,
        ...(coinselectedUtxosData ? { utxosData: coinselectedUtxosData } : {}),
        ...(lockBlocks !== null ? { lockBlocks } : {})
      });
    }
  };

  const content = (
    <View style={styles.content}>
      {minLockBlocks && maxLockBlocks && formatLockTime && (
        <View style={styles.settingGroup}>
          <Text style={styles.label}>
            Number of blocks you will need to wait to access your funds when
            unvaulting:
          </Text>
          <EditableSlider
            minimumValue={minLockBlocks}
            maximumValue={maxLockBlocks}
            step={1}
            onValueChange={value => setLockBlocks(value)}
            formatValue={value => formatLockTime(value)}
          />
        </View>
      )}
      <View style={styles.settingGroup}>
        <Text style={styles.label}>Fee Rate (sats/vbyte):</Text>
        <EditableSlider
          minimumValue={minFeeRate}
          maximumValue={maxFeeRate}
          onValueChange={value => setFeeRate(value)}
          formatValue={value =>
            formatFeeRate({
              feeRate: value,
              ...(coinselectedUtxosData
                ? { utxosData: coinselectedUtxosData }
                : {})
            })
          }
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
