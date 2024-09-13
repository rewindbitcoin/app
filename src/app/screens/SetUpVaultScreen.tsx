import AddressInput from '../components/AddressInput';
import AmountInput from '../components/AmountInput';
import BlocksInput from '../components/BlocksInput';
import FeeInput from '../components/FeeInput';
import LearnMoreAboutVaults from '../components/LearnMoreAboutVaults';
import { Trans, useTranslation } from 'react-i18next';
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
import { selectVaultUtxosData, type VaultSettings } from '../lib/vaults';
import {
  DUMMY_VAULT_OUTPUT,
  DUMMY_SERVICE_OUTPUT,
  DUMMY_CHANGE_OUTPUT,
  getMainAccount,
  DUMMY_PKH_ADDRESS
} from '../lib/vaultDescriptors';

import { pickFeeEstimate } from '../lib/fees';
import { formatBtc } from '../lib/btcRates';
import { estimateVaultSetUpRange } from '../lib/vaultRange';
import { networkMapping } from '../lib/network';
import { useSettings } from '../hooks/useSettings';
import { useWallet } from '../hooks/useWallet';

export default function VaultSetUp({
  onVaultSetUpComplete
}: {
  onVaultSetUpComplete: (vaultSettings: VaultSettings) => void;
}) {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const navigation = useNavigation();
  const styles = useMemo(() => getStyles(insets, theme), [insets, theme]);

  const { utxosData, networkId, feeEstimates, btcFiat, accounts } = useWallet();
  if (!utxosData)
    throw new Error('SetUpVaultScreen cannot be called with unset utxos');
  if (!accounts)
    throw new Error('SetUpVaultScreen cannot be called with unset accounts');
  if (!networkId)
    throw new Error('SetUpVaultScreen cannot be called with unset networkId');
  if (!feeEstimates)
    throw new Error(
      'SetUpVaultScreen cannot be called with unset feeEstimates'
    );
  const network = networkMapping[networkId];
  const vaultOutput = DUMMY_VAULT_OUTPUT(network);
  const serviceOutput = DUMMY_SERVICE_OUTPUT(network);

  const { settings } = useSettings();
  if (!settings)
    throw new Error(
      'This component should only be started after settings has been retrieved from storage'
    );

  const [lockBlocks, setLockBlocks] = useState<number | null>(
    settings.INITIAL_LOCK_BLOCKS
  );
  const serviceFeeRate = settings.SERVICE_FEE_RATE;
  const [coldAddress, setColdAddress] = useState<string | null>(null);
  const { t } = useTranslation();

  const initialFeeRate = pickFeeEstimate(
    feeEstimates,
    settings.INITIAL_CONFIRMATION_TIME
  );
  const [feeRate, setFeeRate] = useState<number | null>(initialFeeRate);
  const maxFeeRate = Math.max(...Object.values(feeEstimates));

  const {
    //maxVaultAmount = estimateMaxVaultAmount(feeRate)
    //This is basically calling maxFunds algo in coinselect (for feeRate) and
    //see the target values.
    //It decreases as the feeRate increases. The lowest value is for maxFeeRate.
    //See maxVaultAmountWhenMaxFee below.
    //
    //This will be the max selectable value in the Slider. The max wil change
    //when the user moves the fee slider
    maxVaultAmount,
    //
    //Particular case of maxVaultAmount (read above).
    //Used to learn if it is possible to create a vault =>
    //maxVaultAmountWhenMaxFee >= than minRecoverableVaultAmount
    maxVaultAmountWhenMaxFee,

    //minRecoverableVaultAmount = estimateMinRecoverableVaultAmount(maxFeeRate)
    //The minimum vaultable amount that is still recoverable in case of panic.
    //It is computed assuming the user chose the largest feeRate. This is to
    //prevent too much flicker in the Slider since the max already depends on
    //feeRate. So we use the most restrictive feeRate: maxFeeRate.
    //Note that minRecoverableVaultAmount is always defined since the algorithm
    //assumes a new P2PKH input will add some more funds if needed.
    //If the user has less than minRecoverableVaultAmount then we will display a
    //notEnoughFund notice in the Screen and won't allow to continue
    //
    //This will be the min selectable value in the Slider. The min is fixed
    //and does not change when the user changes the fee.
    minRecoverableVaultAmount
  }: {
    maxVaultAmount:
      | {
          vaultTxMiningFee: number;
          serviceFee: number;
          vaultedAmount: number;
          transactionAmount: number;
        }
      | undefined;
    maxVaultAmountWhenMaxFee:
      | {
          vaultTxMiningFee: number;
          serviceFee: number;
          vaultedAmount: number;
          transactionAmount: number;
        }
      | undefined;
    minRecoverableVaultAmount: {
      vaultTxMiningFee: number;
      serviceFee: number;
      vaultedAmount: number;
      transactionAmount: number;
    };
  } = estimateVaultSetUpRange({
    accounts,
    utxosData,
    coldAddress: coldAddress || DUMMY_PKH_ADDRESS(network),
    maxFeeRate,
    network,
    serviceFeeRate,
    feeRate, //If feeRate is null, then estimateVaultSetUpRange uses maxFeeRate
    feeRateCeiling: settings.PRESIGNED_FEE_RATE_CEILING,
    minRecoverableRatio: settings.MIN_RECOVERABLE_RATIO
  });
  const isValidVaultRange =
    maxVaultAmount !== undefined &&
    maxVaultAmountWhenMaxFee !== undefined &&
    maxVaultAmountWhenMaxFee.vaultedAmount >=
      minRecoverableVaultAmount.vaultedAmount;
  const missingFunds: number =
    minRecoverableVaultAmount.transactionAmount +
    minRecoverableVaultAmount.vaultTxMiningFee -
    //minus maxVaultAmountWhenMaxFee
    (maxVaultAmountWhenMaxFee
      ? maxVaultAmountWhenMaxFee.transactionAmount +
        maxVaultAmountWhenMaxFee.vaultTxMiningFee
      : 0);

  const [userSelectedVaultedAmount, setUserSelectedVaultedAmount] = useState<
    number | null
  >(isValidVaultRange ? maxVaultAmount.vaultedAmount : null);
  const [isMaxVaultedAmount, setIsMaxVaultedAmount] = useState<boolean>(
    userSelectedVaultedAmount === maxVaultAmount?.vaultedAmount
  );
  const vaultedAmount: number | null = isMaxVaultedAmount
    ? isValidVaultRange
      ? maxVaultAmount.vaultedAmount
      : null
    : userSelectedVaultedAmount;

  const onUserSelectedVaultedAmountChange = useCallback(
    (userSelectedVaultedAmount: number | null) => {
      setUserSelectedVaultedAmount(userSelectedVaultedAmount);
      setIsMaxVaultedAmount(
        userSelectedVaultedAmount === maxVaultAmount?.vaultedAmount
      );
    },
    [maxVaultAmount?.vaultedAmount]
  );

  const handleOK = useCallback(() => {
    if (
      feeRate === null ||
      vaultedAmount === null ||
      lockBlocks === null ||
      coldAddress === null
    )
      throw new Error('Cannot process Vault');
    onVaultSetUpComplete({
      coldAddress,
      feeRate,
      vaultedAmount,
      lockBlocks
    });
  }, [feeRate, vaultedAmount, lockBlocks, onVaultSetUpComplete, coldAddress]);

  let txSize = null;
  if (isValidVaultRange && vaultedAmount !== null && feeRate !== null) {
    const selected = selectVaultUtxosData({
      utxosData,
      vaultOutput,
      serviceOutput,
      changeOutput: DUMMY_CHANGE_OUTPUT(
        getMainAccount(accounts, network),
        network
      ),
      feeRate,
      vaultedAmount,
      serviceFeeRate
    });
    if (!selected)
      throw new Error(
        `vaultedAmount ${vaultedAmount} should be selectable since it's within range - [${minRecoverableVaultAmount?.vaultedAmount}, ${maxVaultAmount?.vaultedAmount}] - isValidVaultRange: ${isValidVaultRange}.`
      );
    txSize = selected.vsize;
  }

  const allFieldsValid =
    vaultedAmount !== null &&
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
            <>
              <Text className="mb-1">{t('vaultSetup.intro')}</Text>
              <LearnMoreAboutVaults />
            </>
          ) : (
            <Text>
              <Trans
                i18nKey="vaultSetup.notEnoughFunds"
                values={{
                  missingFunds: formatBtc(
                    {
                      amount: missingFunds * 1.03, //Ask for 3% more than needed
                      subUnit: settings.SUB_UNIT,
                      btcFiat,
                      locale: settings.LOCALE,
                      currency: settings.CURRENCY
                    },
                    t
                  ),
                  minRecoverableRatioPct: parseFloat(
                    (settings.MIN_RECOVERABLE_RATIO * 100).toFixed(2)
                  ).toString(),
                  feeRateCeilingK: parseFloat(
                    (settings.PRESIGNED_FEE_RATE_CEILING / 1000).toFixed(2)
                  ).toString()
                }}
                components={{
                  strong: <Text style={{ fontWeight: 'bold' }} />
                }}
              />
            </Text>
          )}
        </View>
        {isValidVaultRange && (
          <>
            <AmountInput
              isMaxAmount={isMaxVaultedAmount}
              label={t('vaultSetup.amountLabel')}
              initialValue={maxVaultAmount.vaultedAmount}
              min={minRecoverableVaultAmount.vaultedAmount}
              max={maxVaultAmount.vaultedAmount}
              onUserSelectedAmountChange={onUserSelectedVaultedAmountChange}
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
              type="emergency"
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
        {isValidVaultRange ? (
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
        {!allFieldsValid && isValidVaultRange && (
          <Text className="text-center text-orange-600 native:text-sm web:text-xs pt-2">
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
