import React, { useState, useRef } from 'react';
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

export default function VaultSettings({
  defPanicAddr,
  defLockBlocks,
  onNewValues,
  onCancel = undefined,
  network,
  isWrapped = false
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
}) {
  const [panicAddr, setPanicAddr] = useState(defPanicAddr);
  const [lockBlocks, setLockBlocks] = useState<number | ''>(
    Number(defLockBlocks)
  ); //TODO FIX this to use number

  const panicAddrRef = useRef<TextInput>(null);
  const lockBlocksRef = useRef<TextInput>(null);

  const handleOKPress = () => {
    const errorMessages = [];

    // Validation for Bitcoin address
    if (!validateAddress(panicAddr, network)) {
      errorMessages.push(
        'The provided Bitcoin address is invalid. Reverting to previous value.'
      );
      setPanicAddr(defPanicAddr);
    }

    // Validation for lockBlocks
    if (lockBlocks === '' || !Number.isInteger(lockBlocks) || lockBlocks < 1) {
      errorMessages.push(
        'The block value must be an integer greater than or equal to 1. Reverting to previous value.'
      );
      setLockBlocks(Number(defLockBlocks));
    }

    // If any errors, display them
    if (errorMessages.length > 0) {
      Alert.alert('Invalid Values', errorMessages.join('\n\n'));
      return;
    }

    if (panicAddrRef.current) panicAddrRef.current.blur();
    if (lockBlocksRef.current) lockBlocksRef.current.blur();
    if (lockBlocks === '') throw new Error(`Error: could not set lockBlocks`);
    onNewValues({ panicAddr, lockBlocks });
  };

  const handlePressOutside = () => Keyboard.dismiss();

  const content = (
    <View style={styles.content}>
      <Text style={styles.label}>
        Bitcoin address that will receive the funds in case of an emergency:
      </Text>
      <TextInput
        ref={panicAddrRef}
        value={panicAddr}
        onChangeText={setPanicAddr}
        style={styles.input}
      />
      <Text style={styles.label}>
        Number of blocks you will need to wait to access your funds after
        triggering the unvault process:
      </Text>
      <TextInput
        ref={lockBlocksRef}
        value={String(lockBlocks)}
        onChangeText={text => {
          const numericValue = Number(text);
          setLockBlocks(isNaN(numericValue) ? '' : numericValue);
        }}
        keyboardType="number-pad"
        style={styles.input}
      />

      <View style={styles.buttonGroup}>
        <Button title={onCancel ? 'OK' : 'Save'} onPress={handleOKPress} />
        {onCancel && <Button title="Cancel" onPress={onCancel} />}
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
  label: {
    marginVertical: 10,
    fontSize: 15,
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
