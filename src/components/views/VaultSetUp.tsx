//TODO: Format formatBtc too translate. maybe move all formatters to their own file?
//TODO: When the user sends maxFunds on the slider to the right then i might not
//be sending the full utxos, may I? Because I select amount based on maxFunds
//but this is assuming 72 bytes signatures. This may not be the real maxFunds and
//I may skip a few sats
//In the fee rate validation in coinselect i have the 0.1 + 0.2 = 0.30000004 error
//      `Final fee rate ${finalFeeRate} lower than required ${feeRate}`
//TODO: Test performance with 100 UTXOs
//TODO: share styles VaultSetUp / Unvault
//TODO: Translate fees.ts (pass t and use memoization factories)
//TODO: maybe pass the formatLocTime to lockTime.ts?
import { Trans, useTranslation } from 'react-i18next';
import React, { useState } from 'react';
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

import { useSettings } from '../../contexts/SettingsContext';
import EditableSlider, { snap } from '../common/EditableSlider';
import {
  UtxosData,
  estimateVaultTxSize,
  estimateMaxVaultAmount,
  estimateMinVaultAmount,
  selectUtxosData
} from '../../lib/vaults';

import type { Locale, Currency } from '../../contexts/SettingsContext';
import {
  FeeEstimates,
  pickFeeEstimate,
  formatFeeRate,
  formatLockTime
} from '../../lib/fees';
import { formatBtc } from '../../lib/btcRates';
import globalStyles from '../../../styles/styles';
import type { TFunction } from 'i18next';

const FEE_RATE_STEP = 0.01;

/**
 * Given a feeRate, it formats the fee.
 * TODO: memoize this
 */
const formatVaultFeeRate = (
  {
    feeRate,
    feeEstimates,
    btcFiat,
    locale,
    currency,
    selectedUtxosData
  }: {
    feeRate: number;
    feeEstimates: FeeEstimates | null;
    btcFiat: number | null;
    locale: Locale;
    currency: Currency;
    selectedUtxosData: UtxosData;
  },
  t: TFunction
) => {
  const txSize = estimateVaultTxSize(selectedUtxosData);
  return formatFeeRate(
    {
      feeRate,
      locale,
      currency,
      txSize,
      btcFiat,
      feeEstimates
    },
    t
  );
};

export default function VaultSetUp({
  utxosData,
  feeEstimates,
  btcFiat,
  onNewValues,
  onCancel = undefined
}: {
  utxosData: UtxosData;
  feeEstimates: FeeEstimates | null;
  btcFiat: number | null;
  onNewValues: (values: {
    selectedUtxosData: UtxosData;
    feeRate: number;
    lockBlocks?: number;
  }) => Promise<void>;
  onCancel?: (event: GestureResponderEvent) => void;
}) {
  //console.log(feeEstimates);
  const { settings } = useSettings();
  const [lockBlocks, setLockBlocks] = useState<number | null>(
    settings.INITIAL_LOCK_BLOCKS
  );
  //const feeRateStep = 0.01;
  //const snapUpFeeRate = (feeRate: number) =>
  //  feeRateStep * Math.ceil(feeRate / feeRateStep);
  const { t } = useTranslation();

  const maxFeeRate = feeEstimates
    ? Math.max(
        // Max fee reported from electrum / esplora servers
        ...Object.values(feeEstimates),
        // Make sure maximumValue > minimumValue
        settings.MIN_FEE_RATE * 1.01
      )
    : // when feeEstimates still not available, show default values
      settings.PRESIGNED_FEE_RATE_CEILING;
  const [feeRate, setFeeRate] = useState<number | null>(
    //pre-snap feeRate so that maxVaultAmount is not recomputed when
    //EditableSlider returns a new snapped feeRate on mount
    snap({
      minimumValue: settings.MIN_FEE_RATE,
      maximumValue: maxFeeRate,
      step: FEE_RATE_STEP,
      value: feeEstimates
        ? pickFeeEstimate(feeEstimates, settings.INITIAL_CONFIRMATION_TIME)
        : settings.MIN_FEE_RATE
    })
  );

  // When the user sends max funds. It will depend on the feeRate the user picks
  const maxVaultAmount = estimateMaxVaultAmount({
    utxosData,
    // while feeRate has not been set, estimate using the largest possible
    // feeRate. We allow the maxVaultAmount to change depending on the fee
    // rate selected by the uset
    feeRate: feeRate !== null ? feeRate : maxFeeRate
  });
  //console.log({ maxVaultAmount, feeRate, maxFeeRate, utxos: utxosData.length });
  const [amount, setAmount] = useState<number | null>(maxVaultAmount || null);

  const handlePressOutside = () => Keyboard.dismiss();
  const handleCancel = (event: GestureResponderEvent) => {
    Keyboard.dismiss();
    if (onCancel) onCancel(event);
  };

  const handleOK = () => {
    Keyboard.dismiss();
    const errorMessages = [];

    // Validation for lockBlocks
    if (lockBlocks === null) {
      errorMessages.push(t('vaultSetup.lockTimeError'));
    }

    // Validation for feeRate
    if (feeRate === null) {
      errorMessages.push(t('vaultSetup.feeRateError'));
    }

    // Validation for amount
    if (amount === null) {
      errorMessages.push(t('vaultSetup.amountError'));
    }

    // If any errors, display them
    if (errorMessages.length > 0) {
      Alert.alert(t('vaultSetup.invalidValues'), errorMessages.join('\n\n'));
      return;
    } else {
      if (feeRate === null || amount === null || lockBlocks === null)
        throw new Error(`Faulty validation`);
      const selectedUtxosData = selectUtxosData({ utxosData, amount, feeRate });
      if (!selectedUtxosData)
        throw new Error('Could not extract utxos from amount');
      onNewValues({ feeRate, selectedUtxosData, lockBlocks });
    }
  };

  //The most restrictive maxVaultAmount, that is the LOWEST value possible
  //(if the user chooses the largest feeRate)
  const lowestMaxVaultAmount =
    estimateMaxVaultAmount({
      utxosData,
      feeRate: maxFeeRate
    }) || 0;
  //The most restrictive minVaultAmount, that is the LARGEST value possible
  //(if the user chose the largest feeRate)
  const largestMinVaultAmount = estimateMinVaultAmount({
    utxosData,
    // set it to worst case, so that largestMinVaultAmount does not change
    // when user interacts setting lockBlocks
    lockBlocks: 0xffff,
    // Set it to worst case: express confirmation time so that
    // largestMinVaultAmount in the Slider does not change when the user
    // changes the feeRate
    feeRate: maxFeeRate,
    feeRateCeiling: settings.PRESIGNED_FEE_RATE_CEILING,
    minRecoverableRatio: settings.MIN_RECOVERABLE_RATIO
  });
  // If user chooses the largest possible feeRate is it there a solution
  // possible?
  const missingFunds =
    lowestMaxVaultAmount > largestMinVaultAmount
      ? 0
      : largestMinVaultAmount -
        lowestMaxVaultAmount +
        1 +
        //The fee of a new pkh utxo:
        Math.ceil(maxFeeRate * 148);

  const content =
    missingFunds > 0 ? (
      <>
        <Text style={globalStyles.title}>
          {t('vaultSetup.notEnoughFundsTitle')}
        </Text>
        <View style={styles.content}>
          <Trans
            i18nKey="vaultSetup.notEnoughFunds"
            values={{
              minRecoverableRatioPercentage: Math.round(
                settings.MIN_RECOVERABLE_RATIO * 100
              ),
              missingFunds: formatBtc(
                {
                  amount: missingFunds,
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
                <View style={styles.settingGroup}>
                  <Text>{children}</Text>
                </View>
              ))
            }}
          />
          <View style={styles.buttonGroup}>
            <Button title={t('cancelButton')} onPress={handleCancel} />
          </View>
        </View>
      </>
    ) : (
      <>
        <Text style={globalStyles.title}>{t('vaultSetup.title')}</Text>
        <View style={styles.content}>
          {maxVaultAmount !== undefined &&
            largestMinVaultAmount !== undefined &&
            maxVaultAmount >= largestMinVaultAmount && (
              <View style={styles.settingGroup}>
                <Text style={styles.label}>{t('vaultSetup.amountLabel')}</Text>
                <EditableSlider
                  minimumValue={largestMinVaultAmount}
                  maximumValue={maxVaultAmount}
                  value={amount}
                  onValueChange={amount => {
                    //console.log({ amount });
                    setAmount(amount);
                  }}
                  step={1}
                  formatValue={amount =>
                    formatBtc(
                      {
                        amount,
                        subUnit: settings.SUB_UNIT,
                        btcFiat,
                        locale: settings.LOCALE,
                        currency: settings.CURRENCY
                      },
                      t
                    )
                  }
                />
              </View>
            )}
          {settings.MIN_LOCK_BLOCKS &&
            settings.MAX_LOCK_BLOCKS &&
            formatLockTime && (
              <View style={styles.settingGroup}>
                <Text style={styles.label}>
                  {t('vaultSetup.securityLockTimeLabel')}
                </Text>
                <EditableSlider
                  minimumValue={settings.MIN_LOCK_BLOCKS}
                  maximumValue={settings.MAX_LOCK_BLOCKS}
                  value={lockBlocks}
                  step={1}
                  onValueChange={setLockBlocks}
                  formatValue={value => formatLockTime(value, t)}
                />
              </View>
            )}
          <View style={styles.settingGroup}>
            <Text style={styles.label}>
              {t('vaultSetup.confirmationSpeedLabel')}
            </Text>
            <EditableSlider
              value={feeRate}
              minimumValue={settings.MIN_FEE_RATE}
              maximumValue={maxFeeRate}
              step={FEE_RATE_STEP}
              onValueChange={setFeeRate}
              formatValue={feeRate => {
                //TODO: memoize this
                //memoizing the formatVaultFeeRate will only work well
                //if selectUtxosData reference does not change (it currently does)
                const selectedUtxosData =
                  (feeRate !== null &&
                    amount !== null &&
                    selectUtxosData({ utxosData, feeRate, amount })) ||
                  utxosData;
                return formatVaultFeeRate(
                  {
                    feeRate,
                    feeEstimates,
                    btcFiat,
                    locale: settings.LOCALE,
                    currency: settings.CURRENCY,
                    selectedUtxosData
                  },
                  t
                );
              }}
            />
          </View>
          <View style={styles.buttonGroup}>
            <Button
              title={onCancel ? t('okButton') : t('saveButton')}
              onPress={handleOK}
            />
            {onCancel && (
              <Button title={t('cancelButton')} onPress={handleCancel} />
            )}
          </View>
        </View>
      </>
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
  buttonGroup: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'center',
    marginTop: 20,
    width: '60%'
  }
});
