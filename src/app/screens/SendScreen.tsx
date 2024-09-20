import AddressInput from '../components/AddressInput';
import AmountInput from '../components/AmountInput';
import FeeInput from '../components/FeeInput';
import { useTranslation } from 'react-i18next';
import React, { useCallback, useMemo, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import { View } from 'react-native';
import {
  Text,
  Button,
  KeyboardAwareScrollView,
  useToast
} from '../../common/ui';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { pickFeeEstimate } from '../lib/fees';
import {
  estimateSendRange,
  estimateTxSize,
  calculateTxHex
} from '../lib/sendTransaction';
import { networkMapping } from '../lib/network';
import { useSettings } from '../hooks/useSettings';
import { useWallet } from '../hooks/useWallet';
import {
  computeChangeOutput,
  DUMMY_CHANGE_OUTPUT,
  getMainAccount
} from '../lib/vaultDescriptors';

export default function Send() {
  const insets = useSafeAreaInsets();
  const containerStyle = useMemo(
    () => ({ marginBottom: insets.bottom / 4 + 16 }),
    [insets.bottom]
  );
  const navigation = useNavigation();

  const {
    utxosData,
    networkId,
    feeEstimates,
    accounts,
    getNextChangeDescriptorWithIndex,
    txPushAndUpdateStates,
    signers
  } = useWallet();

  if (!utxosData)
    throw new Error('SendScreen cannot be called with unset utxos');
  if (!accounts)
    throw new Error('SendScreen cannot be called with unset accounts');
  if (!networkId)
    throw new Error('SendScreen cannot be called with unset networkId');
  if (!feeEstimates)
    throw new Error('SendScreen cannot be called with unset feeEstimates');
  if (!signers)
    throw new Error('SendScreen cannot be called with unset signers');
  const signer = signers[0];
  if (!signer) throw new Error('signer unavailable');
  const network = networkMapping[networkId];

  const goBack = useCallback(() => {
    //goBack will unmount this screen as per react-navigation docs.
    if (navigation.canGoBack()) navigation.goBack();
  }, [navigation]);

  const { settings } = useSettings();
  if (!settings)
    throw new Error(
      'This component should only be started after settings has been retrieved from storage'
    );

  const [address, setAddress] = useState<string | null>(null);
  const { t } = useTranslation();
  const toast = useToast();

  const initialFeeRate = pickFeeEstimate(
    feeEstimates,
    settings.INITIAL_CONFIRMATION_TIME
  );

  const [feeRate, setFeeRate] = useState<number | null>(initialFeeRate);

  const { min, max } = estimateSendRange({
    utxosData,
    address,
    network,
    feeRate
  });
  ////console.log({ min, max });
  //const min = 547;
  //const max = 7998655;

  const isValidRange = max >= min;

  const [userSelectedAmount, setUserSelectedAmount] = useState<number | null>(
    isValidRange ? max : null
  );
  const [isMaxAmount, setIsMaxAmount] = useState<boolean>(
    userSelectedAmount === max
  );
  const amount: number | null = isMaxAmount
    ? isValidRange
      ? max
      : null
    : //note userSelectedAmount could be briefly out of current [min, max]
      //since it's updated on a callback later
      userSelectedAmount
      ? Math.min(Math.max(min, userSelectedAmount), max)
      : null;

  const onUserSelectedAmountChange = useCallback(
    (userSelectedAmount: number | null) => {
      setUserSelectedAmount(userSelectedAmount);
      setIsMaxAmount(userSelectedAmount === max);
    },
    [max]
  );

  const handleOK = useCallback(async () => {
    if (feeRate === null || amount === null || address === null)
      throw new Error('Cannot process Transaction');
    let txHex;
    try {
      const changeDescriptorWithIndex =
        await getNextChangeDescriptorWithIndex();
      if (!changeDescriptorWithIndex)
        throw new Error('Impossible to obtain a new change descriptor');
      const changeOutput = computeChangeOutput(
        changeDescriptorWithIndex,
        network
      );
      txHex = await calculateTxHex({
        signer,
        utxosData,
        address,
        feeRate,
        amount,
        network,
        changeOutput
      });
    } catch (err) {
      console.warn(err);
      toast.show(t('send.txCalculateError'), { type: 'warning' });
    }
    try {
      if (txHex) {
        await txPushAndUpdateStates(txHex);
        toast.show(t('send.txSuccess'), { type: 'success' });
      }
    } catch (err) {
      console.warn(err);
      toast.show(t('send.txPushError'), { type: 'warning' });
    }
    goBack();
  }, [
    toast,
    signer,
    utxosData,
    network,
    getNextChangeDescriptorWithIndex,
    goBack,
    txPushAndUpdateStates,
    t,
    feeRate,
    amount,
    address
  ]);

  const txSize = estimateTxSize({
    utxosData,
    address,
    feeRate,
    amount,
    network,
    changeOutput: DUMMY_CHANGE_OUTPUT(
      getMainAccount(accounts, network),
      network
    )
  });
  //const txSize = 200;

  const allFieldsValid =
    amount !== null && feeRate !== null && address !== null;

  return (
    <KeyboardAwareScrollView
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      contentContainerClassName="items-center pt-5 px-5"
    >
      {isValidRange ? (
        <View className="w-full max-w-screen-sm mx-4" style={containerStyle}>
          <AddressInput
            type="external"
            networkId={networkId}
            onValueChange={setAddress}
          />
          <View className="mb-8" />
          <AmountInput
            isMaxAmount={isMaxAmount}
            label={t('send.amountLabel')}
            initialValue={max}
            min={min}
            max={max}
            onUserSelectedAmountChange={onUserSelectedAmountChange}
          />
          <View className="mb-8" />
          <FeeInput
            initialValue={initialFeeRate}
            txSize={txSize}
            label={t('send.confirmationSpeedLabel')}
            onValueChange={setFeeRate}
          />
          <View className="self-center flex-row justify-center items-center mt-5 gap-5">
            <Button onPress={navigation.goBack}>{t('cancelButton')}</Button>
            <Button disabled={!allFieldsValid} onPress={handleOK}>
              {t('continueButton')}
            </Button>
          </View>
        </View>
      ) : (
        <View
          className="w-full max-w-screen-sm mx-4"
          style={{ marginBottom: insets.bottom / 4 + 16 }}
        >
          <Text className="mb-8">{t('send.notEnoughFunds')}</Text>
          <Button onPress={navigation.goBack}>{t('goBack')}</Button>
        </View>
      )}
    </KeyboardAwareScrollView>
  );
}
