// Copyright (C) 2026 Jose-Luis Landabaso - https://rewindbitcoin.com
// Licensed under the GNU GPL v3 or later. See the LICENSE file for details.

import AddressInput from '../components/AddressInput';
import AmountInput from '../components/AmountInput';
import BlocksInput from '../components/BlocksInput';
import {
  CoinControlModal,
  CoinControlRecoveryPanel
} from '../components/CoinControl';
import FeeInput from '../components/FeeInput';
import LearnMoreAboutVaults from '../components/LearnMoreAboutVaults';
import ModalInfoButton from '../components/ModalInfoButton';
import { Trans, useTranslation } from 'react-i18next';
import React, { useCallback, useState, useMemo } from 'react';
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
  utxosDataBalance,
  type UtxosData,
  type VaultSettings
} from '../lib/vaults';
import { getAdditionalP2AOutputValue } from '../lib/p2aReserve';
import {
  getVaultableUtxos,
  withFrozenVaultUtxosForCoinControl
} from '../lib/utxoPolicy';
import {
  DUMMY_BACKUP_OUTPUT,
  DUMMY_TRIGGER_RESERVE_OUTPUT,
  DUMMY_VAULT_OUTPUT,
  DUMMY_CHANGE_OUTPUT,
  getMainAccount,
  DUMMY_COLD_ADDRESS
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
import { getPresignedTriggerFeeRate } from '../lib/settings';
import {
  estimateMaxVaultAmount,
  estimateVaultSetupRange
} from '../lib/vaultRange';
import { networkMapping } from '../lib/network';
import { useSettings } from '../hooks/useSettings';
import { useWallet } from '../hooks/useWallet';
import { useLocalization } from '../hooks/useLocalization';
import { batchedUpdates } from '~/common/lib/batchedUpdates';
import { toBigInt, toNumber } from '../lib/sats';
import { getTriggerAnchorValue } from '../lib/p2aPolicy';
import { TRIGGER_TX_VBYTES } from '../lib/vaultSizes';
import {
  accountsFingerprint,
  utxoFingerprint
} from '../lib/walletFingerprints';

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
    tipStatus
  } = useWallet();

  //Cache to avoid flickering in the Sliders
  const btcFiat = useFirstDefinedValue<number>(btcFiatRealTime);
  const feeEstimates = useFirstDefinedValue<FeeEstimates>(feeEstimatesRealTime);

  if (!utxosData)
    throw new Error('SetUpVaultScreen cannot be called with unset raw utxos');
  if (!vaultsStatuses)
    throw new Error(
      'SetUpVaultScreen cannot be called with unset vault statuses'
    );
  if (!historyData)
    throw new Error(
      'SetUpVaultScreen cannot be called with unset history data'
    );
  if (!accounts)
    throw new Error('SetUpVaultScreen cannot be called with unset accounts');
  if (!networkId)
    throw new Error('SetUpVaultScreen cannot be called with unset networkId');
  if (!feeEstimates)
    throw new Error(
      'SetUpVaultScreen cannot be called with unset feeEstimates'
    );
  const rawUtxosData = utxosData;
  const network = networkMapping[networkId];

  const { settings } = useSettings();
  if (!settings)
    throw new Error(
      'This component should only be started after settings has been retrieved from storage'
    );
  const { locale, currency } = useLocalization();

  const vaultMode =
    networkId === 'BITCOIN' ? 'P2A_TRUC' : settings.TESTING_VAULT_MODE;
  const {
    utxosData: vaultableUtxosData,
    utxosAvailability: vaultUtxosAvailability
  } = getVaultableUtxos(rawUtxosData, vaultsStatuses, historyData, vaultMode);
  const vaultCoinControlUtxosAvailability =
    vaults && tipStatus?.blockHeight !== undefined
      ? withFrozenVaultUtxosForCoinControl(
          vaultUtxosAvailability,
          vaults,
          vaultsStatuses,
          tipStatus.blockHeight,
          networkId
        )
      : vaultUtxosAvailability;
  // Pending UTXOs are filtered out either because they come from an unconfirmed
  // acceleration tx the user may re-bump, making those outputs disappear, or
  // because relay policy blocks them, like unconfirmed v3 funds in a v2 vault.
  const hasPendingUtxos = vaultableUtxosData.length !== rawUtxosData.length;

  //Warn the user and reset this component if wallet changes.
  const walletChanged = useArrayChangeDetector([
    // Even if utxosData ref is stable, vaultableUtxosData is not.
    utxoFingerprint(vaultableUtxosData),
    // Ignore account names, but catch account availability changes.
    accountsFingerprint(accounts),
    networkId
  ]);

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
  const [isCoinControlVisible, setIsCoinControlVisible] =
    useState<boolean>(false);
  // If set, these are the vaultable UTXOs manually picked by the user.
  const [pickedVaultableUtxosData, setPickedVaultableUtxosData] =
    useState<UtxosData | null>(null);
  const coinControl = pickedVaultableUtxosData !== null;
  const coinControlSwitchOn = coinControl || isCoinControlVisible;
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
  const handleCoinControlChange = useCallback((coinControl: boolean) => {
    if (coinControl) setIsCoinControlVisible(true);
    else setPickedVaultableUtxosData(null);
  }, []);
  const handleUseAutoCoinSelect = useCallback(() => {
    handleCoinControlChange(false);
  }, [handleCoinControlChange]);
  const handleCloseCoinControl = useCallback(
    () => setIsCoinControlVisible(false),
    []
  );
  const handleConfirmCoinControl = useCallback((utxosData: UtxosData) => {
    setPickedVaultableUtxosData(utxosData);
    setIsCoinControlVisible(false);
  }, []);
  const { t } = useTranslation();
  const dummyChangeOutput = DUMMY_CHANGE_OUTPUT(
    getMainAccount(accounts, network),
    network
  );

  const presignedTriggerFeeRate = getPresignedTriggerFeeRate(
    settings,
    vaultMode
  );
  const maxFeeRate = computeMaxAllowedFeeRate(feeEstimates);
  // Lowest target package fee rate. The UI later derives the real minimum
  // obtainable package fee rate from this low-end build and clamps the slider to it.
  const minimumTargetPackageFeeRate = MIN_FEE_RATE;
  const { feeEstimate: pickedInitialPackageFeeRate } = pickFeeEstimate(
    feeEstimates,
    settings.INITIAL_CONFIRMATION_TIME
  );
  const initialPackageFeeRate = Math.min(
    maxFeeRate,
    Math.max(pickedInitialPackageFeeRate, minimumTargetPackageFeeRate)
  );
  const [userSelectedPackageFeeRate, setUserSelectedPackageFeeRate] = useState<
    number | null
  >(initialPackageFeeRate);
  const selectedTargetPackageFeeRate =
    userSelectedPackageFeeRate === null
      ? null
      : userSelectedPackageFeeRate >= minimumTargetPackageFeeRate &&
          userSelectedPackageFeeRate <= maxFeeRate
        ? userSelectedPackageFeeRate
        : null;

  const {
    maxVaultAtSelectedPackageFeeRate,
    maxVaultAtMinimumPackageFeeRate,
    minimumVaultSetup
  } = estimateVaultSetupRange({
    accounts,
    utxosData: pickedVaultableUtxosData ?? vaultableUtxosData,
    coinControl,
    coldAddress: coldAddress || DUMMY_COLD_ADDRESS(network),
    minimumPackageFeeRate: minimumTargetPackageFeeRate,
    packageFeeRate: selectedTargetPackageFeeRate,
    lockBlocks: lockBlocks || settings.INITIAL_LOCK_BLOCKS,
    network,
    vaultMode,
    presignedTriggerFeeRate,
    presignedRescueFeeRate: settings.PRESIGNED_RESCUE_FEERATE,
    maxTriggerFeeRate: settings.MAX_TRIGGER_FEERATE
  });
  const vaultSetupRangeAssumingAutoCoinSelection = coinControl
    ? estimateVaultSetupRange({
        accounts,
        utxosData: vaultableUtxosData,
        coinControl: false,
        coldAddress: coldAddress || DUMMY_COLD_ADDRESS(network),
        minimumPackageFeeRate: minimumTargetPackageFeeRate,
        packageFeeRate: selectedTargetPackageFeeRate,
        lockBlocks: lockBlocks || settings.INITIAL_LOCK_BLOCKS,
        network,
        vaultMode,
        presignedTriggerFeeRate,
        presignedRescueFeeRate: settings.PRESIGNED_RESCUE_FEERATE,
        maxTriggerFeeRate: settings.MAX_TRIGGER_FEERATE
      })
    : {
        maxVaultAtSelectedPackageFeeRate,
        maxVaultAtMinimumPackageFeeRate,
        minimumVaultSetup
      };
  const rawVaultRange = estimateVaultSetupRange({
    accounts,
    utxosData: rawUtxosData,
    coinControl: false,
    coldAddress: coldAddress || DUMMY_COLD_ADDRESS(network),
    minimumPackageFeeRate: minimumTargetPackageFeeRate,
    packageFeeRate: selectedTargetPackageFeeRate,
    lockBlocks: lockBlocks || settings.INITIAL_LOCK_BLOCKS,
    network,
    vaultMode,
    presignedTriggerFeeRate,
    presignedRescueFeeRate: settings.PRESIGNED_RESCUE_FEERATE,
    maxTriggerFeeRate: settings.MAX_TRIGGER_FEERATE
  });
  const isVaultPossible =
    maxFeeRate >= minimumTargetPackageFeeRate &&
    maxVaultAtMinimumPackageFeeRate !== undefined &&
    maxVaultAtMinimumPackageFeeRate.vaultedAmount >=
      minimumVaultSetup.vaultedAmount;
  const maxVaultedAmount =
    maxVaultAtSelectedPackageFeeRate?.vaultedAmount ?? null;
  const isValidVaultAmountRange =
    selectedTargetPackageFeeRate !== null &&
    maxVaultedAmount !== null &&
    maxVaultedAmount >= minimumVaultSetup.vaultedAmount;
  const canBuildAtMinimumFeeAssumingAutoCoinSelection =
    maxFeeRate >= minimumTargetPackageFeeRate &&
    vaultSetupRangeAssumingAutoCoinSelection.maxVaultAtMinimumPackageFeeRate !==
      undefined &&
    vaultSetupRangeAssumingAutoCoinSelection.maxVaultAtMinimumPackageFeeRate
      .vaultedAmount >=
      vaultSetupRangeAssumingAutoCoinSelection.minimumVaultSetup.vaultedAmount;
  const canBuildAtSelectedFeeAssumingAutoCoinSelection =
    selectedTargetPackageFeeRate !== null &&
    vaultSetupRangeAssumingAutoCoinSelection.maxVaultAtSelectedPackageFeeRate !==
      undefined &&
    vaultSetupRangeAssumingAutoCoinSelection.maxVaultAtSelectedPackageFeeRate
      .vaultedAmount >=
      vaultSetupRangeAssumingAutoCoinSelection.minimumVaultSetup.vaultedAmount;
  const isRawVaultPossible =
    maxFeeRate >= minimumTargetPackageFeeRate &&
    rawVaultRange.maxVaultAtMinimumPackageFeeRate !== undefined &&
    rawVaultRange.maxVaultAtMinimumPackageFeeRate.vaultedAmount >=
      rawVaultRange.minimumVaultSetup.vaultedAmount;
  // This is a pre-form hard stop: if automatic coinselection cannot build using
  // all eligible vaultable UTXOs, the AmountInput/coin control picker is not
  // shown. The coin control picker is not even presented because it cannot get
  // more funds than automatic coinselection anyway.
  // Use this only as a flag to explain why a hard stop occurred when there are
  // pending UTXOs.
  const isBlockedByPendingUtxos =
    !canBuildAtMinimumFeeAssumingAutoCoinSelection &&
    hasPendingUtxos &&
    isRawVaultPossible;
  const minimumRequiredFundsNow =
    vaultSetupRangeAssumingAutoCoinSelection.minimumVaultSetup.vaultedAmount +
    vaultSetupRangeAssumingAutoCoinSelection.minimumVaultSetup.packageFee +
    vaultSetupRangeAssumingAutoCoinSelection.minimumVaultSetup
      .triggerReserveValue;
  const requiredFundsForMinimumVaultSetup =
    vaultSetupRangeAssumingAutoCoinSelection.maxVaultAtMinimumPackageFeeRate
      ? vaultSetupRangeAssumingAutoCoinSelection.maxVaultAtMinimumPackageFeeRate
          .vaultedAmount +
        vaultSetupRangeAssumingAutoCoinSelection.maxVaultAtMinimumPackageFeeRate
          .packageFee +
        vaultSetupRangeAssumingAutoCoinSelection.maxVaultAtMinimumPackageFeeRate
          .triggerReserveValue
      : null;
  // If automatic coinselection cannot build any vault yet, fall back to the
  // raw eligible balance so the warning message can show an approximation.
  const missingFundsNow: number = Math.max(
    0,
    minimumRequiredFundsNow -
      (requiredFundsForMinimumVaultSetup !== null
        ? requiredFundsForMinimumVaultSetup
        : utxosDataBalance(vaultableUtxosData))
  );
  const triggerReserveValue = getAdditionalP2AOutputValue({
    outputsWithValue: [],
    additionalOutput: DUMMY_TRIGGER_RESERVE_OUTPUT(network),
    changeOutput: dummyChangeOutput,
    parentAnchorValue: toNumber(getTriggerAnchorValue(vaultMode)),
    presignedParentVSize: Math.max(...TRIGGER_TX_VBYTES),
    presignedParentFeeRate: presignedTriggerFeeRate,
    targetPackageFeeRate: settings.MAX_TRIGGER_FEERATE
  });

  const [userSelectedVaultedAmount, setUserSelectedVaultedAmount] = useState<
    number | null
  >(isValidVaultAmountRange ? maxVaultedAmount : null);

  const [isMaxVaultedAmount, setIsMaxVaultedAmount] = useState<boolean>(
    userSelectedVaultedAmount !== null &&
      userSelectedVaultedAmount === maxVaultedAmount
  );
  const [pendingUtxosWarningAccepted, setPendingUtxosWarningAccepted] =
    useState<boolean>(false);
  const vaultedAmount: number | null =
    isMaxVaultedAmount &&
    maxVaultAtSelectedPackageFeeRate &&
    maxVaultAtSelectedPackageFeeRate.vaultedAmount >=
      minimumVaultSetup.vaultedAmount
      ? maxVaultAtSelectedPackageFeeRate.vaultedAmount
      : userSelectedVaultedAmount !== null &&
          maxVaultAtSelectedPackageFeeRate &&
          maxVaultAtSelectedPackageFeeRate.vaultedAmount >=
            minimumVaultSetup.vaultedAmount &&
          userSelectedVaultedAmount >= minimumVaultSetup.vaultedAmount &&
          userSelectedVaultedAmount <=
            maxVaultAtSelectedPackageFeeRate.vaultedAmount
        ? userSelectedVaultedAmount
        : null;
  // This is the minFeeRate that goes into the Fee slider.
  // If no vault can be built yet, there is no real minimum buildable package fee
  // rate. Fall back to the target floor as a stable placeholder; the slider is
  // hidden in that state anyway.
  const minimumPackageFeeRate = isVaultPossible
    ? maxVaultAtMinimumPackageFeeRate.packageFeeRate
    : minimumTargetPackageFeeRate;
  // Clamp the user's selected target to the real minimum buildable package fee
  // rate. Just in case the slider range changes due to utxos change, ...
  const packageFeeRate =
    selectedTargetPackageFeeRate === null
      ? null
      : Math.max(selectedTargetPackageFeeRate, minimumPackageFeeRate);

  const onUserSelectedVaultedAmountChange = useCallback(
    (userSelectedVaultedAmount: number | null, type: 'USER' | 'RESET') => {
      setUserSelectedVaultedAmount(userSelectedVaultedAmount);

      //Make sure the MAX_FUNDS text is set when the user reacted to the
      //slider or input box, not when the onValueChange is triggered because
      //the componet was intenally reset
      if (type === 'USER' && userSelectedVaultedAmount !== null)
        setIsMaxVaultedAmount(userSelectedVaultedAmount === maxVaultedAmount);
    },
    [maxVaultedAmount]
  );

  const handleOK = useCallback(() => {
    if (
      packageFeeRate === null ||
      vaultedAmount === null ||
      lockBlocks === null ||
      coldAddress === null
    )
      throw new Error('Cannot process Vault');

    onVaultSetUpComplete({
      vaultedAmount: isMaxVaultedAmount ? 'MAX_FUNDS' : vaultedAmount,
      coldAddress,
      packageFeeRate,
      lockBlocks,

      accounts,
      utxosData: pickedVaultableUtxosData ?? vaultableUtxosData,
      coinControl,
      btcFiat
    });
  }, [
    packageFeeRate,
    pickedVaultableUtxosData,
    vaultableUtxosData,
    coinControl,
    vaultedAmount,
    isMaxVaultedAmount,
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
   * - We only perform the expensive calculation when necessary (max amount
   *   selected or current amount range invalid)
   * - We use the same calculation method as the main range estimation
   * - We batch updates to avoid multiple renders
   */
  const handlePackageFeeRateChange = useCallback(
    (newPackageFeeRate: number | null) => {
      batchedUpdates(() => {
        // Always update the fee rate
        setUserSelectedPackageFeeRate(newPackageFeeRate);

        // Recalculate immediately for MAX or when the current range is invalid
        // and a lower fee may make it valid again.
        if (
          (isMaxVaultedAmount || !isValidVaultAmountRange) &&
          newPackageFeeRate !== null
        ) {
          const newMaxEstimate = estimateMaxVaultAmount({
            utxosData: pickedVaultableUtxosData ?? vaultableUtxosData,
            coinControl,
            vaultOutput: DUMMY_VAULT_OUTPUT(network),
            backupOutput: DUMMY_BACKUP_OUTPUT(network),
            triggerReserveOutput: DUMMY_TRIGGER_RESERVE_OUTPUT(network),
            triggerReserveValue: getAdditionalP2AOutputValue({
              outputsWithValue: [],
              additionalOutput: DUMMY_TRIGGER_RESERVE_OUTPUT(network),
              changeOutput: dummyChangeOutput,
              parentAnchorValue: toNumber(getTriggerAnchorValue(vaultMode)),
              presignedParentVSize: Math.max(...TRIGGER_TX_VBYTES),
              presignedParentFeeRate: presignedTriggerFeeRate,
              targetPackageFeeRate: settings.MAX_TRIGGER_FEERATE
            }),
            changeOutput: dummyChangeOutput,
            vaultMode,
            packageFeeRate: newPackageFeeRate
          });

          // Update the amount in the same render cycle to prevent flicker
          if (
            newMaxEstimate &&
            newMaxEstimate.vaultedAmount >= minimumVaultSetup.vaultedAmount
          ) {
            setUserSelectedVaultedAmount(newMaxEstimate.vaultedAmount);
            setIsMaxVaultedAmount(true);
          } else {
            setUserSelectedVaultedAmount(null);
          }
        }
      });
    },
    [
      accounts,
      dummyChangeOutput,
      isMaxVaultedAmount,
      isValidVaultAmountRange,
      minimumVaultSetup.vaultedAmount,
      pickedVaultableUtxosData,
      vaultableUtxosData,
      coinControl,
      network,
      presignedTriggerFeeRate,
      settings.MAX_TRIGGER_FEERATE,
      vaultMode,
      setUserSelectedPackageFeeRate
    ]
  );

  const formatAmount = (amount: number) =>
    formatBtc({
      amount,
      subUnit: settings.SUB_UNIT,
      btcFiat,
      locale,
      currency
    });

  // The slider shows the package fee for the vault tx plus the on-chain
  // backup tx. The Unfreeze Reserve is displayed separately because it is set
  // aside, not spent.
  let packageFee = null;
  if (vaultedAmount !== null && packageFeeRate !== null) {
    if (isMaxVaultedAmount && maxVaultAtSelectedPackageFeeRate) {
      packageFee = maxVaultAtSelectedPackageFeeRate.packageFee;
    } else {
      const selected = coinSelectVaultTx({
        utxosData: pickedVaultableUtxosData ?? vaultableUtxosData,
        coinControl,
        //We never use the final vaultOutput since it is built using a random
        //key that we don't want to keep in memory, but setup still needs to
        //reserve the same backup and trigger-reserve outputs that real vault
        //creation will fund.
        vaultOutput: DUMMY_VAULT_OUTPUT(network),
        backupOutput: DUMMY_BACKUP_OUTPUT(network),
        changeOutput: dummyChangeOutput,
        packageFeeRate,
        vaultMode,
        vaultedAmount: toBigInt(vaultedAmount),
        shiftFeesToBackupTx: true,
        ...(triggerReserveValue > BigInt(0)
          ? {
              triggerReserveOutput: DUMMY_TRIGGER_RESERVE_OUTPUT(network),
              triggerReserveValue
            }
          : {})
      });
      if (typeof selected !== 'string') {
        const finalBackupFunding = getTargetValue(
          selected.targets,
          DUMMY_BACKUP_OUTPUT(network)
        );
        packageFee = toNumber(selected.fee + finalBackupFunding);
      }
    }
  }

  const prefilledAddressHelpIcon = useMemo<IconType>(
    () => ({ family: 'FontAwesome6', name: 'shield-halved' }),
    []
  );

  const allFieldsValid =
    vaultedAmount !== null &&
    lockBlocks !== null &&
    packageFeeRate !== null &&
    coldAddress !== null;

  const handleOpenCoinControl = useCallback(
    () => setIsCoinControlVisible(true),
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
            <Text className="text-base">{t('vaultSetup.interrupt')}</Text>
          </View>
          <Button onPress={navigation.goBack}>{t('goBack')}</Button>
        </View>
      ) : hasPendingUtxos &&
        canBuildAtMinimumFeeAssumingAutoCoinSelection &&
        !pendingUtxosWarningAccepted ? (
        <View className="w-full max-w-screen-sm mx-4" style={containerStyle}>
          <View className="mb-8">
            <Text className="text-base">
              {t('vaultSetup.somePendingUtxosWarning')}
            </Text>
          </View>
          <View className="self-center flex-row justify-center items-center gap-5">
            <Button onPress={navigation.goBack}>{t('goBack')}</Button>
            <Button onPress={() => setPendingUtxosWarningAccepted(true)}>
              {t('continueButton')}
            </Button>
          </View>
        </View>
      ) : !canBuildAtMinimumFeeAssumingAutoCoinSelection ? (
        <View className="w-full max-w-screen-sm mx-4" style={containerStyle}>
          <View className="mb-8">
            <Text className="text-base">
              <Trans
                i18nKey={
                  isBlockedByPendingUtxos
                    ? 'vaultSetup.blockedByPendingUtxosNotice'
                    : 'vaultSetup.notEnoughFunds'
                }
                values={{
                  missingFunds: formatBtc({
                    amount: missingFundsNow,
                    subUnit: settings.SUB_UNIT,
                    btcFiat,
                    locale,
                    currency
                  }),
                  minimumVaultedAmount: formatBtc({
                    amount:
                      vaultSetupRangeAssumingAutoCoinSelection.minimumVaultSetup
                        .vaultedAmount,
                    subUnit: settings.SUB_UNIT,
                    btcFiat,
                    locale,
                    currency
                  }),
                  minimumRequiredFunds: formatBtc({
                    amount: minimumRequiredFundsNow,
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
          {hasPendingUtxos ? (
            <View className="mb-6 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3">
              <Text className="text-base text-amber-900">
                <Trans
                  i18nKey="vaultSetup.somePendingUtxosBanner"
                  components={{
                    strong: <Text className="font-bold text-amber-900" />
                  }}
                />
              </Text>
            </View>
          ) : null}
          {isValidVaultAmountRange ? (
            <>
              <AmountInput
                btcFiat={btcFiat}
                isMaxAmount={isMaxVaultedAmount}
                label={t('vaultSetup.amountLabel')}
                allowCoinControl
                coinControl={coinControlSwitchOn}
                onCoinControlChange={handleCoinControlChange}
                initialValue={maxVaultedAmount}
                min={minimumVaultSetup.vaultedAmount}
                max={maxVaultedAmount}
                onValueChange={onUserSelectedVaultedAmountChange}
              />
              <View className="w-full flex-row items-start gap-2 px-2 pt-1">
                <Text className="shrink text-sm text-slate-500">
                  {t('vaultSetup.unfreezeReserveLabel')}:{' '}
                  {formatAmount(toNumber(triggerReserveValue))}
                </Text>
                <ModalInfoButton
                  title={t('vaultSetup.unfreezeReserveHelpTitle')}
                  icon={{ family: 'FontAwesome5', name: 'coins' }}
                  text={t('vaultSetup.unfreezeReserveHelp')}
                />
              </View>
            </>
          ) : (
            <View>
              {coinControl && canBuildAtSelectedFeeAssumingAutoCoinSelection ? (
                <CoinControlRecoveryPanel
                  message={t('vaultSetup.pickedUtxosInsufficient')}
                  onOpenCoinControl={handleOpenCoinControl}
                  onUseAuto={handleUseAutoCoinSelect}
                />
              ) : (
                <Text className="text-base m-auto self-center text-red-500">
                  {selectedTargetPackageFeeRate === null
                    ? t('vaultSetup.invalidFeeRate')
                    : coinControl
                      ? t('vaultSetup.pickedUtxosInsufficient')
                      : t('vaultSetup.lowerFeeRate')}
                </Text>
              )}
            </View>
          )}
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
            initialValue={initialPackageFeeRate}
            fee={packageFee}
            isOptimal={
              packageFee !== null &&
              selectedTargetPackageFeeRate === pickedInitialPackageFeeRate &&
              packageFeeRate === pickedInitialPackageFeeRate
            }
            label={t('vaultSetup.confirmationSpeedLabel')}
            min={minimumPackageFeeRate}
            onValueChange={handlePackageFeeRateChange}
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
          <CoinControlModal
            isVisible={isCoinControlVisible}
            utxosAvailability={vaultCoinControlUtxosAvailability}
            pickedUtxosData={pickedVaultableUtxosData}
            btcFiat={btcFiat}
            onClose={handleCloseCoinControl}
            onConfirm={handleConfirmCoinControl}
          />
        </View>
      )}
    </KeyboardAwareScrollView>
  );
}
