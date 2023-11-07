import React, { useState } from 'react';
import type { GestureResponderEvent } from 'react-native';
import type { Network } from 'bitcoinjs-lib';
import {
  View,
  Text,
  TextInput,
  Button,
  Alert,
  StyleSheet,
  TouchableWithoutFeedback,
  Keyboard
} from 'react-native';

import { validateAddress } from './vaults';

import EditableSlider from './EditableSlider';

export default function VaultSettings({
  defPanicAddr,
  defLockBlocks,
  onNewValues,
  onCancel = undefined,
  network,
  isWrapped = false,
  formatFeeRate,
  formatLockTime
}: {
  defPanicAddr: string;
  defLockBlocks: string; //TODO FIX this to use number
  onNewValues: (values: {
    panicAddr: string;
    lockBlocks: number;
  }) => Promise<void>;
  onCancel?: (event: GestureResponderEvent) => void;
  network: Network;
  isWrapped?: boolean;
  formatFeeRate: (feeRate: number) => string;
  formatLockTime: (lockBlocks: number) => string;
}) {
  const [panicAddr, setPanicAddr] = useState(defPanicAddr);
  const [lockBlocks, setLockBlocks] = useState<number | null>(
    Number(defLockBlocks)
  ); //TODO FIX this to use number
  const MIN_FEE_RATE = 1; //TODO: Pass this from parent
  const MAX_FEE_RATE = 5000; //TODO: Pass this from parent
  const MIN_LOCK_BLOCKS = 1; //TODO: Pass this from parent
  const MAX_LOCK_BLOCKS = 30 * 24 * 6; //TODO: Pass this from parent
  const [feeRate, setFeeRate] = useState<number | null>(null);

  const handlePressOutside = () => Keyboard.dismiss();
  const handleCancel = (event: GestureResponderEvent) => {
    Keyboard.dismiss();
    if (onCancel) onCancel(event);
  };

  const handleOK = () => {
    Keyboard.dismiss();
    const errorMessages = [];

    // Validation for Bitcoin address
    if (!validateAddress(panicAddr, network)) {
      errorMessages.push('The provided Bitcoin address is invalid.');
    }

    // Validation for lockBlocks
    if (lockBlocks === null) {
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
      if (lockBlocks === null) throw new Error(`lockBlocks faulty validation`);
      onNewValues({ panicAddr, lockBlocks });
    }
  };

  const content = (
    <View style={styles.content}>
      <View style={styles.settingGroup}>
        <Text style={styles.label}>
          Bitcoin address that will receive the funds in case of an emergency:
        </Text>
        <TextInput
          value={panicAddr}
          onChangeText={setPanicAddr}
          style={styles.input}
        />
      </View>
      <View style={styles.settingGroup}>
        <Text style={styles.label}>
          Number of blocks you will need to wait to access your funds after
          unvaulting:
        </Text>
        <EditableSlider
          minimumValue={MIN_LOCK_BLOCKS}
          maximumValue={MAX_LOCK_BLOCKS}
          step={1}
          onValueChange={value => setLockBlocks(value)}
          formatValue={value => formatLockTime(value)}
        />
      </View>
      <View style={styles.settingGroup}>
        <Text style={styles.label}>Fee Rate (sats/vbyte):</Text>
        <EditableSlider
          minimumValue={MIN_FEE_RATE}
          maximumValue={MAX_FEE_RATE}
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

  return isWrapped ? (
    <TouchableWithoutFeedback onPress={handlePressOutside}>
      <View style={styles.wrapper}>
        <Text style={styles.title}>Defaults</Text>
        {content}
      </View>
    </TouchableWithoutFeedback>
  ) : (
    <TouchableWithoutFeedback onPress={handlePressOutside}>
      {content}
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 20,
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
