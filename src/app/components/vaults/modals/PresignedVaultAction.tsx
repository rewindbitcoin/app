// Copyright (C) 2026 Jose-Luis Landabaso - https://rewindbitcoin.com
// Licensed under the GNU GPL v3 or later. See the LICENSE file for details.

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Modal, Button, ActivityIndicator } from '../../../../common/ui';
import { useTranslation } from 'react-i18next';
import { View, Text } from 'react-native';
import FeeInput from '../../FeeInput';
import { FeeEstimates, pickFeeEstimate } from '../../../lib/fees';
import { formatBlocks } from '../../../lib/format';
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
  buildTxDataForFeeRate,
  getActionAvailability,
  getLadderedRescueSortedTxs,
  getLadderedTriggerSortedTxs,
  getP2ARescueInfo,
  getP2ATriggerInfo,
  type P2ABumpPlan,
  type PresignedTxInfo,
  type VaultActionTxData
} from '../../../lib/vaultActionTx';

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
  vaultStatus: VaultStatus | undefined;
  /**
   * P2A reserve-spend plan used when the selected action needs a CPFP child.
   *
   * For both trigger and rescue:
   * - `'loading'`: reserve discovery is in progress.
   * - `'error'`: reserve discovery failed; actions stay blocked until retry.
   * - empty `utxosData`: preparation finished with no reserve UTXOs, so the
   *   modal can offer a parent-only fallback if relay policy allows it.
   * - non-empty `utxosData`: those reserve UTXOs must be spent by the package
   *   child; they must not be bypassed with parent-only submission.
   * - `hasUnconfirmedUtxos`: blocks TRUC packages until the reserve confirms.
   *
   * Future rescue reserve plans should follow the same reserve-spend invariant
   * and fee-picker/package UX as trigger reserve plans. Their `changeOutput`
   * should point to the temporary rescue wallet's internal/change branch.
   */
  p2aBumpPlan: P2ABumpPlan | 'loading' | 'error';
  /** Called with the selected parent-only or parent-plus-child package data. */
  onAction: (actionData: VaultActionTxData) => void;
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
  isVisible,
  onAction,
  onReserveRetry,
  onReserveFundsMissing,
  onClose,
  onModalHide,
  lockBlocks
}: PresignedVaultActionProps) => {
  const { locale } = useLocalization();
  const vaultMode = useMemo<'LADDERED' | 'P2A_TRUC' | 'P2A_NON_TRUC'>(
    () => getVaultMode(vault),
    [vault]
  );
  const isLadderedVault = vaultMode === 'LADDERED';
  const { t } = useTranslation();
  const { feeEstimates: feeEstimatesRealTime, btcFiat: btcFiatRealTime } =
    useWallet();
  const { settings } = useSettings();
  // Cache to avoid flickering in the sliders while background refreshes happen.
  const btcFiat = useFirstDefinedValue<number>(btcFiatRealTime);
  // Reset when the user changes the Tape fee simulation setting, otherwise this
  // hidden modal would keep showing the previously latched fee ranges.
  const feeEstimates = useFirstDefinedValue<FeeEstimates>(
    feeEstimatesRealTime,
    settings?.TAPE_FEE_ESTIMATE_OVERRIDE
  );
  const triggerTxHex = vaultStatus?.triggerTxHex;
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
      ? vaultStatus?.triggerTxBlockHeight !== undefined
        ? vaultStatus.triggerTxBlockHeight === 0
        : !!vaultStatus?.triggerPushTime
      : vaultStatus?.panicTxBlockHeight !== undefined
        ? vaultStatus.panicTxBlockHeight === 0
        : !!vaultStatus?.panicPushTime;
  const actionTxHex =
    role === 'TRIGGER' ? vaultStatus?.triggerTxHex : vaultStatus?.panicTxHex;
  const childTxHex =
    role === 'TRIGGER'
      ? vaultStatus?.triggerCpfpTxHex
      : vaultStatus?.panicCpfpTxHex;
  const pushedTxHex =
    isPushedButUnconfirmed && actionTxHex ? actionTxHex : undefined;
  const isP2ABumpPlanLoading = !isLadderedVault && p2aBumpPlan === 'loading';
  const isP2ABumpPlanError = !isLadderedVault && p2aBumpPlan === 'error';
  const p2aBumpPlanHasSpendableUtxos =
    !isLadderedVault &&
    typeof p2aBumpPlan === 'object' &&
    p2aBumpPlan.utxosData.length > 0 &&
    !(vaultMode === 'P2A_TRUC' && p2aBumpPlan.hasUnconfirmedUtxos);
  const needsFeeEstimatesForAvailability =
    isLadderedVault || p2aBumpPlanHasSpendableUtxos;
  const actionAvailability = useMemo(() => {
    if (!isVisible || !presignedTxInfos) return null;
    if (isP2ABumpPlanLoading || isP2ABumpPlanError) return null;
    if (needsFeeEstimatesForAvailability && !feeEstimates) return null;
    if (isPushedButUnconfirmed && !pushedTxHex) return null;
    return getActionAvailability({
      vaultMode,
      ...(feeEstimates ? { feeEstimates } : {}),
      ...(pushedTxHex ? { pushedTxHex } : {}),
      ...(pushedTxHex && childTxHex ? { pushedChildTxHex: childTxHex } : {}),
      presignedTxInfos,
      ...(typeof p2aBumpPlan === 'object' ? { p2aBumpPlan } : {})
    });
  }, [
    isVisible,
    presignedTxInfos,
    isP2ABumpPlanLoading,
    isP2ABumpPlanError,
    needsFeeEstimatesForAvailability,
    feeEstimates,
    isPushedButUnconfirmed,
    pushedTxHex,
    vaultMode,
    childTxHex,
    p2aBumpPlan
  ]);
  const availabilityResult = actionAvailability?.result;
  const minimumSelectableFeeRate =
    actionAvailability?.minimumSelectableFeeRate ?? null;
  const needsFeePicker = minimumSelectableFeeRate !== null;

  if (!settings)
    throw new Error(
      'This component should only be started after settings has been retrieved from storage'
    );

  const [step, setStep] = useState<'intro' | 'confirm'>('intro');

  const preferredNetworkFeeRate = useMemo<number | null>(() => {
    if (!isVisible || !feeEstimates) return null;
    return pickFeeEstimate(feeEstimates, settings.INITIAL_CONFIRMATION_TIME)
      .feeEstimate;
  }, [isVisible, feeEstimates, settings.INITIAL_CONFIRMATION_TIME]);

  const preferredInitialFeeRate = useMemo<number | null>(() => {
    // This modal stays mounted so Modal can animate across isVisible changes.
    // While hidden, return inert render-time values instead of action data.
    if (!isVisible || !actionAvailability) return null;
    if (actionAvailability.result !== null) return null;
    if (actionAvailability.minimumSelectableFeeRate === null)
      return presignedTxInfos?.[0]?.feeRate ?? null;
    if (preferredNetworkFeeRate === null) return null;
    return Math.max(
      actionAvailability.minimumSelectableFeeRate,
      preferredNetworkFeeRate
    );
  }, [
    isVisible,
    actionAvailability,
    presignedTxInfos,
    preferredNetworkFeeRate
  ]);

  const [feeRate, setFeeRate] = useState<number | null>(null);

  const getTxDataForFeeRate = useCallback(
    (selectedFeeRate: number): VaultActionTxData | null => {
      // This modal stays mounted so Modal can animate across isVisible changes.
      // While hidden or unavailable, return inert render-time values instead of action data.
      if (!isVisible || !presignedTxInfos || !actionAvailability) return null;
      if (actionAvailability.result !== null) return null;
      return buildTxDataForFeeRate({
        vaultMode,
        selectedFeeRate,
        ...(pushedTxHex ? { pushedTxHex } : {}),
        presignedTxInfos,
        ...(typeof p2aBumpPlan === 'object' ? { p2aBumpPlan } : {})
      });
    },
    [
      isVisible,
      presignedTxInfos,
      actionAvailability,
      vaultMode,
      pushedTxHex,
      p2aBumpPlan
    ]
  );

  const cannotAccelerateMaxFee =
    availabilityResult === 'replacementFeeAboveMaximum';

  const initialFeeRate = useMemo<number | null>(() => {
    if (
      preferredInitialFeeRate !== null &&
      getTxDataForFeeRate(preferredInitialFeeRate) !== null
    )
      return preferredInitialFeeRate;

    // If the preferred target is not fundable, use the lowest buildable fee.
    if (
      minimumSelectableFeeRate !== null &&
      getTxDataForFeeRate(minimumSelectableFeeRate) !== null
    )
      return minimumSelectableFeeRate;

    return null;
  }, [preferredInitialFeeRate, minimumSelectableFeeRate, getTxDataForFeeRate]);

  const selectedFeeRate = feeRate ?? initialFeeRate;
  const txData = useMemo<VaultActionTxData | null>(() => {
    if (selectedFeeRate === null) return null;
    return getTxDataForFeeRate(selectedFeeRate);
  }, [selectedFeeRate, getTxDataForFeeRate]);

  const canOpenConfirmStep =
    actionAvailability?.result === null && initialFeeRate !== null;

  const fee = txData ? txData.actionFee : null;

  // This modal stays mounted so Modal can animate across isVisible changes.
  // Reset the local wizard step when it closes so reopening starts clean.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!isVisible) setStep('intro');
  }, [isVisible]);

  // Reset feeRate every time the selected initial fee changes.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFeeRate(prev =>
      initialFeeRate !== null && prev !== initialFeeRate ? initialFeeRate : prev
    );
  }, [initialFeeRate]);

  const handleAction = useCallback(() => {
    if (!txData)
      throw new Error(
        role === 'TRIGGER'
          ? 'Cannot unfreeze non-existing selected tx'
          : 'Cannot rescue non-existing selected tx'
      );
    onAction(txData);
  }, [role, onAction, txData]);

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
    availabilityResult === 'p2aReserveCannotFundMinimumPackage' ||
    (!isLadderedVault && availabilityResult === 'noReplacementPath');
  const selectedFeeNeedsMoreReserveFunds =
    !isLadderedVault &&
    needsFeePicker &&
    selectedFeeRate !== null &&
    txData === null;
  const preferredFeeNeedsMoreReserveFunds =
    !isLadderedVault &&
    needsFeePicker &&
    preferredInitialFeeRate !== null &&
    initialFeeRate !== null &&
    preferredInitialFeeRate > initialFeeRate &&
    getTxDataForFeeRate(preferredInitialFeeRate) === null;
  const p2aParentOnlyFeeBelowRecommended =
    !isLadderedVault &&
    !isPushedButUnconfirmed &&
    actionAvailability?.result === null &&
    !needsFeePicker &&
    typeof p2aBumpPlan === 'object' &&
    p2aBumpPlan.utxosData.length === 0 &&
    preferredNetworkFeeRate !== null &&
    (presignedTxInfos?.[0]?.feeRate ?? Infinity) < preferredNetworkFeeRate;
  let reserveFundsMissingPromptText: string | null = null;
  if (selectedFeeNeedsMoreReserveFunds)
    reserveFundsMissingPromptText =
      role === 'TRIGGER'
        ? t('wallet.vault.triggerUnfreeze.reserveCannotPaySelectedFee')
        : t('wallet.vault.rescue.reserveCannotPaySelectedFee');
  else if (preferredFeeNeedsMoreReserveFunds)
    reserveFundsMissingPromptText =
      role === 'TRIGGER'
        ? t('wallet.vault.triggerUnfreeze.reserveBelowRecommendedFee')
        : t('wallet.vault.rescue.reserveBelowRecommendedFee');
  else if (p2aParentOnlyFeeBelowRecommended)
    reserveFundsMissingPromptText =
      role === 'TRIGGER'
        ? t('wallet.vault.triggerUnfreeze.parentFeeBelowRecommendedFee')
        : t('wallet.vault.rescue.parentFeeBelowRecommendedFee');
  const reserveFundsMissingButton = onReserveFundsMissing ? (
    <View className="items-center pt-4">
      <Button mode="secondary-alert" onPress={onReserveFundsMissing}>
        {t('wallet.vault.addReserveFundsButton')}
      </Button>
    </View>
  ) : null;
  const reserveFundsMissingPrompt = reserveFundsMissingPromptText ? (
    <View className="pt-4 px-2">
      <Text className="text-base text-notification">
        {reserveFundsMissingPromptText}
      </Text>
      {reserveFundsMissingButton}
    </View>
  ) : null;
  const postActionExplanation = (
    <Text className="text-base text-slate-600 pt-4 px-2">
      {postActionExplanationText}
    </Text>
  );
  const confirmationExplanation =
    reserveFundsMissingPrompt ?? postActionExplanation;
  const modalIsLoading =
    isP2ABumpPlanLoading ||
    !actionAvailability ||
    (needsFeePicker && !feeEstimates);

  let modalContent: React.ReactNode;
  if (isP2ABumpPlanError) {
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
  } else if (modalIsLoading) {
    modalContent =
      step === 'intro' ? (
        <View>
          <Text className="text-base text-slate-600 pb-2 px-2">
            {introText}
          </Text>
        </View>
      ) : (
        <ActivityIndicator />
      );
  } else if (availabilityResult === 'noP2AReserve') {
    modalContent = (
      <View>
        <Text className="text-base text-slate-600 pb-2 px-2">
          {noReserveAvailableYetText}
        </Text>
        {reserveFundsMissingButton}
      </View>
    );
  } else if (availabilityResult === 'p2aReserveUnconfirmed') {
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
        {reserveFundsMissingButton}
      </View>
    );
  } else if (step === 'intro') {
    modalContent = (
      <View>
        <Text className="text-base text-slate-600 pb-2 px-2">{introText}</Text>
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
                initialValue={initialFeeRate}
                fee={fee}
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
      {...(onModalHide ? { onModalHide } : {})}
      customButtons={
        step === 'intro' ? (
          <View className="items-center gap-6 gap-y-4 flex-row flex-wrap justify-center pb-4">
            <Button mode="secondary" onPress={onClose}>
              {t('cancelButton')}
            </Button>
            {(modalIsLoading || canOpenConfirmStep) && (
              <Button
                {...actionButtonModeProps}
                onPress={() => setStep('confirm')}
                loading={modalIsLoading}
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
            <Button
              {...actionButtonModeProps}
              onPress={handleAction}
              disabled={!txData}
            >
              {actionText}
            </Button>
          </View>
        ) : undefined
      }
    >
      {modalContent}
    </Modal>
  );
};

export default PresignedVaultAction;
