import AddressInput from '../components/AddressInput';
import AmountInput from '../components/AmountInput';
import FeeInput from '../components/FeeInput';
import { useTranslation } from 'react-i18next';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import { useNavigation } from '@react-navigation/native';
import { View, Text, LayoutChangeEvent } from 'react-native';
import {
  Button,
  IconType,
  KeyboardAwareScrollView,
  Modal,
  useToast
} from '../../common/ui';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  computeMaxAllowedFeeRate,
  FeeEstimates,
  pickFeeEstimate
} from '../lib/fees';
import {
  estimateSendRange,
  estimateSendTxFee,
  calculateTx
} from '../lib/sendTransaction';
import { networkMapping } from '../lib/network';
import { useSettings } from '../hooks/useSettings';
import { useWallet } from '../hooks/useWallet';
import {
  computeChangeOutput,
  DUMMY_CHANGE_OUTPUT,
  getMainAccount
} from '../lib/vaultDescriptors';
import { formatBtc } from '../lib/btcRates';
import { OutputInstance } from '@bitcoinerlab/descriptors';
import useFirstDefinedValue from '~/common/hooks/useFirstDefinedValue';
import useArrayChangeDetector from '~/common/hooks/useArrayChangeDetector';
import { useLocalization } from '../hooks/useLocalization';

export default function Send() {
  const insets = useSafeAreaInsets();
  const containerStyle = useMemo(
    () => ({ marginBottom: insets.bottom / 4 + 16 }),
    [insets.bottom]
  );

  const navigation = useNavigation();

  const {
    feeEstimates: feeEstimatesRealTime,
    btcFiat: btcFiatRealTime,
    utxosData,
    networkId,
    accounts,
    getNextChangeDescriptorWithIndex,
    txPushAndUpdateStates,
    signers
  } = useWallet();

  //Warn the user and reset this component if wallet changes.
  const walletChanged = useArrayChangeDetector([
    utxosData,
    networkId,
    accounts
  ]);

  //Cache to avoid flickering in the Sliders
  const btcFiat = useFirstDefinedValue<number>(btcFiatRealTime);
  const feeEstimates = useFirstDefinedValue<FeeEstimates>(feeEstimatesRealTime);

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

  const { locale, currency } = useLocalization();

  const [address, setAddress] = useState<string | null>(null);
  const [isConfirm, setIsConfirm] = useState<boolean>(false);
  const { t } = useTranslation();
  const toast = useToast();

  const [changeOutput, setChangeOutput] = useState<OutputInstance | null>(null);

  useEffect(() => {
    const getAndSetChangeOutput = async () => {
      const changeDescriptorWithIndex =
        await getNextChangeDescriptorWithIndex(accounts);
      setChangeOutput(computeChangeOutput(changeDescriptorWithIndex, network));
    };
    getAndSetChangeOutput();
  }, [getNextChangeDescriptorWithIndex, network, accounts]);

  const { feeEstimate: initialFeeRate } = pickFeeEstimate(
    feeEstimates,
    settings.INITIAL_CONFIRMATION_TIME
  );
  const maxFeeRate = computeMaxAllowedFeeRate(feeEstimates);
  const [userSelectedFeeRate, setUserSelectedFeeRate] = useState<number | null>(
    initialFeeRate
  );
  const feeRate =
    userSelectedFeeRate === null
      ? null
      : userSelectedFeeRate >= 1 && userSelectedFeeRate <= maxFeeRate
        ? userSelectedFeeRate
        : null;

  const {
    min: minAmount,
    max: maxAmount,
    maxWhen1SxB: maxAmountWhen1SxB
  } = estimateSendRange({ utxosData, address, network, feeRate });

  const lastKnownValidAmountRef = useRef<number | null>(maxAmount);
  const isValidAmountRange = maxAmount !== null && maxAmount >= minAmount;

  const [userSelectedAmount, setUserSelectedAmount] = useState<number | null>(
    isValidAmountRange ? maxAmount : null
  );
  const [isMaxAmount, setIsMaxAmount] = useState<boolean>(
    userSelectedAmount !== null && userSelectedAmount === maxAmount
  );
  const amount: number | null =
    userSelectedAmount !== null &&
    maxAmount !== null &&
    userSelectedAmount >= minAmount &&
    userSelectedAmount <= maxAmount
      ? userSelectedAmount
      : null;
  if (amount !== null) lastKnownValidAmountRef.current = amount;

  const onUserSelectedAmountChange = useCallback(
    (userSelectedAmount: number | null, type: 'USER' | 'RESET') => {
      setUserSelectedAmount(userSelectedAmount);

      //Make sure the MAX_AMOUNT text is set when the user reacted to the
      //slider or input box, not when the onValueChange is triggered because
      //the componet was intenally reset
      if (type === 'USER' && userSelectedAmount !== null)
        setIsMaxAmount(userSelectedAmount === maxAmount);
    },
    [maxAmount]
  );

  const txHexRef = useRef<string>();
  const feeRef = useRef<number>();
  const handleCloseContinue = useCallback(() => setIsConfirm(false), []);
  const handleContinue = useCallback(async () => {
    if (
      feeRate === null ||
      amount === null ||
      address === null ||
      changeOutput === null
    )
      throw new Error('Cannot process Transaction');
    try {
      const txHexAndFee = await calculateTx({
        signer,
        utxosData,
        address,
        feeRate,
        amount,
        network,
        changeOutput
      });
      if (txHexAndFee) {
        const { txHex, fee } = txHexAndFee;
        txHexRef.current = txHex;
        feeRef.current = fee;
        console.log({ txHex: txHexRef.current });
        setIsConfirm(true);
      } else {
        txHexRef.current = undefined;
        feeRef.current = undefined;
        toast.show(t('send.txCalculateError'), { type: 'warning' });
      }
    } catch (err) {
      console.warn(err);
      txHexRef.current = undefined;
      feeRef.current = undefined;
      toast.show(t('send.txCalculateError'), { type: 'warning' });
    }
  }, [
    changeOutput,
    toast,
    utxosData,
    network,
    signer,
    t,
    address,
    amount,
    feeRate
  ]);
  const handleOK = useCallback(async () => {
    try {
      if (!txHexRef.current || !feeRef.current)
        throw new Error('txHex or fee not set in last phase');
      await txPushAndUpdateStates(txHexRef.current);
      toast.show(t('send.txSuccess'), { type: 'success' });
    } catch (err) {
      console.warn(err);
      toast.show(t('send.txPushError'), { type: 'warning' });
    }
    txHexRef.current = undefined;
    feeRef.current = undefined;
    goBack();
  }, [toast, goBack, txPushAndUpdateStates, t]);

  const fee = estimateSendTxFee({
    utxosData,
    address,
    feeRate,
    amount,
    network,
    changeOutput:
      changeOutput ||
      DUMMY_CHANGE_OUTPUT(getMainAccount(accounts, network), network)
  });

  //Keep track of the AmountInput height to avoid flickering
  const amountAltStyle = useRef<{ height?: number }>({});
  const onAmountInputLayout = useCallback((event: LayoutChangeEvent) => {
    const { height } = event.nativeEvent.layout;
    if (height) amountAltStyle.current = { height };
  }, []);

  const allFieldsValid =
    amount !== null &&
    feeRate !== null &&
    address !== null &&
    changeOutput !== null;

  const formatAmount = useCallback(
    (amount: number) => {
      return formatBtc({
        amount,
        subUnit: settings.SUB_UNIT,
        btcFiat,
        locale,
        currency
      });
    },
    [settings.SUB_UNIT, locale, currency, btcFiat]
  );

  const modalIcon = useMemo<IconType>(
    () => ({
      family: 'AntDesign',
      name: 'checkcircle'
    }),
    []
  );

  return (
    <KeyboardAwareScrollView
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      contentContainerClassName="items-center pt-5 px-4"
    >
      {walletChanged ? (
        <View className="w-full max-w-screen-sm mx-4" style={containerStyle}>
          <View className="mb-8">
            <Text className="text-base">{t('send.interrupt')}</Text>
          </View>
          <Button onPress={navigation.goBack}>{t('goBack')}</Button>
        </View>
      ) : maxAmountWhen1SxB === null ? (
        <View className="w-full max-w-screen-sm mx-4" style={containerStyle}>
          <Text className="mb-8">{t('send.notEnoughFunds')}</Text>
          <Button onPress={navigation.goBack}>{t('goBack')}</Button>
        </View>
      ) : (
        <View className="w-full max-w-screen-sm mx-4" style={containerStyle}>
          <AddressInput
            type="external"
            networkId={networkId}
            onValueChange={setAddress}
          />
          <View className="mb-8" />
          {maxAmount !== null && lastKnownValidAmountRef.current !== null ? (
            //AmountInput will be constantly re-rendered, so keep track
            //of the last value that was set for initing it to it, even it
            //out of range
            <View onLayout={onAmountInputLayout}>
              <AmountInput
                btcFiat={btcFiat}
                isMaxAmount={isMaxAmount}
                label={t('send.amountLabel')}
                initialValue={lastKnownValidAmountRef.current}
                min={minAmount}
                max={maxAmount}
                onValueChange={onUserSelectedAmountChange}
              />
            </View>
          ) : (
            <View style={amountAltStyle.current}>
              <Text className="text-base m-auto self-center text-red-500">
                {feeRate === null
                  ? t('send.invalidFeeRate')
                  : t('send.lowerFeeRate')}
              </Text>
            </View>
          )}
          <View className="mb-8" />
          <FeeInput
            btcFiat={btcFiat}
            feeEstimates={feeEstimates}
            initialValue={initialFeeRate}
            fee={fee}
            label={t('send.confirmationSpeedLabel')}
            onValueChange={setUserSelectedFeeRate}
          />
          <View className="self-center flex-row justify-center items-center mt-5 gap-5">
            <Button onPress={navigation.goBack}>{t('cancelButton')}</Button>
            <Button disabled={!allFieldsValid} onPress={handleContinue}>
              {t('continueButton')}
            </Button>
          </View>
          <Modal
            title={t('send.confirmModalTitle')}
            icon={modalIcon}
            isVisible={isConfirm}
            onClose={handleCloseContinue}
            customButtons={
              <View className="items-center gap-6 flex-row justify-center mb-4">
                <Button onPress={handleCloseContinue}>
                  {t('cancelButton')}
                </Button>
                <Button onPress={handleOK}>{t('confirmButton')}</Button>
              </View>
            }
          >
            <View className="px-4 py-2">
              <Text className="mb-2 text-base">{t('send.confirm')}</Text>
              <View className="bg-gray-50 p-4 rounded-lg mb-4 android:elevation ios:shadow gap-2 mt-4">
                <View className="flex-row">
                  <Text className="w-[30%] text-right text-base font-bold">
                    {t('send.confirmLabels.recipientAddress') + ':'}
                  </Text>
                  <Text className="w-[70%] pl-2 text-base">{address}</Text>
                </View>
                <View className="flex-row">
                  <Text className="w-[30%] text-right  text-base font-bold">
                    {t('send.confirmLabels.amountLabel') + ':'}
                  </Text>
                  <Text className="w-[70%] pl-2 text-base">
                    {amount !== null && formatAmount(amount)}
                  </Text>
                </View>
                <View className="flex-row">
                  <Text className="w-[30%] text-right text-base font-bold">
                    {t('send.confirmLabels.miningFee') + ':'}
                  </Text>
                  <Text className="w-[70%] pl-2 text-base">
                    {feeRef.current !== undefined &&
                      formatAmount(feeRef.current)}
                  </Text>
                </View>
              </View>
            </View>
          </Modal>
        </View>
      )}
    </KeyboardAwareScrollView>
  );
}
