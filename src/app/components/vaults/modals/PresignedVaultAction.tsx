// Copyright (C) 2026 Jose-Luis Landabaso - https://rewindbitcoin.com
// Licensed under the GNU GPL v3 or later. See the LICENSE file for details.

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Modal, Button, ActivityIndicator } from '../../../../common/ui';
import { useTranslation } from 'react-i18next';
import { View, Text, Pressable } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import FeeInput from '../../FeeInput';
import { FeeEstimates, MIN_FEE_RATE, pickFeeEstimate } from '../../../lib/fees';
import { formatBalance, formatBlocks } from '../../../lib/format';
import { useSettings } from '../../../hooks/useSettings';
import {
  type Vault,
  type VaultStatus,
  getVaultMode
} from '../../../lib/vaults';
import { useWallet } from '../../../hooks/useWallet';
import useFirstDefinedValue from '~/common/hooks/useFirstDefinedValue';
import { useLocalization } from '../../../hooks/useLocalization';
import {
  buildVaultActionDataForFeeRate,
  canProceedToActionConfirmation,
  getLadderedRescueSortedTxs,
  getLadderedTriggerSortedTxs,
  getAdditionalOutputValue,
  getP2ARescueInfo,
  getP2ATriggerInfo,
  type P2ABumpPlan,
  type PresignedTxInfo,
  type VaultActionData
} from '../../../lib/vaultActionTx';
import { getVaultableUtxosData } from '../../../lib/utxoPolicy';

export type PresignedVaultActionProps = (
  | {
      /** The `role` controls copy, icon, button styling, presigned transaction source,
       * and which pushed status fields are treated as acceleration candidates.
       *
       * Trigger/unfreeze flow; shows lock-time copy and a neutral CTA. */
      role: 'TRIGGER';
      /** Vault timelock shown in trigger intro and confirmation copy. */
      lockBlocks: number;
    }
  | {
      /** Rescue flow; shows emergency copy and alert-styled CTAs. */
      role: 'RESCUE';
      lockBlocks?: never;
    }
) & {
  /** Vault whose presigned action transactions will be presented. */
  vault: Vault;
  /** Latest vault status used to choose first-push versus acceleration UX. */
  vaultStatus: VaultStatus;
  /**
   * P2A reserve-spend plan used when the selected action needs a CPFP child.
   *
   * For both trigger and rescue:
   * - `'loading'`: reserve discovery is in progress.
   * - `'error'`: reserve discovery failed; actions stay blocked until retry.
   * - empty `txosData`: preparation finished with no reserve TXOs, so the
   *   modal can offer a parent-only fallback if relay policy allows it.
   * - non-empty `txosData`: those reserve TXOs must be spent by the package
   *   child; they must not be bypassed with parent-only submission.
   * - `hasUnconfirmedUtxos`: blocks TRUC packages until the reserve confirms.
   *
   * Future rescue reserve plans should follow the same reserve-spend invariant
   * and fee-picker/package UX as trigger reserve plans. Their `changeOutput`
   * should point to the temporary rescue wallet's internal/change branch.
   */
  p2aBumpPlan: P2ABumpPlan | 'loading' | 'error';
  /** True while refreshing reserve data behind an already loaded bump plan. */
  p2aBumpPlanRefreshing: boolean;
  /** Called with the selected parent-only or parent-plus-child package data. */
  onAction: (actionData: VaultActionData) => void;
  /** Retries reserve discovery after a role-specific reserve scan failure. */
  onReserveRetry?: () => void;
  /** Optional funding flow opener for missing or underfunded P2A reserves. */
  onReserveFundsMissing?: () => void;
  /** Controls modal visibility while keeping the component mounted for animation. */
  isVisible: boolean;
  /** Closes the modal and resets local wizard state. */
  onClose: () => void;
  /** Called after the modal has fully hidden. Used to sequence follow-up modals. */
  onModalHide?: () => void;
};

/**
 * Shared UI for starting or accelerating a presigned vault action.
 *
 * UX behavior:
 * - Trigger first-push explains the unfreeze timelock, then asks for a final
 *   confirmation. If the trigger is already pushed but unconfirmed, the modal
 *   switches to acceleration copy and fee selection when a higher-fee path is
 *   available.
 * - Rescue first-push explains that funds move to the cold/panic address and
 *   uses alert-styled buttons. If the rescue is already pushed but unconfirmed,
 *   the modal switches to acceleration copy for the rescue transaction.
 * - Laddered vaults choose among presigned transactions and show a fee picker
 *   whenever multiple confirmation targets are selectable.
 * - P2A vaults surface reserve-specific states: no reserve yet, unconfirmed
 *   TRUC reserve, insufficient reserve, maximum fee reached, or a fixed
 *   parent-only confirmation when no reserve is available and relay policy
 *   accepts the parent.
 */
const PresignedVaultAction = ({
  role,
  vault,
  vaultStatus,
  p2aBumpPlan,
  p2aBumpPlanRefreshing,
  isVisible,
  onAction,
  onReserveRetry,
  onReserveFundsMissing,
  onClose,
  onModalHide,
  lockBlocks
}: PresignedVaultActionProps) => {
  const { locale, currency } = useLocalization();
  const vaultMode = useMemo<'LADDERED' | 'P2A_TRUC' | 'P2A_NON_TRUC'>(
    () => getVaultMode(vault),
    [vault]
  );
  const isLadderedVault = vaultMode === 'LADDERED';
  const { t } = useTranslation();
  const {
    feeEstimates: feeEstimatesRealTime,
    btcFiat: btcFiatRealTime,
    utxosData,
    historyData,
    vaultsStatuses
  } = useWallet();
  const { settings } = useSettings();
  // Cache to avoid flickering in the sliders while background refreshes happen.
  const btcFiat = useFirstDefinedValue<number>(btcFiatRealTime);
  // Reset when the user changes the Tape fee simulation setting, otherwise this
  // hidden modal would keep showing the previously latched fee ranges.
  const feeEstimates = useFirstDefinedValue<FeeEstimates>(
    feeEstimatesRealTime,
    settings?.TAPE_FEE_ESTIMATE_OVERRIDE
  );
  const triggerTxHex = vaultStatus.triggerTxHex;
  const presignedTxInfos = useMemo<PresignedTxInfo[] | null>(() => {
    if (role === 'TRIGGER')
      return isLadderedVault
        ? getLadderedTriggerSortedTxs(vault)
        : [getP2ATriggerInfo(vault)];
    if (!triggerTxHex) return null;
    return isLadderedVault
      ? getLadderedRescueSortedTxs(vault, triggerTxHex)
      : [getP2ARescueInfo(vault, triggerTxHex)];
  }, [role, isLadderedVault, vault, triggerTxHex]);
  const isPushedButUnconfirmed =
    role === 'TRIGGER'
      ? vaultStatus.triggerTxBlockHeight !== undefined
        ? vaultStatus.triggerTxBlockHeight === 0
        : !!vaultStatus.triggerPushTime
      : vaultStatus.panicTxBlockHeight !== undefined
        ? vaultStatus.panicTxBlockHeight === 0
        : !!vaultStatus.panicPushTime;
  const actionTxHex =
    role === 'TRIGGER' ? vaultStatus.triggerTxHex : vaultStatus.panicTxHex;
  const childTxHex =
    role === 'TRIGGER'
      ? vaultStatus.triggerCpfpTxHex
      : vaultStatus.panicCpfpTxHex;
  const pushedTxHex =
    isPushedButUnconfirmed && actionTxHex ? actionTxHex : undefined;
  const [step, setStep] = useState<'intro' | 'confirm'>('intro');
  const [isModalVisibleOrHiding, setIsModalVisibleOrHiding] =
    useState(isVisible);
  // User opt-in from the checkbox: when true, eligible hot-wallet UTXOs are
  // allowed into package building as a supplement to the reserve inputs.
  const [includeWalletSupplement, setIncludeWalletSupplement] = useState(false);
  const vaultableWalletUtxosData = useMemo(() => {
    if (role !== 'TRIGGER' || !isModalVisibleOrHiding || isLadderedVault)
      return [];
    if (!utxosData)
      throw new Error('Trigger wallet supplement requires wallet UTXO data');
    if (!vaultsStatuses)
      throw new Error('Trigger wallet supplement requires vault statuses');
    if (!historyData)
      throw new Error('Trigger wallet supplement requires history data');

    // Trigger supplement inputs use the same policy as vault setup: TRUC needs
    // confirmed inputs, while non-TRUC can use stable unconfirmed non-v3 inputs.
    return getVaultableUtxosData(
      utxosData,
      vaultsStatuses,
      historyData,
      vaultMode
    );
  }, [
    historyData,
    isLadderedVault,
    isModalVisibleOrHiding,
    role,
    utxosData,
    vaultMode,
    vaultsStatuses
  ]);
  if (includeWalletSupplement && role !== 'TRIGGER')
    throw new Error('Wallet supplement is only allowed for trigger actions');
  const isP2ABumpPlanLoading = !isLadderedVault && p2aBumpPlan === 'loading';
  const isP2ABumpPlanError = !isLadderedVault && p2aBumpPlan === 'error';

  useEffect(() => {
    // Keep action data stable while react-native-modal finishes closing.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (isVisible) setIsModalVisibleOrHiding(true);
  }, [isVisible]);

  const confirmationAvailability = useMemo(() => {
    if (!isModalVisibleOrHiding || !presignedTxInfos) return null;
    if (isP2ABumpPlanLoading || isP2ABumpPlanError) return null;
    if (!feeEstimates) return null;
    if (isPushedButUnconfirmed && !pushedTxHex) return null;
    if (!historyData) return null;
    return canProceedToActionConfirmation({
      vaultMode,
      feeEstimates,
      ...(pushedTxHex ? { pushedTxHex } : {}),
      ...(pushedTxHex && childTxHex ? { pushedChildTxHex: childTxHex } : {}),
      presignedTxInfos,
      ...(typeof p2aBumpPlan === 'object' ? { p2aBumpPlan } : {}),
      ...(includeWalletSupplement ? { vaultableWalletUtxosData } : {}),
      historyData
    });
  }, [
    isModalVisibleOrHiding,
    presignedTxInfos,
    isP2ABumpPlanLoading,
    isP2ABumpPlanError,
    feeEstimates,
    isPushedButUnconfirmed,
    pushedTxHex,
    vaultMode,
    childTxHex,
    p2aBumpPlan,
    includeWalletSupplement,
    vaultableWalletUtxosData,
    historyData
  ]);
  const confirmationBlocker = confirmationAvailability?.blocker;
  const minimumSelectableFeeRate =
    confirmationAvailability?.minimumSelectableFeeRate ?? null;
  const needsFeePicker = minimumSelectableFeeRate !== null;

  if (!settings)
    throw new Error(
      'This component should only be started after settings has been retrieved from storage'
    );
  const amountMode =
    settings.FIAT_MODE && typeof btcFiat === 'number'
      ? 'Fiat'
      : settings.SUB_UNIT;

  const feeRateForReasonableConfirmationTime = useMemo<number | null>(() => {
    if (!isModalVisibleOrHiding || !feeEstimates) return null;
    return pickFeeEstimate(feeEstimates, settings.INITIAL_CONFIRMATION_TIME)
      .feeEstimate;
  }, [
    isModalVisibleOrHiding,
    feeEstimates,
    settings.INITIAL_CONFIRMATION_TIME
  ]);

  const preferredInitialFeeRate = useMemo<number | null>(() => {
    // This modal stays mounted so Modal can animate across isVisible changes.
    // While fully hidden, return inert render-time values instead of action data.
    if (!isModalVisibleOrHiding || !confirmationAvailability) return null;
    if (confirmationAvailability.blocker !== null) return null;
    if (confirmationAvailability.minimumSelectableFeeRate === null)
      return presignedTxInfos?.[0]?.feeRate ?? null;
    if (feeRateForReasonableConfirmationTime === null) return null;
    return Math.max(
      confirmationAvailability.minimumSelectableFeeRate,
      feeRateForReasonableConfirmationTime
    );
  }, [
    isModalVisibleOrHiding,
    confirmationAvailability,
    presignedTxInfos,
    feeRateForReasonableConfirmationTime
  ]);

  const [feeRate, setFeeRate] = useState<number | null>(null);

  const getVaultActionDataForFeeRate = useCallback(
    (selectedFeeRate: number): VaultActionData | null => {
      // This modal stays mounted so Modal can animate across isVisible changes.
      // While fully hidden or unavailable, return inert render-time values instead of action data.
      if (
        !isModalVisibleOrHiding ||
        !presignedTxInfos ||
        !confirmationAvailability
      )
        return null;
      if (confirmationAvailability.blocker !== null) return null;
      return buildVaultActionDataForFeeRate({
        vaultMode,
        selectedFeeRate,
        ...(pushedTxHex ? { pushedTxHex } : {}),
        presignedTxInfos,
        ...(typeof p2aBumpPlan === 'object' ? { p2aBumpPlan } : {}),
        ...(includeWalletSupplement ? { vaultableWalletUtxosData } : {})
      });
    },
    [
      isModalVisibleOrHiding,
      presignedTxInfos,
      confirmationAvailability,
      vaultMode,
      pushedTxHex,
      p2aBumpPlan,
      includeWalletSupplement,
      vaultableWalletUtxosData
    ]
  );
  const cannotAccelerateMaxFee =
    confirmationBlocker === 'replacementFeeAboveMaximum';

  const initialFeeRate = useMemo<number | null>(() => {
    if (
      preferredInitialFeeRate !== null &&
      getVaultActionDataForFeeRate(preferredInitialFeeRate) !== null
    )
      return preferredInitialFeeRate;

    // If the preferred target is not fundable, use the lowest buildable fee.
    if (
      minimumSelectableFeeRate !== null &&
      getVaultActionDataForFeeRate(minimumSelectableFeeRate) !== null
    )
      return minimumSelectableFeeRate;

    return null;
  }, [
    preferredInitialFeeRate,
    minimumSelectableFeeRate,
    getVaultActionDataForFeeRate
  ]);

  const selectedFeeRate = feeRate ?? initialFeeRate;

  const vaultActionData = useMemo<VaultActionData | null>(() => {
    if (selectedFeeRate === null) return null;
    return getVaultActionDataForFeeRate(selectedFeeRate);
  }, [selectedFeeRate, getVaultActionDataForFeeRate]);

  // Build the same action as above without passing vaultableWalletUtxosData.
  // If this is null while vaultActionData is buildable, the selected fee needs
  // wallet supplement inputs.
  const vaultActionDataWithoutWalletSupplement =
    useMemo<VaultActionData | null>(() => {
      if (selectedFeeRate === null) return null;
      if (!isModalVisibleOrHiding || !presignedTxInfos) return null;
      return buildVaultActionDataForFeeRate({
        vaultMode,
        selectedFeeRate,
        ...(pushedTxHex ? { pushedTxHex } : {}),
        presignedTxInfos,
        ...(typeof p2aBumpPlan === 'object' ? { p2aBumpPlan } : {})
      });
    }, [
      selectedFeeRate,
      isModalVisibleOrHiding,
      presignedTxInfos,
      vaultMode,
      pushedTxHex,
      p2aBumpPlan
    ]);

  const canOpenConfirmStep =
    confirmationAvailability?.blocker === null && initialFeeRate !== null;

  const fee = vaultActionData ? vaultActionData.actionFee : null;

  const handleModalHide = useCallback(() => {
    setIsModalVisibleOrHiding(false);
    setStep('intro');
    setFeeRate(null);
    setIncludeWalletSupplement(false);
    onModalHide?.();
  }, [onModalHide]);

  const handleAction = useCallback(() => {
    if (!vaultActionData)
      throw new Error(
        role === 'TRIGGER'
          ? 'Cannot unfreeze non-existing selected tx'
          : 'Cannot rescue non-existing selected tx'
      );
    onAction(vaultActionData);
  }, [role, onAction, vaultActionData]);

  let actionText: string;
  let noReserveAvailableYetText: string;
  let reserveUnconfirmedText: string;
  let reserveCannotBuildPackageText: string;
  let reserveScanErrorText: string;
  let introText: string;
  let postActionExplanationText: string;
  let feeSelectorExplanationText: string;
  let confirmationSpeedLabel: string;
  let parentOnlyConfirmationText: string;
  let startActionButtonText: string;

  if (role === 'TRIGGER') {
    const timeLockTime = formatBlocks(lockBlocks, t, locale, true);
    actionText = t('wallet.vault.triggerUnfreezeButton');
    noReserveAvailableYetText = t(
      'wallet.vault.triggerUnfreeze.noReserveAvailableYet'
    );
    reserveUnconfirmedText = t(
      'wallet.vault.triggerUnfreeze.reserveUnconfirmed'
    );
    reserveCannotBuildPackageText = t(
      'wallet.vault.triggerUnfreeze.insufficientReserveFunds'
    );
    reserveScanErrorText = t('wallet.vault.triggerUnfreeze.reserveScanError');
    introText = isPushedButUnconfirmed
      ? t('wallet.vault.triggerUnfreeze.introAccelerate')
      : t('wallet.vault.triggerUnfreeze.intro', { timeLockTime });
    postActionExplanationText = t(
      'wallet.vault.triggerUnfreeze.postActionExplanation',
      { timeLockTime }
    );
    feeSelectorExplanationText = t(
      'wallet.vault.triggerUnfreeze.feeSelectorExplanation'
    );
    confirmationSpeedLabel = t(
      'wallet.vault.triggerUnfreeze.confirmationSpeedLabel'
    );
    parentOnlyConfirmationText = t(
      'wallet.vault.triggerUnfreeze.parentOnlyConfirmation'
    );
    startActionButtonText = t('continueButton');
  } else {
    actionText = t('wallet.vault.rescueButton');
    noReserveAvailableYetText = t('wallet.vault.rescue.noReserveAvailableYet');
    reserveUnconfirmedText = t('wallet.vault.rescue.reserveUnconfirmed');
    reserveCannotBuildPackageText = t(
      'wallet.vault.rescue.insufficientReserveFunds'
    );
    reserveScanErrorText = t('wallet.vault.rescue.reserveScanError');
    introText = isPushedButUnconfirmed
      ? t('wallet.vault.rescue.introAccelerate')
      : t('wallet.vault.rescue.intro', { panicAddress: vault.coldAddress });
    postActionExplanationText = t('wallet.vault.rescue.postActionExplanation', {
      timeLockTime: 0
    });
    feeSelectorExplanationText = t(
      'wallet.vault.rescue.feeSelectorExplanation'
    );
    confirmationSpeedLabel = t('wallet.vault.rescue.confirmationSpeedLabel');
    parentOnlyConfirmationText = t(
      'wallet.vault.rescue.parentOnlyConfirmation'
    );
    startActionButtonText = t('imInDangerButton');
  }
  const introActionButtonText = isPushedButUnconfirmed
    ? t('accelerateButton')
    : startActionButtonText;
  // Rescue is the emergency path, so its primary action keeps the red alert
  // treatment used by the old Rescue modal instead of looking like normal flow.
  const actionButtonModeProps =
    role === 'RESCUE' ? ({ mode: 'primary-alert' } as const) : {};
  const modalIcon =
    role === 'TRIGGER'
      ? ({ family: 'MaterialCommunityIcons', name: 'snowflake-melt' } as const)
      : ({ family: 'MaterialCommunityIcons', name: 'alarm-light' } as const);

  // Hard reserve failure states. For a first push this means the reserve cannot
  // fund even the minimum dust-safe CPFP child. For acceleration this means no
  // valid replacement path exists with the current reserve/current child state.
  const showReserveCannotBuildAnyPackage =
    confirmationBlocker === 'p2aReserveCannotFundMinimumPackage' ||
    (!isLadderedVault && confirmationBlocker === 'noReplacementPath');
  // Enables the trigger wallet-supplement UX: checkbox, add-wallet-funds hint,
  // and transaction building with selected wallet inputs when reserve-only is
  // not enough. Rescue never reaches this path.
  const canTryWalletSupplement =
    role === 'TRIGGER' &&
    !isLadderedVault &&
    typeof p2aBumpPlan === 'object' &&
    vaultableWalletUtxosData.length > 0 &&
    !(vaultMode === 'P2A_TRUC' && p2aBumpPlan.hasUnconfirmedUtxos);
  const selectedFeeNeedsMoreReserveFunds =
    !isLadderedVault &&
    needsFeePicker &&
    selectedFeeRate !== null &&
    vaultActionData === null;
  const preferredPackageFeeNeedsMoreFunds =
    !isLadderedVault &&
    needsFeePicker &&
    preferredInitialFeeRate !== null &&
    initialFeeRate !== null &&
    preferredInitialFeeRate > initialFeeRate &&
    getVaultActionDataForFeeRate(preferredInitialFeeRate) === null;
  // There is no reserve, and the parent-only fee is below the recommended
  // (reasonable ~ 2 hours) fee.
  const noReserveAndParentFeeBelowReasonable =
    !isLadderedVault &&
    !isPushedButUnconfirmed &&
    confirmationAvailability?.blocker === null &&
    !needsFeePicker &&
    typeof p2aBumpPlan === 'object' &&
    p2aBumpPlan.txosData.length === 0 &&
    feeRateForReasonableConfirmationTime !== null &&
    (presignedTxInfos?.[0]?.feeRate ?? Infinity) <
      feeRateForReasonableConfirmationTime;
  let reserveFundsMissingPromptText: string | null = null;
  if (selectedFeeNeedsMoreReserveFunds)
    reserveFundsMissingPromptText =
      role === 'TRIGGER'
        ? t('wallet.vault.triggerUnfreeze.reserveCannotPaySelectedFee')
        : t('wallet.vault.rescue.reserveCannotPaySelectedFee');
  else if (preferredPackageFeeNeedsMoreFunds)
    reserveFundsMissingPromptText =
      role === 'TRIGGER'
        ? t('wallet.vault.triggerUnfreeze.packageBelowRecommendedFee')
        : t('wallet.vault.rescue.reserveBelowRecommendedFee');
  else if (noReserveAndParentFeeBelowReasonable)
    reserveFundsMissingPromptText =
      role === 'TRIGGER'
        ? t(
            'wallet.vault.triggerUnfreeze.noReserveParentFeeBelowRecommendedFee'
          )
        : t('wallet.vault.rescue.parentFeeBelowRecommendedFee');
  const txUsesWalletSupplement =
    includeWalletSupplement &&
    vaultActionData !== null &&
    Array.isArray(vaultActionData.walletSupplementUtxosData);
  // The currently selected fee cannot be built without hot-wallet supplement
  // inputs, but there are eligible wallet UTXOs worth trying.
  const selectedFeeNeedsWalletSupplement =
    canTryWalletSupplement &&
    selectedFeeRate !== null &&
    vaultActionDataWithoutWalletSupplement === null;
  // Broader wallet-supplement UX trigger: show the checkbox/hints when the
  // selected fee needs supplement, when reserve funding is generally missing,
  // or when the selected action already uses supplement inputs.
  const walletSupplementNeeded =
    selectedFeeNeedsWalletSupplement ||
    reserveFundsMissingPromptText !== null ||
    showReserveCannotBuildAnyPackage ||
    confirmationBlocker === 'noP2AReserve' ||
    txUsesWalletSupplement;
  const showWalletSupplementCheckbox =
    canTryWalletSupplement &&
    (walletSupplementNeeded || includeWalletSupplement);

  //controls the checkbox auto turn-off
  useEffect(() => {
    if (!includeWalletSupplement) return;
    // The checkbox is an explicit opt-in. Clear it when wallet supplement stops
    // being available or useful so it cannot silently re-enable later.
    if (!canTryWalletSupplement || !walletSupplementNeeded)
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIncludeWalletSupplement(false);
  }, [includeWalletSupplement, canTryWalletSupplement, walletSupplementNeeded]);

  const toggleWalletSupplement = useCallback(() => {
    setIncludeWalletSupplement(value => !value);
  }, []);

  const walletSupplementCheckbox = showWalletSupplementCheckbox ? (
    <Pressable
      onPress={toggleWalletSupplement}
      className="flex-row items-center pt-4"
    >
      <MaterialCommunityIcons
        name={
          includeWalletSupplement
            ? 'checkbox-marked-outline'
            : 'checkbox-blank-outline'
        }
        size={24}
        className="text-primary mr-3"
      />
      <Text className="flex-1 text-sm text-slate-700">
        {t('wallet.vault.triggerUnfreeze.walletSupplementCheckbox')}
      </Text>
    </Pressable>
  ) : null;
  const reserveFundsMissingButton = onReserveFundsMissing ? (
    <View className="items-center pt-4">
      <Button mode="secondary-alert" onPress={onReserveFundsMissing}>
        {t('wallet.vault.addReserveFundsButton')}
      </Button>
    </View>
  ) : null;
  const shouldShowAdditionalWalletSupplementHint =
    role === 'TRIGGER' &&
    (!showWalletSupplementCheckbox || includeWalletSupplement) &&
    (selectedFeeNeedsMoreReserveFunds ||
      preferredPackageFeeNeedsMoreFunds ||
      noReserveAndParentFeeBelowReasonable ||
      showReserveCannotBuildAnyPackage ||
      confirmationBlocker === 'noP2AReserve');

  //At what package fee rate should we calculate the
  //suggested extra hot-wallet supplement funding?
  //
  //- If the user selected a fee and it cannot be funded, use selectedFeeRate.
  //- Else if the preferred/recommended package fee (preferredInitialFeeRate)
  //  cannot be funded, use preferredInitialFeeRate.
  //- Else if there is no reserve and the parent-only fee is below
  //  recommendation, use feeRateForReasonableConfirmationTime.
  //- Else fall back to the selected fee, then recommended fee, then MIN_FEE_RATE.
  const walletSupplementTargetFeeRate =
    selectedFeeNeedsMoreReserveFunds && selectedFeeRate !== null
      ? selectedFeeRate
      : preferredPackageFeeNeedsMoreFunds && preferredInitialFeeRate !== null
        ? preferredInitialFeeRate
        : noReserveAndParentFeeBelowReasonable &&
            feeRateForReasonableConfirmationTime !== null
          ? feeRateForReasonableConfirmationTime
          : (selectedFeeRate ??
            feeRateForReasonableConfirmationTime ??
            MIN_FEE_RATE);
  const walletSupplementParentTxInfo = presignedTxInfos?.[0];
  const walletSupplement =
    shouldShowAdditionalWalletSupplementHint &&
    typeof p2aBumpPlan === 'object' &&
    p2aBumpPlan.changeOutput &&
    walletSupplementParentTxInfo
      ? getAdditionalOutputValue({
          p2aBumpPlan,
          // The additional wallet input will have the same output type as wallet
          // change, so use changeOutput as the sizing proxy here.
          additionalOutput: p2aBumpPlan.changeOutput,
          parentTxInfo: walletSupplementParentTxInfo,
          targetPackageFeeRate: walletSupplementTargetFeeRate,
          vaultableWalletUtxosData
        })
      : undefined;
  const formattedWalletSupplement =
    walletSupplement === undefined
      ? undefined
      : formatBalance({
          satsBalance: walletSupplement,
          btcFiat,
          currency,
          locale,
          mode: amountMode,
          appendSubunit: true
        });
  const walletSupplementHint =
    role === 'TRIGGER' && formattedWalletSupplement ? (
      <Text className="text-sm text-slate-700 pt-4">
        {t('wallet.vault.triggerUnfreeze.walletFundingHint', {
          amount: formattedWalletSupplement
        })}
      </Text>
    ) : null;
  const reserveFundsMissingAction =
    role === 'TRIGGER' ? (
      <>
        {walletSupplementCheckbox}
        {walletSupplementHint}
      </>
    ) : (
      reserveFundsMissingButton
    );
  const reserveFundsMissingPrompt = reserveFundsMissingPromptText ? (
    <View className="pt-4 px-2">
      <Text className="text-base text-notification">
        {reserveFundsMissingPromptText}
      </Text>
      {reserveFundsMissingAction}
    </View>
  ) : null;
  const postActionExplanation = (
    <View>
      <Text className="text-base text-slate-600 pt-4 px-2">
        {postActionExplanationText}
      </Text>
      {walletSupplementCheckbox ? (
        <View className="px-2">{walletSupplementCheckbox}</View>
      ) : null}
    </View>
  );
  const confirmationExplanation =
    reserveFundsMissingPrompt ?? postActionExplanation;
  const isConfirmationReadinessLoading =
    !isP2ABumpPlanError &&
    (isP2ABumpPlanLoading ||
      !confirmationAvailability ||
      (needsFeePicker && !feeEstimates));
  const hasBlockingState =
    confirmationBlocker !== undefined && confirmationBlocker !== null;
  // The intro button can advance once readiness is known. The next screen may
  // be a real confirmation, or a blocking reserve/error state with no action.
  const canLeaveIntro =
    isP2ABumpPlanError || hasBlockingState || canOpenConfirmStep;
  const canShowActionButton = confirmationAvailability?.blocker === null;

  let modalContent: React.ReactNode;
  if (step === 'intro') {
    modalContent = (
      <View>
        <Text className="text-base text-slate-600 pb-2 px-2">{introText}</Text>
      </View>
    );
  } else if (isP2ABumpPlanError) {
    modalContent = (
      <View>
        <Text className="text-base text-slate-600 pb-2 px-2">
          {reserveScanErrorText}
        </Text>
        {onReserveRetry ? (
          <View className="items-center pt-4">
            <Button mode="secondary-alert" onPress={onReserveRetry}>
              {t('tryAgain')}
            </Button>
          </View>
        ) : null}
      </View>
    );
  } else if (isConfirmationReadinessLoading) {
    modalContent = <ActivityIndicator />;
  } else if (confirmationBlocker === 'noP2AReserve') {
    modalContent = (
      <View>
        <Text className="text-base text-slate-600 pb-2 px-2">
          {noReserveAvailableYetText}
        </Text>
        <View className="px-2">{reserveFundsMissingAction}</View>
      </View>
    );
  } else if (confirmationBlocker === 'p2aReserveUnconfirmed') {
    modalContent = (
      <View>
        <Text className="text-base text-slate-600 pb-2 px-2">
          {reserveUnconfirmedText}
        </Text>
      </View>
    );
  } else if (cannotAccelerateMaxFee) {
    modalContent = (
      <View>
        <Text className="text-base text-slate-600 pb-2 px-2">
          {t('wallet.vault.cannotAccelerateMaxFee')}
        </Text>
      </View>
    );
  } else if (showReserveCannotBuildAnyPackage) {
    modalContent = (
      <View>
        <Text className="text-base text-slate-600 pb-2 px-2">
          {reserveCannotBuildPackageText}
        </Text>
        <View className="px-2">{reserveFundsMissingAction}</View>
      </View>
    );
  } else if (step === 'confirm' && needsFeePicker && feeEstimates) {
    modalContent = (
      <View>
        {initialFeeRate !== null && minimumSelectableFeeRate !== null ? (
          <>
            <Text className="text-base text-slate-600 pb-4 px-2">
              {feeSelectorExplanationText}
            </Text>
            <View className="bg-slate-100 p-2 rounded-xl">
              <FeeInput
                min={minimumSelectableFeeRate}
                btcFiat={btcFiat}
                feeEstimates={feeEstimates}
                initialValue={selectedFeeRate ?? initialFeeRate}
                fee={fee}
                isOptimal={
                  fee !== null &&
                  selectedFeeRate === feeRateForReasonableConfirmationTime
                }
                label={confirmationSpeedLabel}
                onValueChange={setFeeRate}
              />
            </View>
          </>
        ) : (
          <ActivityIndicator />
        )}
        {confirmationExplanation}
      </View>
    );
  } else if (step === 'confirm') {
    modalContent = (
      <View>
        <Text className="text-base text-slate-600 pb-4 px-2">
          {parentOnlyConfirmationText}
        </Text>
        {confirmationExplanation}
      </View>
    );
  } else {
    modalContent = null;
  }

  return (
    <Modal
      headerMini={true}
      isVisible={isVisible}
      title={actionText}
      icon={modalIcon}
      onClose={onClose}
      onModalHide={handleModalHide}
      customButtons={
        step === 'intro' ? (
          <View className="items-center gap-6 gap-y-4 flex-row flex-wrap justify-center pb-4">
            <Button mode="secondary" onPress={onClose}>
              {t('cancelButton')}
            </Button>
            {(isConfirmationReadinessLoading || canLeaveIntro) && (
              <Button
                {...actionButtonModeProps}
                onPress={() => {
                  if (!isConfirmationReadinessLoading) setStep('confirm');
                }}
                loading={isConfirmationReadinessLoading}
              >
                {introActionButtonText}
              </Button>
            )}
          </View>
        ) : step === 'confirm' ? (
          <View className="items-center gap-6 gap-y-4 flex-row flex-wrap justify-center pb-4">
            <Button mode="secondary" onPress={onClose}>
              {t('cancelButton')}
            </Button>
            {canShowActionButton ? (
              <Button
                {...actionButtonModeProps}
                onPress={handleAction}
                disabled={!vaultActionData}
                loading={p2aBumpPlanRefreshing}
              >
                {actionText}
              </Button>
            ) : null}
          </View>
        ) : undefined
      }
    >
      {modalContent}
    </Modal>
  );
};

export default PresignedVaultAction;
