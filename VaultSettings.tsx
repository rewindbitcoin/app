import React, { useState } from 'react';
import type { GestureResponderEvent } from 'react-native';
import type { Network } from 'bitcoinjs-lib';
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

export default function VaultSettings({
  minFeeRate,
  maxFeeRate,
  minLockBlocks,
  maxLockBlocks,
  onNewValues,
  onCancel = undefined,
  formatFeeRate,
  formatLockTime
}: {
  minFeeRate: number;
  maxFeeRate: number;
  minLockBlocks?: number;
  maxLockBlocks?: number;
  onNewValues: (values: {
    feeRate: number;
    lockBlocks?: number;
  }) => Promise<void>;
  onCancel?: (event: GestureResponderEvent) => void;
  network: Network;
  formatFeeRate: (feeRate: number) => string;
  formatLockTime?: (lockBlocks: number) => string;
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

  const handlePressOutside = () => Keyboard.dismiss();
  const handleCancel = (event: GestureResponderEvent) => {
    Keyboard.dismiss();
    if (onCancel) onCancel(event);
  };

  const handleOK = () => {
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

    // If any errors, display them
    if (errorMessages.length > 0) {
      Alert.alert('Invalid Values', errorMessages.join('\n\n'));
      return;
    } else {
      if (validateLockBlocks) {
        if (lockBlocks === null)
          throw new Error(`lockBlocks faulty validation`);
        if (feeRate === null) throw new Error(`feeRate faulty validation`);
        onNewValues({ feeRate, lockBlocks });
      } else {
        if (feeRate === null) throw new Error(`feeRate faulty validation`);
        onNewValues({ feeRate });
      }
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
          formatValue={value => formatFeeRate(value)}
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
