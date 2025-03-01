import AddressInput from '../components/AddressInput';
import AmountInput from '../components/AmountInput';
import BlocksInput from '../components/BlocksInput';
import FeeInput from '../components/FeeInput';
import LearnMoreAboutVaults from '../components/LearnMoreAboutVaults';
import { Trans, useTranslation } from 'react-i18next';
import React, { useCallback, useState, useMemo, useEffect } from 'react';
import { useNavigation } from '@react-navigation/native';
import { Text, View } from 'react-native';
import {
  Button,
  IconType,
  KeyboardAwareScrollView,
  Modal
} from '../../common/ui';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  areVaultsSynched,
  selectVaultUtxosData,
  type VaultSettings
} from '../lib/vaults';
import {
  DUMMY_VAULT_OUTPUT,
  DUMMY_SERVICE_OUTPUT,
  DUMMY_CHANGE_OUTPUT,
  getMainAccount,
  DUMMY_COLD_ADDRESS,
  computeChangeOutput
} from '../lib/vaultDescriptors';
import useFirstDefinedValue from '../../common/hooks/useFirstDefinedValue';
import useArrayChangeDetector from '../../common/hooks/useArrayChangeDetector';

import {
  computeMaxAllowedFeeRate,
  FeeEstimates,
  pickFeeEstimate
} from '../lib/fees';
import { formatBtc } from '../lib/btcRates';
import { estimateServiceFee, estimateVaultSetUpRange } from '../lib/vaultRange';
import { networkMapping } from '../lib/network';
import { useSettings } from '../hooks/useSettings';
import { useWallet } from '../hooks/useWallet';
import { OutputInstance } from '@bitcoinerlab/descriptors';
import { useLocalization } from '../hooks/useLocalization';

export default function VaultSetUp({
  onVaultSetUpComplete
}: {
  onVaultSetUpComplete: (vaultSettings: VaultSettings) => void;
}) {
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
    vaults,
    vaultsStatuses,
    getNextChangeDescriptorWithIndex
  } = useWallet();

  //Warn the user and reset this component if wallet changes.
  const walletChanged = useArrayChangeDetector([utxosData, accounts]);

  //Cache to avoid flickering in the Sliders
  const btcFiat = useFirstDefinedValue<number>(btcFiatRealTime);
  const feeEstimates = useFirstDefinedValue<FeeEstimates>(feeEstimatesRealTime);

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

  const { settings } = useSettings();
  if (!settings)
    throw new Error(
      'This component should only be started after settings has been retrieved from storage'
    );
  const { locale, currency } = useLocalization();

  const [lockBlocks, setLockBlocks] = useState<number | null>(
    settings.INITIAL_LOCK_BLOCKS
  );
  const serviceFeeRate = settings.SERVICE_FEE_RATE;

  const lastUnusedColdAddress =
    vaults && vaultsStatuses && areVaultsSynched(vaults, vaultsStatuses)
      ? Object.entries(vaults)
          .filter(([vaultId]) => !vaultsStatuses[vaultId]?.panicTxHex)
          .sort(([, a], [, b]) => b.creationTime - a.creationTime)[0]?.[1]
          .coldAddress || null
      : null;
  const [coldAddress, setColdAddress] = useState<string | null>(
    lastUnusedColdAddress
  );
  const [changeOutput, setChangeOutput] = useState<OutputInstance | null>(null);
  const [prefilledAddressHelp, setPrefilledAddressHelp] =
    useState<boolean>(false);
  const showPrefilledAddressHelp = useCallback(
    () => setPrefilledAddressHelp(true),
    []
  );
  const hidePrefilledAddressHelp = useCallback(
    () => setPrefilledAddressHelp(false),
    []
  );
  const { t } = useTranslation();

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
  const [userSelectedFeeRate, setUserSelectedFeeRate] = useState<number | null>(
    initialFeeRate
  );
  const maxFeeRate = computeMaxAllowedFeeRate(feeEstimates);
  const feeRate =
    userSelectedFeeRate === null
      ? null
      : userSelectedFeeRate >= 1 && userSelectedFeeRate <= maxFeeRate
        ? userSelectedFeeRate
        : null;

  const {
    //maxVaultAmount = estimateMaxVaultAmount(feeRate)
    //This is basically calling maxFunds algo in coinselect (for feeRate) and
    //see the target values.
    //It decreases as the feeRate increases. The lowest value is for maxFeeRate.
    //See maxVaultAmountWhenMaxFee below.
    //
    //This will be the max selectable value in the Slider. The max will change
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
    coldAddress: coldAddress || DUMMY_COLD_ADDRESS(network),
    maxFeeRate,
    network,
    serviceFeeRate,
    feeRate, //If feeRate is null, then estimateVaultSetUpRange uses maxFeeRate
    feeRateCeiling: settings.PRESIGNED_FEE_RATE_CEILING,
    minRecoverableRatio: settings.MIN_RECOVERABLE_RATIO
  });
  if (
    maxVaultAmount &&
    maxVaultAmountWhenMaxFee &&
    maxVaultAmountWhenMaxFee.vaultedAmount > maxVaultAmount.vaultedAmount
  )
    throw new Error(
      `maxVaultAmountWhenMaxFee (${maxVaultAmountWhenMaxFee.vaultedAmount}) should never be larger than maxVaultAmount (${maxVaultAmount.vaultedAmount}), feeRate=${feeRate}, maxFeeRate: ${maxFeeRate}`
    );
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
    userSelectedVaultedAmount !== null &&
      userSelectedVaultedAmount === maxVaultAmount?.vaultedAmount
  );
  const vaultedAmount: number | null =
    userSelectedVaultedAmount !== null &&
    maxVaultAmount &&
    userSelectedVaultedAmount >= minRecoverableVaultAmount.vaultedAmount &&
    userSelectedVaultedAmount <= maxVaultAmount.vaultedAmount
      ? userSelectedVaultedAmount
      : null;
  const serviceFee: number | null =
    vaultedAmount !== null && maxVaultAmount && minRecoverableVaultAmount
      ? estimateServiceFee({
          vaultedAmount,
          serviceFeeRate,
          //We use a dummy service output because the real service address is
          //only retrieved once, when finally creating the vaul, to avoid generating
          //a huge gapLimit in Rewinds wallet
          serviceOutput: DUMMY_SERVICE_OUTPUT(network),
          minVaultAmount: minRecoverableVaultAmount,
          maxVaultAmount
        })
      : null;

  const onUserSelectedVaultedAmountChange = useCallback(
    (userSelectedVaultedAmount: number | null, type: 'USER' | 'RESET') => {
      setUserSelectedVaultedAmount(userSelectedVaultedAmount);

      //Make sure the MAX_FUNDS text is set when the user reacted to the
      //slider or input box, not when the onValueChange is triggered because
      //the componet was intenally reset
      if (type === 'USER' && userSelectedVaultedAmount !== null)
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
      serviceFee === null ||
      lockBlocks === null ||
      coldAddress === null
    )
      throw new Error('Cannot process Vault');

    onVaultSetUpComplete({
      vaultedAmount,
      serviceFee,
      coldAddress,
      feeRate,
      lockBlocks,

      accounts,
      btcFiat,
      utxosData
    });
  }, [
    feeRate,
    utxosData,
    vaultedAmount,
    serviceFee,
    lockBlocks,
    onVaultSetUpComplete,
    coldAddress,
    accounts,
    btcFiat
  ]);

  let fee = null;
  if (vaultedAmount !== null && serviceFee !== null && feeRate !== null) {
    const selected = selectVaultUtxosData({
      utxosData,
      //We never use the final vaultOutput since it is built using a random
      //key that we don't want to keep in memory
      //This means the final fee may be larger depending on signature size
      vaultOutput: DUMMY_VAULT_OUTPUT(network),
      //We use a dummy service output because the real service address is
      //only retrieved once, when finally creating the vaul, to avoid generating
      //a huge gapLimit in Rewinds wallet
      serviceOutput: DUMMY_SERVICE_OUTPUT(network),
      changeOutput:
        changeOutput ||
        DUMMY_CHANGE_OUTPUT(getMainAccount(accounts, network), network),
      feeRate,
      vaultedAmount,
      serviceFee
    });
    if (!selected)
      throw new Error(
        `vaultedAmount ${vaultedAmount} should be selectable since it's within range - [${minRecoverableVaultAmount?.vaultedAmount}, ${maxVaultAmount?.vaultedAmount}] - isValidVaultRange: ${isValidVaultRange} - feeRate: ${feeRate}.`
      );
    fee = selected.fee;
  }

  const prefilledAddressHelpIcon = useMemo<IconType>(
    () => ({ family: 'FontAwesome6', name: 'shield-halved' }),
    []
  );

  const allFieldsValid =
    vaultedAmount !== null &&
    lockBlocks !== null &&
    feeRate !== null &&
    coldAddress !== null;

  return (
    <KeyboardAwareScrollView
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      contentContainerClassName="items-center pt-5 px-4"
    >
      {walletChanged ? (
        <View className="w-full max-w-screen-sm mx-4" style={containerStyle}>
          <View className="mb-8">
            <Text className="text-base">{t('vaultSetup.interrupt')}</Text>
          </View>
          <Button onPress={navigation.goBack}>{t('goBack')}</Button>
        </View>
      ) : !isValidVaultRange ? (
        <View className="w-full max-w-screen-sm mx-4" style={containerStyle}>
          <View className="mb-8">
            <Text className="text-base">
              <Trans
                i18nKey="vaultSetup.notEnoughFunds"
                values={{
                  missingFunds: formatBtc({
                    amount: missingFunds * 1.03, //Ask for 3% more than needed
                    subUnit: settings.SUB_UNIT,
                    btcFiat,
                    locale,
                    currency
                  }),
                  minRecoverableRatioPct: parseFloat(
                    (settings.MIN_RECOVERABLE_RATIO * 100).toFixed(2)
                  ).toString(),
                  feeRateCeiling: parseFloat(
                    (settings.PRESIGNED_FEE_RATE_CEILING / 1000).toFixed(2)
                  ).toString()
                }}
                components={{
                  strong: <Text className="font-bold" />
                }}
              />
            </Text>
          </View>
          <Button onPress={navigation.goBack}>{t('goBack')}</Button>
        </View>
      ) : (
        <View className="w-full max-w-screen-sm mx-4" style={containerStyle}>
          <View className="mb-8">
            <Text className="text-base mb-1">{t('vaultSetup.intro')}</Text>
            <LearnMoreAboutVaults />
          </View>
          <AmountInput
            btcFiat={btcFiat}
            isMaxAmount={isMaxVaultedAmount}
            label={t('vaultSetup.amountLabel')}
            initialValue={maxVaultAmount.vaultedAmount}
            min={minRecoverableVaultAmount.vaultedAmount}
            max={maxVaultAmount.vaultedAmount}
            onValueChange={onUserSelectedVaultedAmountChange}
          />
          <View className="mb-8" />
          <BlocksInput
            label={t('vaultSetup.securityLockTimeLabel')}
            initialValue={settings.INITIAL_LOCK_BLOCKS}
            min={settings.MIN_LOCK_BLOCKS}
            max={settings.MAX_LOCK_BLOCKS}
            onValueChange={setLockBlocks}
          />
          <View className="mb-8" />
          <AddressInput
            type="emergency"
            networkId={networkId}
            {...(coldAddress ? { initialValue: coldAddress } : {})}
            onValueChange={setColdAddress}
          />
          {lastUnusedColdAddress && lastUnusedColdAddress === coldAddress ? (
            <View className="px-1 pt-1">
              <Text className="text-sm text-slate-500">
                {t('vaultSetup.prefilledAddress') + ' '}
                <Text 
                  onPress={showPrefilledAddressHelp}
                  className="text-sm text-primary opacity-80 active:opacity-60 active:scale-95"
                >
                  {t('helpButton')}
                </Text>
              </Text>
              <Modal
                title={t('vaultSetup.prefilledAddressHelpTitle')}
                icon={prefilledAddressHelpIcon}
                isVisible={prefilledAddressHelp}
                onClose={hidePrefilledAddressHelp}
                closeButtonText={t('understoodButton')}
              >
                <Text className="pl-2 pr-2 text-base">
                  {t('vaultSetup.prefilledAddressHelp', { coldAddress })}
                </Text>
              </Modal>
            </View>
          ) : null}
          <View className="mb-8" />
          <FeeInput
            btcFiat={btcFiat}
            feeEstimates={feeEstimates}
            initialValue={initialFeeRate}
            fee={fee}
            label={t('vaultSetup.confirmationSpeedLabel')}
            onValueChange={setUserSelectedFeeRate}
          />
          <View className="self-center flex-row justify-center items-center mt-5 gap-5">
            <Button onPress={navigation.goBack}>{t('cancelButton')}</Button>
            <Button disabled={!allFieldsValid} onPress={handleOK}>
              {t('continueButton')}
            </Button>
          </View>
          {!allFieldsValid && (
            <Text className="text-center text-orange-600 native:text-sm web:text-xs pt-2">
              {coldAddress
                ? t('vaultSetup.fillInAll')
                : t('vaultSetup.coldAddressMissing')}
            </Text>
          )}
        </View>
      )}
    </KeyboardAwareScrollView>
  );
}
