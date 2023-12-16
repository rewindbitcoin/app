//share styles VaultSetUp / Unvault
import React, { useState, useEffect } from 'react';
import type { GestureResponderEvent } from 'react-native';
import {
  View,
  Text,
  Button,
  Alert,
  StyleSheet,
  ScrollView
} from 'react-native';

import EditableSlider from '../common/EditableSlider';
import type { UtxosData } from '../../lib/vaults';

export default function Unvault({
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
    selectedUtxosData?: UtxosData;
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
  //const [amount, setAmount] = useState<number | null>(null);
  const [feeRate, setFeeRate] = useState<number | null>(null);
  const [selectedUtxosData, setSelectedUtxosData] = useState<UtxosData | null>(
    null
  );

  //Since we are not using a coinselector yet, we assume that the coinselector
  //returned all the utxos (while this is not implemented):
  //For now, on mount set it to utxosData:
  useEffect(() => {
    //TODO: make sure selectedUtxosData reference does not change if internal
    //array does not change
    if (utxosData) setSelectedUtxosData(utxosData);
  }, []);

  const handleCancel = (event: GestureResponderEvent) => {
    if (onCancel) onCancel(event);
  };

  const handleOK = () => {
    const validateUtxosData = utxosData !== undefined;
    const validateLockBlocks = minLockBlocks !== undefined;

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
    if (validateUtxosData && selectedUtxosData === null) {
      errorMessages.push('Pick a valid amount of Btc.');
    }

    // If any errors, display them
    if (errorMessages.length > 0) {
      Alert.alert('Invalid Values', errorMessages.join('\n\n'));
      return;
    } else {
      if (feeRate === null) throw new Error(`feeRate faulty validation`);
      if (utxosData && !selectedUtxosData)
        throw new Error('The coinselector algorithm failed');
      onNewValues({
        feeRate,
        ...(selectedUtxosData ? { selectedUtxosData } : {}),
        ...(lockBlocks !== null ? { lockBlocks } : {})
      });
    }
  };

  const content = (
    <View style={styles.content}>
      <View style={styles.settingGroup}>
        <Text style={styles.label}>Amount:</Text>
        <EditableSlider
          value={0}
          minimumValue={0}
          maximumValue={100}
          step={1}
          formatValue={value => `This is the amount: ${value}`}
        />
      </View>
      {minLockBlocks && maxLockBlocks && formatLockTime && (
        <View style={styles.settingGroup}>
          <Text style={styles.label}>
            Number of blocks you will need to wait to access your funds when
            unvaulting:
          </Text>
          <EditableSlider
            value={lockBlocks === null ? minLockBlocks : lockBlocks}
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
          value={feeRate === null ? minFeeRate : feeRate}
          minimumValue={minFeeRate}
          maximumValue={maxFeeRate}
          onValueChange={value => setFeeRate(value)}
          formatValue={value =>
            //TODO: maybe it's worth it to do a try catch here too and
            //disable and show an error in that case
            formatFeeRate({
              feeRate: value,
              ...(selectedUtxosData ? { selectedUtxosData } : {})
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
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}
    >
      {content}
    </ScrollView>
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
