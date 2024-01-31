//TODO: When using Bitcoin, then its not valid to pass more than 8 decimals
//TODO: print "Invalid Number"
//
//TODO: share styles VaultSetUp / Unvault
//
//TODO: in web, when I click to Continue having wrong values
//a pop-up is not displayed!!!
//TODO: when entering currency, the error message should should the min and
//max values if the value < min, then show the min, and viceversa
//TODO: when entering currency, allow USD, or BTC
//  TODO: When entering currency use the subunit (but do not adapt for large
//  quantities)

import AmountInput from '../components/AmountInput';
import BlocksInput from '../components/BlocksInput';
import { Trans, useTranslation } from 'react-i18next';
import AntDesign from '@expo/vector-icons/AntDesign';
import React, { useCallback, useMemo, useContext, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import { View, StyleSheet } from 'react-native';
import {
  Text,
  Button,
  useTheme,
  Theme,
  KeyboardAwareScrollView,
  EditableSlider,
  useToast
} from '../../common/ui';
import { EdgeInsets, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  defaultSettings,
  Settings,
  SETTINGS_GLOBAL_STORAGE
} from '../lib/settings';
import { useGlobalStateStorage } from '../../common/contexts/StorageContext';
import { SERIALIZABLE } from '../../common/lib/storage';
import { snapWithinRange } from '../../common/lib/numbers';
import { selectVaultUtxosData, type VaultSettings } from '../lib/vaults';
import {
  DUMMY_VAULT_OUTPUT,
  DUMMY_SERVICE_OUTPUT,
  DUMMY_CHANGE_OUTPUT
} from '../lib/vaultDescriptors';

import { pickFeeEstimate, formatFeeRate } from '../lib/fees';
import { WalletContext, WalletContextType } from '../contexts/WalletContext';
import { formatBtc } from '../lib/btcRates';
import globalStyles from '../styles/styles';
import { estimateVaultSetUpRange } from '../lib/vaultRange';

const FEE_RATE_STEP = 0.01;

export default function VaultSetUp({
  onVaultSetUpComplete
}: {
  onVaultSetUpComplete: (VaultSettings: VaultSettings) => void;
}) {
  const insets = useSafeAreaInsets();
  const context = useContext<WalletContextType | null>(WalletContext);
  const toast = useToast();
  const navigation = useNavigation();
  const theme = useTheme();
  const styles = getStyles(theme, insets);

  if (context === null) {
    throw new Error('Context was not set');
  }
  const { utxosData, network, feeEstimates: originalFE, btcFiat } = context;
  if (!utxosData)
    throw new Error('SetUpVaultScreen cannot be called with unset utxos');
  if (!network)
    throw new Error('SetUpVaultScreen cannot be called with unset network');
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

  const snappedFeeEstimates = useMemo(() => {
    if (!originalFE) return null;

    return Object.fromEntries(
      Object.entries(originalFE).map(([targetTime, feeRate]) => {
        const snappedWithinRange = snapWithinRange({
          minimumValue: Number.MIN_VALUE,
          maximumValue: Number.MAX_VALUE,
          step: FEE_RATE_STEP,
          value: feeRate
        });

        if (typeof snappedWithinRange !== 'number') {
          throw new Error('snap function did not return a number');
        }

        return [targetTime, snappedWithinRange];
      })
    );
  }, [originalFE]);

  const [settings] = useGlobalStateStorage<Settings>(
    SETTINGS_GLOBAL_STORAGE,
    SERIALIZABLE,
    defaultSettings
  );
  if (!settings)
    throw new Error(
      'This component should only be started after settings has been retrieved from storage'
    );

  const [lockBlocks, setLockBlocks] = useState<number | null>(
    settings.INITIAL_LOCK_BLOCKS
  );
  const { t } = useTranslation();

  const initialFeeRate = snappedFeeEstimates
    ? pickFeeEstimate(snappedFeeEstimates, settings.INITIAL_CONFIRMATION_TIME)
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
    feeEstimates: snappedFeeEstimates,
    network,
    serviceFeeRate: settings.SERVICE_FEE_RATE,
    feeRate,
    feeRateCeiling: settings.PRESIGNED_FEE_RATE_CEILING,
    minRecoverableRatio: settings.MIN_RECOVERABLE_RATIO
  });
  //console.log({ initialFeeRate, feeRate, maxVaultAmount });

  //const [amount, setAmount] = useState<number | null>(maxVaultAmount || null);

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
      toast.show(
        (errorMessages.length > 1
          ? t('vaultSetup.invalidValues') + '\n\n'
          : '') + errorMessages.join('\n'),
        { type: 'danger' }
      );
    } else {
      if (feeRate === null || amount === null || lockBlocks === null)
        throw new Error(`Faulty validation`);
      onVaultSetUpComplete({ feeRate, amount, lockBlocks });
    }
  };

  const missingFunds = Math.max(
    0,
    largestMinVaultAmount - lowestMaxVaultAmount
  );

  const onLockBlocksChange = useCallback(
    (value: number | null) => setLockBlocks(value),
    []
  );

  const [amount, setAmount] = useState<number | null>(maxVaultAmount || null);
  const onAmountChange = useCallback((amount: number | null) => {
    console.log(`SetUpVaultScreen gets ${amount}`);
    //if (maxVaultAmount === undefined)
    //  throw new Error(`onAmountChange needs a valid maxVaultAmount`);
    //console.log({ amount, maxVaultAmount });
    //setIsMaxFunds(amount === maxVaultAmount);
    setAmount(amount);
  }, []);

  const onFeeRateValueChange = useCallback(setFeeRate, [setFeeRate]);
  const formatFeeRateValue = useCallback(
    (feeRate: number) => {
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
            feeEstimates: snappedFeeEstimates
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
            feeEstimates: snappedFeeEstimates
          },
          t
        );
      }
    },
    [
      amount,
      t,
      utxosData,
      network,
      maxVaultAmount,
      settings.SERVICE_FEE_RATE,
      settings.LOCALE,
      settings.CURRENCY,
      btcFiat,
      snappedFeeEstimates
    ]
  );

  //const formatAmountError = useCallback(
  //  (invalidAmount: number) => {
  //    if (maxVaultAmount === undefined)
  //      throw new Error(`formatAmountValue needs a valid maxVaultAmount`);
  //    if (invalidAmount > maxVaultAmount) {
  //      return t('vaultSetup.reduceVaultAmount', {
  //        amount: formatBtc(
  //          {
  //            amount: maxVaultAmount,
  //            subUnit: settings.SUB_UNIT,
  //            btcFiat,
  //            locale: settings.LOCALE,
  //            currency: settings.CURRENCY
  //          },
  //          t
  //        )
  //      });
  //    } else return;
  //  },
  //  [
  //    maxVaultAmount,
  //    t,
  //    btcFiat,
  //    settings.SUB_UNIT,
  //    settings.LOCALE,
  //    settings.CURRENCY
  //  ]
  //);

  const content =
    //TODO: test missingFunds
    missingFunds > 0 ? (
      <>
        <Text style={globalStyles.title}>
          {t('vaultSetup.notEnoughFundsTitle')}
        </Text>
        <View style={styles.content}>
          <Trans
            i18nKey="vaultSetup.notEnoughFunds"
            values={{
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
            <Button onPress={navigation.goBack}>{t('cancelButton')}</Button>
          </View>
        </View>
      </>
    ) : (
      <View style={styles.content}>
        <Text variant="headlineSmall">{t('vaultSetup.subTitle')}</Text>
        <Text style={{ marginVertical: 20 }}>{t('vaultSetup.intro')}</Text>
        <Button style={{ marginBottom: 20 }} mode="text">
          {t('vaultSetup.introMoreHelp')}
        </Button>

        {maxVaultAmount !== undefined &&
          largestMinVaultAmount !== undefined &&
          maxVaultAmount >= largestMinVaultAmount && (
            <AmountInput
              label={t('vaultSetup.amountLabel')}
              initialValue={maxVaultAmount}
              min={largestMinVaultAmount}
              max={maxVaultAmount}
              onValueChange={onAmountChange}
            />
          )}

        {
          <BlocksInput
            label={t('vaultSetup.securityLockTimeLabel')}
            initialValue={settings.INITIAL_LOCK_BLOCKS}
            min={settings.MIN_LOCK_BLOCKS}
            max={settings.MAX_LOCK_BLOCKS}
            onValueChange={onLockBlocksChange}
          />
        }
        <View style={styles.settingGroup}>
          <View style={styles.cardHeader}>
            <Text variant="cardTitle" style={styles.cardTitle}>
              {t('vaultSetup.confirmationSpeedLabel')}
            </Text>
            <AntDesign name="infocirlceo" style={styles.helpIcon} />
            <View style={styles.cardModeRotator}>
              <Text style={{ fontSize: 12, color: theme.colors.cardSecondary }}>
                {t('vaultSetup.feeRate')}
              </Text>
            </View>
          </View>
          <View style={styles.card}>
            <EditableSlider
              locale={settings.LOCALE}
              initialValue={feeRate}
              minimumValue={settings.MIN_FEE_RATE}
              maximumValue={maxFeeRate}
              step={FEE_RATE_STEP}
              onValueChange={onFeeRateValueChange}
              formatValue={formatFeeRateValue}
            />
          </View>
        </View>
        <View style={styles.buttonGroup}>
          <Button onPress={navigation.goBack}>{t('cancelButton')}</Button>
          <Button onPress={handleOK}>{t('continueButton')}</Button>
        </View>
      </View>
    );

  //TODO: remove the Toast component below. This is only needed in Modal
  //views. HOwever, this component should stop being part of a modal in new
  //versions and the parent <Toast/> in App.tsx will be used instead aiutomaticallu
  //keyboardOpeningTime -> https://github.com/APSL/react-native-keyboard-aware-scroll-view/issues/571#issuecomment-1724564527
  return (
    <KeyboardAwareScrollView
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{
        alignItems: 'center',
        paddingTop: 20
        //flexGrow: 1,
        //justifyContent: 'center',
        //alignItems: 'center'
      }}
    >
      {content}
    </KeyboardAwareScrollView>
  );
}

const getStyles = (theme: Theme, insets: EdgeInsets) =>
  StyleSheet.create({
    content: {
      maxWidth: 500,
      //padding: 40,
      //backgroundColor: 'white',
      //borderRadius: 10,
      //alignItems: 'left',
      marginHorizontal: 20,
      //justifyContent: 'left',
      //width: '100%'
      marginBottom: 20 + insets.bottom
    },
    settingGroup: { marginBottom: 30, width: '100%' },
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.colors.card,
      borderRadius: 5,
      borderWidth: 0,
      padding: 10
    },
    cardHeader: {
      alignItems: 'center', // Align items vertically in the center
      flex: 1,
      flexDirection: 'row'
    },
    cardTitle: {
      marginVertical: 10,
      marginLeft: 10,
      alignSelf: 'stretch', //To ensure that textAlign works with short texts too
      textAlign: 'left'
    },
    helpIcon: {
      marginLeft: 10,
      fontSize: 16,
      color: theme.colors.primary
    },
    cardModeRotator: {
      flex: 1,
      marginRight: 10,
      flexDirection: 'row',
      //flex: 1,
      justifyContent: 'flex-end'
    },
    buttonGroup: {
      alignSelf: 'center',
      flexDirection: 'row',
      justifyContent: 'space-evenly',
      alignItems: 'center',
      marginTop: 20,
      width: '60%'
    }
  });
