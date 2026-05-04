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
   * - `undefined`: the reserve plan is not known yet, so the modal waits.
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
  p2aBumpPlan: P2ABumpPlan | undefined;
  /** Called with the selected parent-only or parent-plus-child package data. */
  onAction: (actionData: VaultActionTxData) => void;
  /** Controls modal visibility while keeping the component mounted for animation. */
  isVisible: boolean;
  /** Closes the modal and resets local wizard state. */
  onClose: () => void;
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
  onClose,
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
  const isP2ABumpPlanLoading = !isLadderedVault && p2aBumpPlan === undefined;
  const p2aBumpPlanHasSpendableUtxos =
    !isLadderedVault &&
    !!p2aBumpPlan &&
    p2aBumpPlan.utxosData.length > 0 &&
    !(vaultMode === 'P2A_TRUC' && p2aBumpPlan.hasUnconfirmedUtxos);
  const needsFeeEstimatesForAvailability =
    isLadderedVault || p2aBumpPlanHasSpendableUtxos;
  const actionAvailability = useMemo(() => {
    if (!isVisible || !presignedTxInfos) return null;
    if (isP2ABumpPlanLoading) return null;
    if (needsFeeEstimatesForAvailability && !feeEstimates) return null;
    if (isPushedButUnconfirmed && !pushedTxHex) return null;
    return getActionAvailability({
      vaultMode,
      ...(feeEstimates ? { feeEstimates } : {}),
      ...(pushedTxHex ? { pushedTxHex } : {}),
      ...(pushedTxHex && childTxHex ? { pushedChildTxHex: childTxHex } : {}),
      presignedTxInfos,
      ...(p2aBumpPlan ? { p2aBumpPlan } : {})
    });
  }, [
    isVisible,
    presignedTxInfos,
    isP2ABumpPlanLoading,
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

  const preferredInitialFeeRate = useMemo<number | null>(() => {
    // This modal stays mounted so Modal can animate across isVisible changes.
    // While hidden, return inert render-time values instead of action data.
    if (!isVisible || !actionAvailability) return null;
    if (actionAvailability.result !== null) return null;
    if (actionAvailability.minimumSelectableFeeRate === null)
      return presignedTxInfos?.[0]?.feeRate ?? null;
    if (!feeEstimates) return null;

    const preferredNetworkFeeRate = pickFeeEstimate(
      feeEstimates,
      settings.INITIAL_CONFIRMATION_TIME
    ).feeEstimate;
    return Math.max(
      actionAvailability.minimumSelectableFeeRate,
      preferredNetworkFeeRate
    );
  }, [
    isVisible,
    actionAvailability,
    presignedTxInfos,
    feeEstimates,
    settings.INITIAL_CONFIRMATION_TIME
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
        ...(p2aBumpPlan ? { p2aBumpPlan } : {})
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

  const txData = useMemo<VaultActionTxData | null>(() => {
    const selectedFeeRate = feeRate ?? initialFeeRate;
    if (selectedFeeRate === null) return null;
    return getTxDataForFeeRate(selectedFeeRate);
  }, [feeRate, initialFeeRate, getTxDataForFeeRate]);

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

  let modalTitle: string;
  let noReserveAvailableYetText: string;
  let reserveUnconfirmedText: string;
  let insufficientReserveFundsText: string;
  let introText: string;
  let additionalExplanationText: string;
  let feeSelectorExplanationText: string;
  let confirmationSpeedLabel: string;
  let parentOnlyConfirmationText: string;
  let startActionButtonText: string;

  if (role === 'TRIGGER') {
    const timeLockTime = formatBlocks(lockBlocks, t, locale, true);
    modalTitle = t('wallet.vault.triggerUnfreezeButton');
    noReserveAvailableYetText = t(
      'wallet.vault.triggerUnfreeze.noReserveAvailableYet'
    );
    reserveUnconfirmedText = t(
      'wallet.vault.triggerUnfreeze.reserveUnconfirmed'
    );
    insufficientReserveFundsText = t(
      'wallet.vault.triggerUnfreeze.insufficientReserveFunds'
    );
    introText = isPushedButUnconfirmed
      ? t('wallet.vault.triggerUnfreeze.introAccelerate')
      : t('wallet.vault.triggerUnfreeze.intro', { timeLockTime });
    additionalExplanationText = t(
      'wallet.vault.triggerUnfreeze.additionalExplanation',
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
    modalTitle = t('wallet.vault.rescueButton');
    noReserveAvailableYetText = t('wallet.vault.rescue.noReserveAvailableYet');
    reserveUnconfirmedText = t('wallet.vault.rescue.reserveUnconfirmed');
    insufficientReserveFundsText = t(
      'wallet.vault.rescue.insufficientReserveFunds'
    );
    introText = isPushedButUnconfirmed
      ? t('wallet.vault.rescue.introAccelerate')
      : t('wallet.vault.rescue.intro', { panicAddress: vault.coldAddress });
    additionalExplanationText = t('wallet.vault.rescue.additionalExplanation', {
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

  const showInsufficientReserveFunds =
    availabilityResult === 'insufficientP2AReserve' ||
    (!isLadderedVault && availabilityResult === 'noReplacementPath');
  const additionalExplanation = (
    <Text className="text-base text-slate-600 pt-4 px-2">
      {additionalExplanationText}
    </Text>
  );

  let modalContent: React.ReactNode;
  if (
    isP2ABumpPlanLoading ||
    !actionAvailability ||
    (needsFeePicker && !feeEstimates)
  ) {
    modalContent = <ActivityIndicator />;
  } else if (availabilityResult === 'noP2AReserve') {
    modalContent = (
      <View>
        <Text className="text-base text-slate-600 pb-2 px-2">
          {/* TODO: Replace this explanation-only state with the reserve funding/top-up wizard. */}
          {noReserveAvailableYetText}
        </Text>
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
  } else if (showInsufficientReserveFunds) {
    modalContent = (
      <View>
        <Text className="text-base text-slate-600 pb-2 px-2">
          {/* TODO: Replace this explanation-only state with the reserve funding/top-up wizard. */}
          {insufficientReserveFundsText}
        </Text>
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
        {additionalExplanation}
      </View>
    );
  } else if (step === 'confirm') {
    modalContent = (
      <View>
        <Text className="text-base text-slate-600 pb-4 px-2">
          {parentOnlyConfirmationText}
        </Text>
        {additionalExplanation}
      </View>
    );
  } else {
    modalContent = null;
  }

  return (
    <Modal
      headerMini={true}
      isVisible={isVisible}
      title={modalTitle}
      icon={modalIcon}
      onClose={onClose}
      customButtons={
        step === 'intro' ? (
          <View className="items-center gap-6 gap-y-4 flex-row flex-wrap justify-center pb-4">
            <Button mode="secondary" onPress={onClose}>
              {t('cancelButton')}
            </Button>
            {canOpenConfirmStep && (
              <Button
                {...actionButtonModeProps}
                onPress={() => setStep('confirm')}
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
              {modalTitle}
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
