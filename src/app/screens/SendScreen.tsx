import AddressInput from '../components/AddressInput';
import AmountInput from '../components/AmountInput';
import FeeInput from '../components/FeeInput';
import { useTranslation } from 'react-i18next';
import React, { useCallback, useState, useMemo } from 'react';
import { useNavigation } from '@react-navigation/native';
import { View, StyleSheet } from 'react-native';
import {
  Text,
  Button,
  KeyboardAwareScrollView,
  useTheme,
  Theme
} from '../../common/ui';
import { EdgeInsets, useSafeAreaInsets } from 'react-native-safe-area-context';

import { pickFeeEstimate } from '../lib/fees';
import { estimateSendRange, estimateTxSize } from '../lib/sendRange';
import { networkMapping } from '../lib/network';
import { useSettings } from '../hooks/useSettings';
import { useWallet } from '../hooks/useWallet';
import { DUMMY_CHANGE_OUTPUT, getMainAccount } from '../lib/vaultDescriptors';

export default function Send() {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const navigation = useNavigation();
  const styles = useMemo(() => getStyles(insets, theme), [insets, theme]);

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
      contentContainerStyle={styles.contentContainer}
    >
      <View style={styles.content}>
        {isValidRange && (
          <>
            <AmountInput
              isMaxAmount={isMaxAmount}
              label={t('vaultSetup.amountLabel')}
              initialValue={max}
              min={min}
              max={max}
              onUserSelectedAmountChange={onUserSelectedAmountChange}
            />
            <View style={styles.cardSeparator} />
            <AddressInput
              type="external"
              networkId={networkId}
              onValueChange={setAddress}
            />
            <View style={styles.cardSeparator} />
            <FeeInput
              initialValue={initialFeeRate}
              txSize={txSize}
              label={t('vaultSetup.confirmationSpeedLabel')}
              onValueChange={setFeeRate}
            />
          </>
        )}
        {isValidRange ? (
          <View style={styles.buttonGroup}>
            <Button onPress={navigation.goBack}>{t('cancelButton')}</Button>
            <View style={styles.buttonSpacing}>
              <Button disabled={!allFieldsValid} onPress={handleOK}>
                {t('continueButton')}
              </Button>
            </View>
          </View>
        ) : (
          <Button onPress={navigation.goBack}>{t('goBack')}</Button>
        )}
        {!allFieldsValid && isValidRange && (
          <Text className="text-center text-orange-600 native:text-sm web:text-xs pt-2">
            {address
              ? t('vaultSetup.fillInAll')
              : t('vaultSetup.addressMissing')}
          </Text>
        )}
      </View>
    </KeyboardAwareScrollView>
  );
}

const getStyles = (insets: EdgeInsets, theme: Theme) =>
  StyleSheet.create({
    contentContainer: {
      alignItems: 'center',
      paddingTop: 20,
      paddingHorizontal: 20
    },
    content: {
      width: '100%',
      maxWidth: 500,
      marginHorizontal: theme.screenMargin,
      marginBottom: theme.screenMargin + insets.bottom
    },
    cardSeparator: { marginBottom: 2 * theme.screenMargin },
    intro: {
      marginBottom: 2 * theme.screenMargin
    },
    missingFundsGroup: { marginBottom: theme.screenMargin },
    buttonGroup: {
      alignSelf: 'center',
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      marginTop: 20
    },
    buttonSpacing: { marginLeft: 20 }
  });
