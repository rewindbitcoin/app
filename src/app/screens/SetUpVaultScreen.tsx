// Copyright (C) 2026 Jose-Luis Landabaso - https://rewindbitcoin.com
// Licensed under the GNU GPL v3 or later. See the LICENSE file for details.

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
  coinSelectVaultTx,
  getTargetValue,
  getRequiredTriggerReserveValue,
  getSpendableUtxosData,
  type VaultSettings
} from '../lib/vaults';
import {
  DUMMY_BACKUP_OUTPUT,
  DUMMY_TRIGGER_RESERVE_OUTPUT,
  DUMMY_VAULT_OUTPUT,
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
  MIN_FEE_RATE,
  pickFeeEstimate
} from '../lib/fees';
import { formatBtc } from '../lib/btcRates';
import {
  estimateMaxVaultAmount,
  estimateVaultSetupRange
} from '../lib/vaultRange';
import { networkMapping } from '../lib/network';
import { useSettings } from '../hooks/useSettings';
import { useWallet } from '../hooks/useWallet';
import { OutputInstance } from '@bitcoinerlab/descriptors';
import { useLocalization } from '../hooks/useLocalization';
import { batchedUpdates } from '~/common/lib/batchedUpdates';
import { toBigInt, toNumber } from '../lib/sats';

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
    historyData,
    vaults,
    vaultsStatuses,
    getNextChangeDescriptorWithIndex
  } = useWallet();

  const spendableUtxosData =
    utxosData && getSpendableUtxosData(utxosData, vaultsStatuses, historyData);

  //Warn the user and reset this component if wallet changes.
  const walletChanged = useArrayChangeDetector([spendableUtxosData, accounts]);

  //Cache to avoid flickering in the Sliders
  const btcFiat = useFirstDefinedValue<number>(btcFiatRealTime);
  const feeEstimates = useFirstDefinedValue<FeeEstimates>(feeEstimatesRealTime);

  if (!spendableUtxosData)
    throw new Error('SetUpVaultScreen cannot be called with unset utxos');
  if (!utxosData)
    throw new Error('SetUpVaultScreen cannot be called with unset raw utxos');
  if (!accounts)
    throw new Error('SetUpVaultScreen cannot be called with unset accounts');
  if (!networkId)
    throw new Error('SetUpVaultScreen cannot be called with unset networkId');
  if (!feeEstimates)
    throw new Error(
      'SetUpVaultScreen cannot be called with unset feeEstimates'
    );
  const rawUtxosData = utxosData;
  const spendableUtxos = spendableUtxosData;
  const hasReservedFunds = spendableUtxos !== rawUtxosData;
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

  const vaultMode =
    networkId === 'BITCOIN' ? 'TRUC' : settings.TESTING_VAULT_MODE;
  const maxFeeRate = computeMaxAllowedFeeRate(feeEstimates);
  const minimumEffectiveFeeRate = MIN_FEE_RATE;
  const { feeEstimate: pickedInitialFeeRate } = pickFeeEstimate(
    feeEstimates,
    settings.INITIAL_CONFIRMATION_TIME
  );
  const initialEffectiveFeeRate = Math.min(
    maxFeeRate,
    Math.max(pickedInitialFeeRate, minimumEffectiveFeeRate)
  );
  const [userSelectedEffectiveFeeRate, setUserSelectedEffectiveFeeRate] =
    useState<number | null>(initialEffectiveFeeRate);
  const effectiveFeeRate =
    userSelectedEffectiveFeeRate === null
      ? null
      : userSelectedEffectiveFeeRate >= minimumEffectiveFeeRate &&
          userSelectedEffectiveFeeRate <= maxFeeRate
        ? userSelectedEffectiveFeeRate
        : null;

  const { maxVaultAmount, maxVaultAmountAtMinFee, minimumVaultAmount } =
    estimateVaultSetupRange({
      accounts,
      utxosData: spendableUtxos,
      coldAddress: coldAddress || DUMMY_COLD_ADDRESS(network),
      minimumEffectiveFeeRate,
      effectiveFeeRate,
      lockBlocks: lockBlocks || settings.INITIAL_LOCK_BLOCKS,
      network,
      vaultMode,
      presignedTriggerFeeRate: settings.PRESIGNED_TRIGGER_FEERATE,
      maxTriggerFeeRate: settings.MAX_TRIGGER_FEERATE
    });
  const rawVaultRange = estimateVaultSetupRange({
    accounts,
    utxosData: rawUtxosData,
    coldAddress: coldAddress || DUMMY_COLD_ADDRESS(network),
    minimumEffectiveFeeRate,
    effectiveFeeRate,
    lockBlocks: lockBlocks || settings.INITIAL_LOCK_BLOCKS,
    network,
    vaultMode,
    presignedTriggerFeeRate: settings.PRESIGNED_TRIGGER_FEERATE,
    maxTriggerFeeRate: settings.MAX_TRIGGER_FEERATE
  });
  const hasAnyVaultRange =
    maxFeeRate >= minimumEffectiveFeeRate &&
    maxVaultAmountAtMinFee !== undefined &&
    maxVaultAmountAtMinFee.vaultedAmount >= minimumVaultAmount.vaultedAmount;
  const blockedByReservedFunds =
    !hasAnyVaultRange &&
    maxFeeRate >= minimumEffectiveFeeRate &&
    rawVaultRange.maxVaultAmountAtMinFee !== undefined &&
    rawVaultRange.maxVaultAmountAtMinFee.vaultedAmount >=
      rawVaultRange.minimumVaultAmount.vaultedAmount;
  const missingFunds: number = Math.max(
    0,
    minimumVaultAmount.vaultedAmount +
      minimumVaultAmount.effectiveFee -
      (maxVaultAmountAtMinFee
        ? maxVaultAmountAtMinFee.vaultedAmount +
          maxVaultAmountAtMinFee.effectiveFee
        : 0)
  );
  const currentMaxVaultedAmount =
    maxVaultAmount &&
    maxVaultAmount.vaultedAmount >= minimumVaultAmount.vaultedAmount
      ? maxVaultAmount.vaultedAmount
      : minimumVaultAmount.vaultedAmount;

  const [userSelectedVaultedAmount, setUserSelectedVaultedAmount] = useState<
    number | null
  >(hasAnyVaultRange ? currentMaxVaultedAmount : null);

  const [isMaxVaultedAmount, setIsMaxVaultedAmount] = useState<boolean>(
    userSelectedVaultedAmount !== null &&
      userSelectedVaultedAmount === currentMaxVaultedAmount
  );
  const vaultedAmount: number | null =
    userSelectedVaultedAmount !== null &&
    maxVaultAmount &&
    maxVaultAmount.vaultedAmount >= minimumVaultAmount.vaultedAmount &&
    userSelectedVaultedAmount >= minimumVaultAmount.vaultedAmount &&
    userSelectedVaultedAmount <= maxVaultAmount.vaultedAmount
      ? userSelectedVaultedAmount
      : null;

  const onUserSelectedVaultedAmountChange = useCallback(
    (userSelectedVaultedAmount: number | null, type: 'USER' | 'RESET') => {
      setUserSelectedVaultedAmount(userSelectedVaultedAmount);

      //Make sure the MAX_FUNDS text is set when the user reacted to the
      //slider or input box, not when the onValueChange is triggered because
      //the componet was intenally reset
      if (type === 'USER' && userSelectedVaultedAmount !== null)
        setIsMaxVaultedAmount(
          userSelectedVaultedAmount === currentMaxVaultedAmount
        );
    },
    [currentMaxVaultedAmount]
  );

  const handleOK = useCallback(() => {
    if (
      effectiveFeeRate === null ||
      vaultedAmount === null ||
      lockBlocks === null ||
      coldAddress === null
    )
      throw new Error('Cannot process Vault');

    onVaultSetUpComplete({
      vaultedAmount,
      coldAddress,
      effectiveFeeRate,
      lockBlocks,

      accounts,
      btcFiat,
      utxosData: spendableUtxos
    });
  }, [
    effectiveFeeRate,
    spendableUtxos,
    vaultedAmount,
    lockBlocks,
    onVaultSetUpComplete,
    coldAddress,
    accounts,
    btcFiat
  ]);

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
   * cycle (AmountInput will call onUserSelectedVaultedAmountChange with the
   * correct value but a "tick" later)
   *
   * THE SOLUTION:
   * 1. When fee changes and max amount is selected, we calculate the new max
   * amount immediately
   * 2. We batch both state updates (fee and amount) to happen in the same
   * render cycle
   * 3. This ensures the UI always shows a consistent state without flicker
   *
   * OPTIMIZATION:
   * - We only perform the expensive calculation when necessary (max amount selected)
   * - We use the same calculation method as the main range estimation
   * - We batch updates to avoid multiple renders
   */
  const handleEffectiveFeeRateChange = useCallback(
    (newEffectiveFeeRate: number | null) => {
      batchedUpdates(() => {
        // Always update the fee rate
        setUserSelectedEffectiveFeeRate(newEffectiveFeeRate);

        // Only recalculate max amount if user has selected max and fee is valid
        if (isMaxVaultedAmount && newEffectiveFeeRate !== null) {
          const currentChangeOutput =
            changeOutput ||
            DUMMY_CHANGE_OUTPUT(getMainAccount(accounts, network), network);
          const newMaxEstimate = estimateMaxVaultAmount({
            utxosData: spendableUtxos,
            vaultOutput: DUMMY_VAULT_OUTPUT(network),
            backupOutput: DUMMY_BACKUP_OUTPUT(network),
            triggerReserveOutput: DUMMY_TRIGGER_RESERVE_OUTPUT(network),
            triggerReserveValue: getRequiredTriggerReserveValue({
              triggerReserveOutput: DUMMY_TRIGGER_RESERVE_OUTPUT(network),
              triggerReserveChangeOutput:
                DUMMY_TRIGGER_RESERVE_OUTPUT(network),
              vaultMode,
              presignedTriggerFeeRate: settings.PRESIGNED_TRIGGER_FEERATE,
              maxTriggerFeeRate: settings.MAX_TRIGGER_FEERATE
            }),
            changeOutput: currentChangeOutput,
            vaultMode,
            effectiveFeeRate: newEffectiveFeeRate
          });

          // Update the amount in the same render cycle to prevent flicker
          setUserSelectedVaultedAmount(
            newMaxEstimate?.vaultedAmount || minimumVaultAmount.vaultedAmount
          );
        }
      });
    },
    [
      accounts,
      changeOutput,
      isMaxVaultedAmount,
      minimumVaultAmount.vaultedAmount,
      spendableUtxos,
      network,
      settings.PRESIGNED_TRIGGER_FEERATE,
      settings.MAX_TRIGGER_FEERATE,
      vaultMode,
      setUserSelectedEffectiveFeeRate
    ]
  );

  let effectiveFee = null;
  if (vaultedAmount !== null && effectiveFeeRate !== null) {
    const selected = coinSelectVaultTx({
      utxosData: spendableUtxos,
      //We never use the final vaultOutput since it is built using a random
      //key that we don't want to keep in memory, but setup still needs to
      //reserve the same backup and trigger-reserve outputs that real vault
      //creation will fund.
      vaultOutput: DUMMY_VAULT_OUTPUT(network),
      backupOutput: DUMMY_BACKUP_OUTPUT(network),
      triggerReserveOutput: DUMMY_TRIGGER_RESERVE_OUTPUT(network),
      triggerReserveValue: getRequiredTriggerReserveValue({
        triggerReserveOutput: DUMMY_TRIGGER_RESERVE_OUTPUT(network),
        triggerReserveChangeOutput: DUMMY_TRIGGER_RESERVE_OUTPUT(network),
        vaultMode,
        presignedTriggerFeeRate: settings.PRESIGNED_TRIGGER_FEERATE,
        maxTriggerFeeRate: settings.MAX_TRIGGER_FEERATE
      }),
      changeOutput:
        changeOutput ||
        DUMMY_CHANGE_OUTPUT(getMainAccount(accounts, network), network),
      effectiveFeeRate,
      vaultMode,
      vaultedAmount: toBigInt(vaultedAmount)
    });
    if (typeof selected !== 'string') {
      const finalBackupFeeBudget = getTargetValue(
        selected.targets,
        DUMMY_BACKUP_OUTPUT(network)
      );
      const finalTriggerReserveValue = getTargetValue(
        selected.targets,
        DUMMY_TRIGGER_RESERVE_OUTPUT(network)
      );
      effectiveFee = toNumber(
        selected.fee + finalBackupFeeBudget + finalTriggerReserveValue
      );
    }
  }

  const prefilledAddressHelpIcon = useMemo<IconType>(
    () => ({ family: 'FontAwesome6', name: 'shield-halved' }),
    []
  );

  const allFieldsValid =
    vaultedAmount !== null &&
    lockBlocks !== null &&
    effectiveFeeRate !== null &&
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
      ) : !hasAnyVaultRange ? (
        <View className="w-full max-w-screen-sm mx-4" style={containerStyle}>
          <View className="mb-8">
            <Text className="text-base">
              <Trans
                i18nKey={
                  blockedByReservedFunds
                    ? 'vaultSetup.reservedFundsNotice'
                    : 'vaultSetup.notEnoughFunds'
                }
                values={{
                  missingFunds: formatBtc({
                    amount: missingFunds * 1.03, //Ask for 3% more than needed
                    subUnit: settings.SUB_UNIT,
                    btcFiat,
                    locale,
                    currency
                  })
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
          {hasReservedFunds ? (
            <View className="mb-6 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3">
              <Text className="text-base text-amber-900">
                <Trans
                  i18nKey="vaultSetup.reservedFundsBanner"
                  components={{
                    strong: <Text className="font-bold text-amber-900" />
                  }}
                />
              </Text>
            </View>
          ) : null}
          <AmountInput
            btcFiat={btcFiat}
            isMaxAmount={isMaxVaultedAmount}
            label={t('vaultSetup.amountLabel')}
            initialValue={currentMaxVaultedAmount}
            min={minimumVaultAmount.vaultedAmount}
            max={currentMaxVaultedAmount}
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
                  //Cannot use Button mode='text' here and use <Text onPress> instead since I want texts to be in the same line flow and the Pressable wrapper in Button breaks vertical alignment because of some sort of React Native bug
                  onPress={showPrefilledAddressHelp}
                  className="text-sm text-primary hover:opacity-90 active:opacity-90 active:scale-95 select-none"
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
            initialValue={initialEffectiveFeeRate}
            fee={effectiveFee}
            label={t('vaultSetup.confirmationSpeedLabel')}
            min={minimumEffectiveFeeRate}
            onValueChange={handleEffectiveFeeRateChange}
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
