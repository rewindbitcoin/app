// Copyright (C) 2025 Jose-Luis Landabaso - https://rewindbitcoin.com
// Licensed under the GNU GPL v3 or later. See the LICENSE file for details.

import AddressInput from '../components/AddressInput';
import AmountInput from '../components/AmountInput';
import CoinControlModal from '../components/CoinControlModal';
import FeeInput from '../components/FeeInput';
import { useTranslation } from 'react-i18next';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import { batchedUpdates } from '~/common/lib/batchedUpdates';
import { useNavigation } from '@react-navigation/native';
import { View, Text } from 'react-native';
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
  MIN_FEE_RATE,
  pickFeeEstimate
} from '../lib/fees';
import {
  estimateSendRange,
  estimateSendTxFee,
  calculateTx
} from '../lib/sendTransaction';
import { getSendableUtxos } from '../lib/utxoPolicy';
import { networkMapping } from '../lib/network';
import { useSettings } from '../hooks/useSettings';
import { useWallet } from '../hooks/useWallet';
import {
  computeChangeOutput,
  DUMMY_CHANGE_OUTPUT,
  DUMMY_SEND_ADDRESS,
  getMainAccount
} from '../lib/vaultDescriptors';
import { formatBtc } from '../lib/btcRates';
import { OutputInstance } from '@bitcoinerlab/descriptors';
import useFirstDefinedValue from '~/common/hooks/useFirstDefinedValue';
import useArrayChangeDetector from '~/common/hooks/useArrayChangeDetector';
import { useLocalization } from '../hooks/useLocalization';
import type { UtxosData } from '../lib/vaults';

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
    historyData,
    vaultsStatuses,
    getNextChangeDescriptorWithIndex,
    txPushAndUpdateStates,
    signers
  } = useWallet();

  const sendableUtxosResult =
    utxosData &&
    vaultsStatuses &&
    historyData &&
    getSendableUtxos(utxosData, vaultsStatuses, historyData);

  //Warn the user and reset this component if wallet changes.
  const walletChanged = useArrayChangeDetector([
    sendableUtxosResult?.utxosData,
    networkId,
    accounts
  ]);

  //Cache to avoid flickering in the Sliders
  const btcFiat = useFirstDefinedValue<number>(btcFiatRealTime);
  const feeEstimates = useFirstDefinedValue<FeeEstimates>(feeEstimatesRealTime);

  if (!sendableUtxosResult)
    throw new Error('SendScreen cannot be called with unset utxos');
  if (!utxosData)
    throw new Error('SendScreen cannot be called with unset raw utxos');
  if (!vaultsStatuses)
    throw new Error('SendScreen cannot be called with unset vault statuses');
  if (!historyData)
    throw new Error('SendScreen cannot be called with unset history data');
  if (!accounts)
    throw new Error('SendScreen cannot be called with unset accounts');
  if (!networkId)
    throw new Error('SendScreen cannot be called with unset networkId');
  if (!feeEstimates)
    throw new Error('SendScreen cannot be called with unset feeEstimates');
  if (!signers)
    throw new Error('SendScreen cannot be called with unset signers');
  const {
    utxosData: sendableUtxosData,
    utxosAvailability: sendUtxosAvailability
  } = sendableUtxosResult;
  const rawUtxosData = utxosData;
  // Pending UTXOs are filtered out either because they come from an unconfirmed
  // acceleration tx the user may re-bump, making those outputs disappear, or
  // because relay policy blocks them, like unconfirmed v3 funds in a v2 send.
  const hasPendingUtxos = sendableUtxosData.length !== rawUtxosData.length;
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
  const [isCoinControlVisible, setIsCoinControlVisible] =
    useState<boolean>(false);
  // If set, these are the sendable UTXOs manually picked by the user.
  const [pickedSendableUtxosData, setPickedSendableUtxosData] =
    useState<UtxosData | null>(null);
  const coinControl = pickedSendableUtxosData !== null;
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
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
      : userSelectedFeeRate >= MIN_FEE_RATE && userSelectedFeeRate <= maxFeeRate
        ? userSelectedFeeRate
        : null;

  const {
    min: minAmount,
    max: maxAmount,
    maxWhen1SxB: maxAmountWhen1SxB
  } = estimateSendRange({
    utxosData: pickedSendableUtxosData ?? sendableUtxosData,
    coinControl,
    address,
    network,
    feeRate
  });
  const sendRangeAssumingAutoCoinSelection = coinControl
    ? estimateSendRange({
        utxosData: sendableUtxosData,
        coinControl: false,
        address,
        network,
        feeRate
      })
    : { min: minAmount, max: maxAmount, maxWhen1SxB: maxAmountWhen1SxB };
  const { maxWhen1SxB: maxAmountWhen1SxBRaw } = estimateSendRange({
    utxosData: rawUtxosData,
    coinControl: false,
    address,
    network,
    feeRate
  });
  const canBuildAtSelectedFeeAssumingAutoCoinSelection =
    feeRate !== null &&
    sendRangeAssumingAutoCoinSelection.max !== null &&
    sendRangeAssumingAutoCoinSelection.max >=
      sendRangeAssumingAutoCoinSelection.min;
  const canBuildAtMinimumFeeAssumingAutoCoinSelection =
    maxFeeRate >= MIN_FEE_RATE &&
    sendRangeAssumingAutoCoinSelection.maxWhen1SxB !== null;
  // This is a pre-form hard stop: if automatic coinselection cannot build using
  // all eligible sendable UTXOs, the AmountInput/coin control picker is not
  // shown. The coin control picker is not even presented because it cannot get
  // more funds than automatic coinselection anyway.
  // Use this only as a flag to explain why a hard stop occurred when there are
  // pending UTXOs.
  const isBlockedByPendingUtxos =
    !canBuildAtMinimumFeeAssumingAutoCoinSelection &&
    hasPendingUtxos &&
    maxAmountWhen1SxBRaw !== null;
  const unavailableFundsMessage = isBlockedByPendingUtxos
    ? t('send.blockedByPendingUtxos')
    : t('send.notEnoughFunds');

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

  const txHexRef = useRef<string>(undefined);
  const feeRef = useRef<number>(undefined);
  const handleCoinControlChange = useCallback((coinControl: boolean) => {
    if (coinControl) setIsCoinControlVisible(true);
    else setPickedSendableUtxosData(null);
  }, []);
  const handleOpenCoinControl = useCallback(
    () => setIsCoinControlVisible(true),
    []
  );
  const handleCloseCoinControl = useCallback(
    () => setIsCoinControlVisible(false),
    []
  );
  const handleConfirmCoinControl = useCallback((utxosData: UtxosData) => {
    setPickedSendableUtxosData(utxosData);
    setIsCoinControlVisible(false);
  }, []);
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
        utxosData: pickedSendableUtxosData ?? sendableUtxosData,
        coinControl,
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
    pickedSendableUtxosData,
    sendableUtxosData,
    coinControl,
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

      // Set loading state to true
      setIsSubmitting(true);

      await txPushAndUpdateStates(txHexRef.current);
      toast.show(t('send.txSuccess'), { type: 'success' });
    } catch (err) {
      console.warn(err);
      toast.show(t('send.txPushError'), { type: 'warning' });
    } finally {
      // Reset loading state
      setIsSubmitting(false);
      txHexRef.current = undefined;
      feeRef.current = undefined;
      goBack();
    }
  }, [toast, goBack, txPushAndUpdateStates, t]);

  /**
   * Handles fee rate changes with special consideration for max amount
   * selection.
   *
   * This function solves a critical UI flicker issue by synchronizing fee rate
   * and amount updates:
   *
   * THE PROBLEM:
   * 1. When user selects max amount and then changes fee rate, the available
   * max amount changes
   * 2. If we update only the fee rate first, the UI will briefly show an
   * invalid state
   * 3. This causes a visible flicker as the amount updates in a separate render
   * cycle
   *
   * THE SOLUTION:
   * 1. When fee changes and max amount is selected, we calculate the new max
   * amount immediately
   * 2. We batch both state updates (fee and amount) to happen in the same
   * render cycle
   * 3. This ensures the UI always shows a consistent state without flicker
   *
   * This also handles the case where the previous fee rate had no valid amount
   * range, but the new lower fee rate makes max amount available again.
   */
  const handleFeeRateChange = useCallback(
    (newFeeRate: number | null) => {
      batchedUpdates(() => {
        // Always update the fee rate
        setUserSelectedFeeRate(newFeeRate);

        // Only recalculate max amount if user has selected max and fee is valid
        if ((isMaxAmount || !isValidAmountRange) && newFeeRate !== null) {
          // Calculate the new max amount with the updated fee rate
          const { min: newMinAmount, max: newMaxAmount } = estimateSendRange({
            utxosData: pickedSendableUtxosData ?? sendableUtxosData,
            coinControl,
            address,
            network,
            feeRate: newFeeRate
          });

          // Update the amount in the same render cycle to prevent flicker
          if (newMaxAmount !== null && newMaxAmount >= newMinAmount) {
            setUserSelectedAmount(newMaxAmount);
            //set max amount to true to cover the !isValidAmountRange case
            //That is, we were in a non valid range situation, but the new
            //newFeeRate now allows again a valid range. Then setIsMaxAmount(true)
            setIsMaxAmount(true);
          }
        }
      });
    },
    [
      isMaxAmount,
      isValidAmountRange,
      pickedSendableUtxosData,
      sendableUtxosData,
      coinControl,
      address,
      network
    ]
  );

  const fee = estimateSendTxFee({
    utxosData: pickedSendableUtxosData ?? sendableUtxosData,
    coinControl,
    address: address || DUMMY_SEND_ADDRESS(network),
    feeRate,
    amount,
    network,
    changeOutput:
      changeOutput ||
      DUMMY_CHANGE_OUTPUT(getMainAccount(accounts, network), network)
  });

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
      ) : !canBuildAtMinimumFeeAssumingAutoCoinSelection ? (
        <View className="w-full max-w-screen-sm mx-4" style={containerStyle}>
          <Text className="mb-8">{unavailableFundsMessage}</Text>
          <Button onPress={navigation.goBack}>{t('goBack')}</Button>
        </View>
      ) : (
        <View className="w-full max-w-screen-sm mx-4" style={containerStyle}>
          {hasPendingUtxos ? (
            <View className="mb-6 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3">
              <Text className="text-base font-bold text-amber-900 mb-1">
                {t('send.somePendingUtxosTitle')}
              </Text>
              <Text className="text-base text-amber-900">
                {t('send.somePendingUtxosBody')}
              </Text>
            </View>
          ) : null}
          <AddressInput
            type="external"
            networkId={networkId}
            onValueChange={setAddress}
          />
          <View className="mb-8" />
          {isValidAmountRange ? (
            //AmountInput will be constantly re-rendered, so keep track
            //of the last value that was set for initing it to it. If no
            //valid amount was ever set, initialize it to maxAmount.
            <AmountInput
              btcFiat={btcFiat}
              isMaxAmount={isMaxAmount}
              label={t('send.amountLabel')}
              allowCoinControl
              coinControl={coinControl}
              onCoinControlChange={handleCoinControlChange}
              initialValue={lastKnownValidAmountRef.current ?? maxAmount}
              min={minAmount}
              max={maxAmount}
              onValueChange={onUserSelectedAmountChange}
            />
          ) : (
            <View>
              <Text className="text-base m-auto self-center text-red-500">
                {feeRate === null
                  ? t('send.invalidFeeRate')
                  : coinControl
                    ? t('send.pickedUtxosInsufficient')
                    : t('send.lowerFeeRate')}
              </Text>
              {coinControl && canBuildAtSelectedFeeAssumingAutoCoinSelection ? (
                <View className="mt-4 flex-row flex-wrap justify-center gap-3">
                  <Button mode="secondary" onPress={handleOpenCoinControl}>
                    {t('coinControl.title')}
                  </Button>
                  <Button
                    mode="secondary"
                    onPress={() => handleCoinControlChange(false)}
                  >
                    {t('coinControl.auto')}
                  </Button>
                </View>
              ) : null}
            </View>
          )}
          <View className="mb-8" />
          <FeeInput
            btcFiat={btcFiat}
            feeEstimates={feeEstimates}
            initialValue={initialFeeRate}
            fee={fee}
            isOptimal={fee !== null && feeRate === initialFeeRate}
            label={t('send.confirmationSpeedLabel')}
            onValueChange={handleFeeRateChange}
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
              <View className="items-center gap-6 gap-y-4 flex-row flex-wrap justify-center mb-4">
                <Button
                  mode="secondary"
                  onPress={handleCloseContinue}
                  disabled={isSubmitting}
                >
                  {t('cancelButton')}
                </Button>
                <Button
                  onPress={handleOK}
                  disabled={isSubmitting}
                  loading={isSubmitting}
                >
                  {t('confirmButton')}
                </Button>
              </View>
            }
          >
            <View className="px-4 py-2">
              <Text className="mb-2 text-base">{t('send.confirm')}</Text>
              <View className="bg-gray-50 p-4 rounded-lg mb-4 android:elevation ios:shadow web:shadow gap-5 mt-4">
                {/* Recipient Address */}
                <View>
                  <Text className="text-base font-bold mb-1">
                    {t('send.confirmLabels.recipientAddress')}
                  </Text>
                  <Text className="text-base break-words">{address}</Text>
                </View>

                {/* Amount */}
                <View>
                  <Text className="text-base font-bold mb-1">
                    {t('send.confirmLabels.amountLabel')}
                  </Text>
                  <Text className="text-base">
                    {amount !== null && formatAmount(amount)}
                  </Text>
                </View>

                {/* Mining Fee */}
                <View>
                  <Text className="text-base font-bold mb-1">
                    {t('send.confirmLabels.miningFee')}
                  </Text>
                  <Text className="text-base">
                    {feeRef.current !== undefined &&
                      formatAmount(feeRef.current)}
                  </Text>
                </View>
              </View>
            </View>
          </Modal>
          <CoinControlModal
            isVisible={isCoinControlVisible}
            utxosAvailability={sendUtxosAvailability}
            pickedUtxosData={pickedSendableUtxosData}
            btcFiat={btcFiat}
            onClose={handleCloseCoinControl}
            onConfirm={handleConfirmCoinControl}
          />
        </View>
      )}
    </KeyboardAwareScrollView>
  );
}
