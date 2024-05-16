import AddressInput from '../components/AddressInput';
import AmountInput from '../components/AmountInput';
import BlocksInput from '../components/BlocksInput';
import FeeInput from '../components/FeeInput';
import { Trans, useTranslation } from 'react-i18next';
import React, { useCallback, useContext, useState, useMemo } from 'react';
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
import { selectVaultUtxosData, type VaultSettings } from '../lib/vaults';
import {
  DUMMY_VAULT_OUTPUT,
  DUMMY_SERVICE_OUTPUT,
  DUMMY_CHANGE_OUTPUT
} from '../lib/vaultDescriptors';

import { pickFeeEstimate } from '../lib/fees';
import { WalletContext, WalletContextType } from '../contexts/WalletContext';
import { formatBtc } from '../lib/btcRates';
import { estimateVaultSetUpRange } from '../lib/vaultRange';
import { networkMapping } from '../lib/network';
import { useSettings } from '../hooks/useSettings';

export default function VaultSetUp({
  onVaultSetUpComplete
}: {
  onVaultSetUpComplete: (vaultSettings: VaultSettings) => void;
}) {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const context = useContext<WalletContextType | null>(WalletContext);
  const navigation = useNavigation();
  const styles = useMemo(() => getStyles(insets, theme), [insets, theme]);

  if (context === null) {
    throw new Error('Context was not set');
  }
  const { utxosData, networkId, feeEstimates, btcFiat } = context;
  if (!utxosData)
    throw new Error('SetUpVaultScreen cannot be called with unset utxos');
  if (!networkId)
    throw new Error('SetUpVaultScreen cannot be called with unset networkId');
  if (!feeEstimates)
    throw new Error(
      'SetUpVaultScreen cannot be called with unset feeEstimates'
    );
  const network = networkMapping[networkId];

  const { settings } = useSettings();
  if (!settings)
    throw new Error(
      'This component should only be started after settings has been retrieved from storage'
    );

  const [lockBlocks, setLockBlocks] = useState<number | null>(
    settings.INITIAL_LOCK_BLOCKS
  );
  const [coldAddress, setColdAddress] = useState<string | null>(null);
  const { t } = useTranslation();

  const initialFeeRate = pickFeeEstimate(
    feeEstimates,
    settings.INITIAL_CONFIRMATION_TIME
  );
  const [feeRate, setFeeRate] = useState<number | null>(initialFeeRate);
  const maxFeeRate = Math.max(...Object.values(feeEstimates));

  const {
    //max vault amount, given the current feeRate: This will be the max
    //selectable value in the Slider
    maxVaultAmount,
    //The most restrictive maxVaultAmount, that is the LOWEST value possible
    //(computed assuming the user chose the largest feeRate)
    lowestMaxVaultAmount,
    //The most restrictive minVaultAmount, that is the LARGEST value possible
    //(computed assuming the user chose the largest feeRate):
    //This will be the min selectable value in the Slider
    largestMinVaultAmount
  }: {
    maxVaultAmount: number | undefined;
    lowestMaxVaultAmount: number;
    largestMinVaultAmount: number;
  } = estimateVaultSetUpRange({
    utxosData,
    maxFeeRate,
    network,
    serviceFeeRate: settings.SERVICE_FEE_RATE,
    feeRate, //If feeRate is null, then estimateVaultSetUpRange uses maxFeeRate
    feeRateCeiling: settings.PRESIGNED_FEE_RATE_CEILING,
    minRecoverableRatio: settings.MIN_RECOVERABLE_RATIO
  });
  const isValidVaultRange =
    maxVaultAmount !== undefined &&
    lowestMaxVaultAmount >= largestMinVaultAmount;
  const missingFunds: number = largestMinVaultAmount - lowestMaxVaultAmount;

  const [userSelectedAmount, setUserSelectedAmount] = useState<number | null>(
    isValidVaultRange ? maxVaultAmount : null
  );
  const [isMaxAmount, setIsMaxAmount] = useState<boolean>(
    userSelectedAmount === maxVaultAmount
  );
  const amount: number | null = isMaxAmount
    ? isValidVaultRange
      ? maxVaultAmount
      : null
    : userSelectedAmount;

  const onUserSelectedAmountChange = useCallback(
    (userSelectedAmount: number | null) => {
      setUserSelectedAmount(userSelectedAmount);
      setIsMaxAmount(userSelectedAmount === maxVaultAmount);
    },
    [maxVaultAmount]
  );

  const handleOK = useCallback(() => {
    if (
      feeRate === null ||
      amount === null ||
      lockBlocks === null ||
      coldAddress === null
    )
      throw new Error('Cannot process Vault');
    onVaultSetUpComplete({ coldAddress, feeRate, amount, lockBlocks });
  }, [feeRate, amount, lockBlocks, onVaultSetUpComplete, coldAddress]);

  const txSize =
    amount === null || feeRate === null
      ? null
      : selectVaultUtxosData({
          utxosData,
          vaultOutput: DUMMY_VAULT_OUTPUT(network),
          serviceOutput: DUMMY_SERVICE_OUTPUT(network),
          changeOutput: DUMMY_CHANGE_OUTPUT(network),
          feeRate,
          amount,
          serviceFeeRate: settings.SERVICE_FEE_RATE
        })?.vsize || null;

  const allFieldsValid =
    amount !== null &&
    lockBlocks !== null &&
    feeRate !== null &&
    coldAddress !== null;

  return (
    <KeyboardAwareScrollView
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.contentContainer}
    >
      <View style={styles.content}>
        <View style={styles.intro}>
          {isValidVaultRange ? (
            <Text>{t('vaultSetup.intro')}</Text>
          ) : (
            <Trans
              i18nKey="vaultSetup.notEnoughFunds"
              values={{
                missingFunds: formatBtc(
                  {
                    amount: missingFunds * 1.1, //Ask for 10% more than needed
                    subUnit: settings.SUB_UNIT,
                    btcFiat,
                    locale: settings.LOCALE,
                    currency: settings.CURRENCY
                  },
                  t
                )
              }}
              components={{
                strong: <Text style={{ fontWeight: 'bold' }} />,
                group: React.createElement(({ children }) => (
                  <View style={styles.missingFundsGroup}>
                    <Text>{children}</Text>
                  </View>
                ))
              }}
            />
          )}
          <View className="self-start" style={styles.introMoreHelpButton}>
            <Button mode="text">{t('vaultSetup.introMoreHelp')}</Button>
          </View>
        </View>
        {isValidVaultRange && (
          <>
            <AmountInput
              isMaxAmount={isMaxAmount}
              label={t('vaultSetup.amountLabel')}
              initialValue={maxVaultAmount}
              min={largestMinVaultAmount}
              max={maxVaultAmount}
              onUserSelectedAmountChange={onUserSelectedAmountChange}
            />
            <View style={styles.cardSeparator} />
            <BlocksInput
              label={t('vaultSetup.securityLockTimeLabel')}
              initialValue={settings.INITIAL_LOCK_BLOCKS}
              min={settings.MIN_LOCK_BLOCKS}
              max={settings.MAX_LOCK_BLOCKS}
              onValueChange={setLockBlocks}
            />
            <View style={styles.cardSeparator} />
            <AddressInput
              allowCreate
              networkId={networkId}
              onValueChange={setColdAddress}
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
        <View style={styles.buttonGroup}>
          <Button onPress={navigation.goBack}>{t('cancelButton')}</Button>
          {
            <View style={styles.buttonSpacing}>
              <Button disabled={!allFieldsValid} onPress={handleOK}>
                {t('continueButton')}
              </Button>
            </View>
          }
        </View>
        {!allFieldsValid && (
          <Text className="text-center text-amber-600 native:text-sm web:text-xs pt-2">
            {coldAddress
              ? t('vaultSetup.fillInAll')
              : t('vaultSetup.coldAddressMissing')}
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
      paddingHorizontal: 8
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
    introMoreHelpButton: { marginTop: theme.screenMargin },
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
