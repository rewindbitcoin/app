import AddressInput from '../components/AddressInput';
import AmountInput from '../components/AmountInput';
import FeeInput from '../components/FeeInput';
import { useTranslation } from 'react-i18next';
import React, { useCallback, useMemo, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import { View } from 'react-native';
import { Text, Button, KeyboardAwareScrollView } from '../../common/ui';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { pickFeeEstimate } from '../lib/fees';
import { estimateSendRange, estimateTxSize } from '../lib/sendRange';
import { networkMapping } from '../lib/network';
import { useSettings } from '../hooks/useSettings';
import { useWallet } from '../hooks/useWallet';
import { DUMMY_CHANGE_OUTPUT, getMainAccount } from '../lib/vaultDescriptors';

export default function Send() {
  const insets = useSafeAreaInsets();
  const containerStyle = useMemo(
    () => ({ marginBottom: insets.bottom / 4 + 16 }),
    [insets.bottom]
  );
  const navigation = useNavigation();

  const { utxosData, networkId, feeEstimates, accounts } = useWallet();
  if (!utxosData)
    throw new Error('SendScreen cannot be called with unset utxos');
  if (!accounts)
    throw new Error('SendScreen cannot be called with unset accounts');
  if (!networkId)
    throw new Error('SendScreen cannot be called with unset networkId');
  if (!feeEstimates)
    throw new Error('SendScreen cannot be called with unset feeEstimates');
  const network = networkMapping[networkId];

  const { settings } = useSettings();
  if (!settings)
    throw new Error(
      'This component should only be started after settings has been retrieved from storage'
    );

  const [address, setAddress] = useState<string | null>(null);
  const { t } = useTranslation();

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
    : userSelectedAmount;

  const onUserSelectedAmountChange = useCallback(
    (userSelectedAmount: number | null) => {
      setUserSelectedAmount(userSelectedAmount);
      setIsMaxAmount(userSelectedAmount === max);
    },
    [max]
  );

  const handleOK = useCallback(() => {
    if (feeRate === null || amount === null || address === null)
      throw new Error('Cannot process Transaction');
  }, [feeRate, amount, address]);

  const changeOutput = DUMMY_CHANGE_OUTPUT(
    getMainAccount(accounts, network),
    network
  );
  const txSize = estimateTxSize({
    utxosData,
    address,
    feeRate,
    amount,
    network,
    changeOutput
  });

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
