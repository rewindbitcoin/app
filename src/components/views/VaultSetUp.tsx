//TODO: share styles VaultSetUp / Unvault
//
//TODO: in web, when I click to Continue having wrong values
//a pop-up is not displayed!!!

import { Trans, useTranslation } from 'react-i18next';
import React, { useState } from 'react';
import type { GestureResponderEvent } from 'react-native';
import { View, Text, Button, StyleSheet, ScrollView } from 'react-native';
import { Toast, CustomToast } from '../common/Toast';

import { defaultSettings, Settings } from '../../lib/settings';
import {
  SETTINGS_GLOBAL_STORAGE,
  useGlobalStateStorage
} from '../../contexts/StorageContext';
import { SERIALIZABLE } from '../../lib/storage';
import EditableSlider, { snap } from '../common/EditableSlider';
import { UtxosData, selectVaultUtxosData } from '../../lib/vaults';
import {
  DUMMY_VAULT_OUTPUT,
  DUMMY_SERVICE_OUTPUT,
  DUMMY_CHANGE_OUTPUT
} from '../../lib/vaultDescriptors';

import {
  FeeEstimates,
  pickFeeEstimate,
  formatFeeRate,
  formatLockTime
} from '../../lib/fees';
import { formatBtc } from '../../lib/btcRates';
import globalStyles from '../../../styles/styles';
import type { Network } from 'bitcoinjs-lib';
import { estimateVaultSetUpRange } from '../../lib/vaultRange';

const FEE_RATE_STEP = 0.01;

export default function VaultSetUp({
  utxosData,
  network,
  feeEstimates,
  btcFiat,
  onNewValues,
  onCancel = undefined
}: {
  utxosData: UtxosData;
  network: Network;
  feeEstimates: FeeEstimates | null;
  btcFiat: number | null;
  onNewValues: (values: {
    amount: number;
    feeRate: number;
    lockBlocks: number;
  }) => Promise<void>;
  onCancel?: (event: GestureResponderEvent) => void;
}) {
  //pre-snap feeEstimates so that maxVaultAmount is not recomputed when
  //EditableSlider returns a new snapped feeRate on mount.
  //This is because the Slider operates with snapped values and returns snapped
  //values. So it's better if all the feeRates are snapped from start. This
  //is the in-depth explanation:
  //Note that initial maxVaultAmount is computed from a feeRate from pickFeeEstimate,
  //which uses feeEstimates. But later on, maxVaultAmount is computed from
  //feeRates that come from the Slider (which are snapped). If feeEstimates are
  //not snapped, them the Slider will return
  //an initial value corresponding to the snapped version of the input feeRate.
  //This snapped value may be lower than initial feeRate, making the
  //maxVaultAmount also lower than the initial one and making this component
  //show a "Maximum amount should be below XXX" error when the component
  //mounts, which is annoying.
  //Also pre-snap the whole feeEstimate so that pickFeeEstimate uses
  //snapped feeRates with snapped feeEstimates
  if (feeEstimates !== null)
    feeEstimates = Object.fromEntries(
      Object.entries(feeEstimates).map(([targetTime, feeRate]) => {
        const snappedValue = snap({
          minimumValue: Number.MIN_VALUE,
          maximumValue: Number.MAX_VALUE,
          step: FEE_RATE_STEP,
          value: feeRate
        });

        if (typeof snappedValue !== 'number') {
          throw new Error('snap function did not return a number');
        }

        return [targetTime, snappedValue];
      })
    );

  const [settingsState] = useGlobalStateStorage<Settings>(
    SETTINGS_GLOBAL_STORAGE,
    SERIALIZABLE
  );
  const settings = settingsState || defaultSettings;
  const [lockBlocks, setLockBlocks] = useState<number | null>(
    settings.INITIAL_LOCK_BLOCKS
  );
  const { t } = useTranslation();

  const initialFeeRate = feeEstimates
    ? pickFeeEstimate(feeEstimates, settings.INITIAL_CONFIRMATION_TIME)
    : settings.MIN_FEE_RATE;
  const [feeRate, setFeeRate] = useState<number | null>(initialFeeRate);

  const {
    maxFeeRate,
    // maxVaultAmount depends on the feeRate:
    maxVaultAmount,
    //The most restrictive maxVaultAmount, that is the LOWEST value possible
    //(if the user chooses the largest feeRate)
    lowestMaxVaultAmount,
    //The most restrictive minVaultAmount, that is the LARGEST value possible
    //(if the user chose the largest feeRate)
    largestMinVaultAmount
  } = estimateVaultSetUpRange({
    utxosData,
    feeEstimates,
    network,
    serviceFeeRate: settings.SERVICE_FEE_RATE,
    feeRate,
    feeRateCeiling: settings.PRESIGNED_FEE_RATE_CEILING,
    minRecoverableRatio: settings.MIN_RECOVERABLE_RATIO
  });
  console.log({ initialFeeRate, feeRate, maxVaultAmount });

  const [amount, setAmount] = useState<number | null>(maxVaultAmount || null);

  const handleCancel = (event: GestureResponderEvent) => {
    if (onCancel) onCancel(event);
  };

  const handleOK = () => {
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
      console.log('Calling Toast');
      Toast.show({
        //autoHide: false,
        type: 'error',
        text1: t('vaultSetup.invalidValues'),
        text2: errorMessages.join('\n\n')
      });
    } else {
      if (feeRate === null || amount === null || lockBlocks === null)
        throw new Error(`Faulty validation`);
      onNewValues({ feeRate, amount, lockBlocks });
    }
  };

  const missingFunds = Math.max(
    0,
    largestMinVaultAmount - lowestMaxVaultAmount
  );

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
                  formatError={({
                    lastValidSnappedValue,
                    strValue
                  }: {
                    lastValidSnappedValue: number;
                    strValue: string;
                  }) => {
                    void strValue;
                    if (lastValidSnappedValue > maxVaultAmount) {
                      return t('vaultSetup.reduceVaultAmount', {
                        amount: formatBtc(
                          {
                            amount: maxVaultAmount,
                            subUnit: settings.SUB_UNIT,
                            btcFiat,
                            locale: settings.LOCALE,
                            currency: settings.CURRENCY
                          },
                          t
                        )
                      });
                    } else return;
                  }}
                  minimumValue={largestMinVaultAmount}
                  maximumValue={maxVaultAmount}
                  value={amount}
                  onValueChange={amount => {
                    console.log('TRACE amount onValueChange', { amount });
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
                const selected =
                  feeRate !== null &&
                  amount !== null &&
                  selectVaultUtxosData({
                    utxosData,
                    vaultOutput: DUMMY_VAULT_OUTPUT(network),
                    serviceOutput: DUMMY_SERVICE_OUTPUT(network),
                    changeOutput: DUMMY_CHANGE_OUTPUT(network),
                    feeRate,
                    amount,
                    serviceFeeRate: settings.SERVICE_FEE_RATE
                  });
                if (selected) {
                  return formatFeeRate(
                    {
                      feeRate,
                      locale: settings.LOCALE,
                      currency: settings.CURRENCY,
                      txSize: selected.vsize,
                      btcFiat,
                      feeEstimates
                    },
                    t
                  );
                } else {
                  const selected =
                    feeRate !== null &&
                    maxVaultAmount !== undefined &&
                    selectVaultUtxosData({
                      utxosData,
                      vaultOutput: DUMMY_VAULT_OUTPUT(network),
                      serviceOutput: DUMMY_SERVICE_OUTPUT(network),
                      changeOutput: DUMMY_CHANGE_OUTPUT(network),
                      feeRate,
                      amount: maxVaultAmount,
                      serviceFeeRate: settings.SERVICE_FEE_RATE
                    });
                  return formatFeeRate(
                    {
                      feeRate,
                      locale: settings.LOCALE,
                      currency: settings.CURRENCY,
                      txSize: selected ? selected.vsize : null,
                      btcFiat,
                      feeEstimates
                    },
                    t
                  );
                }
              }}
            />
          </View>
          <View style={styles.buttonGroup}>
            <Button
              title={onCancel ? t('continueButton') : t('saveButton')}
              onPress={handleOK}
            />
            {onCancel && (
              <Button title={t('cancelButton')} onPress={handleCancel} />
            )}
          </View>
        </View>
      </>
    );

  //TODO: remove the Toast component below. This is only needed in Modal
  //views. HOwever, this component should stop being part of a modal in new
  //versions and the parent <Toast/> in App.tsx will be used instead aiutomaticallu
  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      style={styles.wrapper}
      contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}
    >
      {content}
      <CustomToast />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    width: '100%'
  },
  content: {
    backgroundColor: 'white',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%'
  },
  settingGroup: { marginBottom: 30, width: '100%' },
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
