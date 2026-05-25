// Copyright (C) 2026 Jose-Luis Landabaso - https://rewindbitcoin.com
// Licensed under the GNU GPL v3 or later. See the LICENSE file for details.

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Modal, Button, ActivityIndicator } from '../../../../common/ui';
import { useTranslation } from 'react-i18next';
import { View, Text, Pressable } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  CoinControlPanel,
  CoinControlRecoveryPanel,
  coinControlIcon
} from '../../CoinControl';
import FeeInput from '../../FeeInput';
import { FeeEstimates, MIN_FEE_RATE, pickFeeEstimate } from '../../../lib/fees';
import { formatBalance, formatBlocks } from '../../../lib/format';
import { useSettings } from '../../../hooks/useSettings';
import {
  type UtxosData,
  type Vault,
  type VaultStatus,
  getVaultMode
} from '../../../lib/vaults';
import { useWallet } from '../../../hooks/useWallet';
import useFirstDefinedValue from '~/common/hooks/useFirstDefinedValue';
import { useLocalization } from '../../../hooks/useLocalization';
import {
  buildVaultActionDataForFeeRate,
  getVaultActionBlocker,
  getLadderedRescueSortedTxs,
  getLadderedTriggerSortedTxs,
  getAdditionalOutputValue,
  getP2ARescueInfo,
  getP2ATriggerInfo,
  type P2ABumpPlan,
  type PresignedTxInfo,
  type VaultActionData
} from '../../../lib/vaultActionTx';
import { getVaultableUtxos } from '../../../lib/utxoPolicy';

type VaultActionBlockerReason =
  | ReturnType<typeof getVaultActionBlocker>['reason']
  | undefined;

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
  const [step, setStep] = useState<'intro' | 'confirm' | 'coincontrol'>(
    'intro'
  );
  const [isModalVisibleOrHiding, setIsModalVisibleOrHiding] =
    useState(isVisible);
  // User opt-in from the checkbox: when true, eligible hot-wallet UTXOs are
  // allowed into package building as a supplement to the reserve inputs.
  const [walletSupplementRequested, setWalletSupplementRequested] =
    useState(false);
  // If set, these are the vaultable wallet supplement UTXOs manually picked by
  // the user.
  const [pickedVaultableWalletUtxosData, setPickedVaultableWalletUtxosData] =
    useState<UtxosData | null>(null);
  const walletSupplementCoinControl = pickedVaultableWalletUtxosData !== null;
  const vaultableWalletUtxosResult = useMemo(() => {
    if (role !== 'TRIGGER' || !isModalVisibleOrHiding || isLadderedVault)
      return { utxosData: [], utxosAvailability: [] };
    if (!utxosData || !vaultsStatuses || !historyData)
      return { utxosData: [], utxosAvailability: [] };

    // Trigger supplement inputs use the same policy as vault setup: TRUC needs
    // confirmed inputs, while non-TRUC can use stable unconfirmed non-v3 inputs.
    return getVaultableUtxos(utxosData, vaultsStatuses, historyData, vaultMode);
  }, [
    historyData,
    isLadderedVault,
    isModalVisibleOrHiding,
    role,
    utxosData,
    vaultMode,
    vaultsStatuses
  ]);
  const vaultableWalletUtxosData = vaultableWalletUtxosResult.utxosData;
  const vaultableWalletUtxosAvailability =
    vaultableWalletUtxosResult.utxosAvailability;
  if (walletSupplementRequested && role !== 'TRIGGER')
    throw new Error('Wallet supplement is only allowed for trigger actions');
  const isP2ABumpPlanLoading = !isLadderedVault && p2aBumpPlan === 'loading';
  const isP2ABumpPlanError = !isLadderedVault && p2aBumpPlan === 'error';

  useEffect(() => {
    // Keep action data stable while react-native-modal finishes closing.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (isVisible) setIsModalVisibleOrHiding(true);
  }, [isVisible]);

  if (!settings)
    throw new Error(
      'This component should only be started after settings has been retrieved from storage'
    );
  const amountMode =
    settings.FIAT_MODE && typeof btcFiat === 'number'
      ? 'Fiat'
      : settings.SUB_UNIT;

  // The fee rate for the 2 hour confirmation target (INITIAL_CONFIRMATION_TIME).
  // We call this the "reasonable" confirmation time.
  const feeRateForReasonableConfirmationTime = useMemo<number | null>(() => {
    if (!isModalVisibleOrHiding || !feeEstimates) return null;
    return pickFeeEstimate(feeEstimates, settings.INITIAL_CONFIRMATION_TIME)
      .feeEstimate;
  }, [
    isModalVisibleOrHiding,
    feeEstimates,
    settings.INITIAL_CONFIRMATION_TIME
  ]);

  const [feeRate, setFeeRate] = useState<number | null>(null);

  /**
   * Current trigger/rescue readiness and concrete action data for the user's
   * current wallet-supplement choice.
   *
   * `getVaultActionBlocker(...)` explains whether the flow is blocked
   * and which fee range can be offered. `buildVaultActionDataForFeeRate(...)`
   * then proves a concrete fee can build the tx/package the user would submit.
   * Keeping both results in one plan makes that coupling explicit for the UI.
   */
  const {
    blockerReason,
    blockerReasonAssumingAutoWalletSupplement,
    minimumSelectableFeeRate,
    needsFeeInput,
    preferredInitialFeeRate,
    initialFeeRate,
    selectedFeeRate,
    vaultActionData,
    vaultActionDataAssumingAutoWalletSupplement,
    vaultActionDataWithoutWalletSupplement
  } = useMemo(() => {
    // UX: unlocks intro-to-confirm or shows why trigger/rescue is unavailable; undefined means the block check has not run and null means unblocked.
    let blockerReason: VaultActionBlockerReason = undefined;
    // UX: unlocks manual-pick utxo recovery via auto selection; same as above, but assuming wallet supplement is opted in and auto coin selection is used.
    let blockerReasonAssumingAutoWalletSupplement: VaultActionBlockerReason =
      undefined;
    // UX: sets the minimum fee the picker will allow; null means no picker is needed or availability is unknown.
    let minimumSelectableFeeRate: number | null = null;
    // UX: decides whether the confirm step shows FeeInput; false means fixed-fee/no-input or unknown.
    let needsFeeInput = false;
    // UX: selects the first recommended fee shown to the user; null means no default can be chosen yet.
    let preferredInitialFeeRate: number | null = null;
    // UX: checks whether the recommended default fee can be offered; null means it is absent or unbuildable.
    let vaultActionDataAtPreferredInitialFeeRate: VaultActionData | null = null;
    // UX: unlocks the confirm step with a concrete buildable fee; null keeps confirmation unavailable/loading.
    let initialFeeRate: number | null = null;
    // UX: tracks the fee currently driving the preview/action button; null means there is no usable fee yet.
    let selectedFeeRate: number | null = null;
    // UX: enables the final action button for the current supplement choice; null means it cannot build now.
    let vaultActionData: VaultActionData | null = null;
    // UX: same as above, but assuming wallet supplement is opted in and auto coin selection is used for supplement UTXOs.
    let vaultActionDataAssumingAutoWalletSupplement: VaultActionData | null =
      null;
    // UX: decides whether to prompt for wallet supplement funds; null means no-supplement did not build or was not probed.
    let vaultActionDataWithoutWalletSupplement: VaultActionData | null = null;

    if (
      isModalVisibleOrHiding &&
      presignedTxInfos &&
      !isP2ABumpPlanLoading &&
      !isP2ABumpPlanError &&
      feeEstimates &&
      !(isPushedButUnconfirmed && !pushedTxHex) &&
      historyData
    ) {
      const sharedBlockerArgs = {
        vaultMode,
        feeEstimates,
        ...(pushedTxHex ? { pushedTxHex } : {}),
        ...(pushedTxHex && childTxHex ? { pushedChildTxHex: childTxHex } : {}),
        presignedTxInfos,
        ...(typeof p2aBumpPlan === 'object' ? { p2aBumpPlan } : {}),
        historyData
      };
      ({ reason: blockerReason, minimumSelectableFeeRate } =
        getVaultActionBlocker({
          ...sharedBlockerArgs,
          ...(walletSupplementRequested
            ? {
                vaultableWalletUtxosData:
                  pickedVaultableWalletUtxosData ?? vaultableWalletUtxosData
              }
            : {}),
          coinControl: walletSupplementCoinControl
        }));
      if (walletSupplementCoinControl) {
        ({ reason: blockerReasonAssumingAutoWalletSupplement } =
          getVaultActionBlocker({
            ...sharedBlockerArgs,
            ...(walletSupplementRequested ? { vaultableWalletUtxosData } : {}),
            coinControl: false
          }));
      } else blockerReasonAssumingAutoWalletSupplement = blockerReason;
    }

    needsFeeInput = minimumSelectableFeeRate !== null;

    // Initial fee rate is the max of the reasonable one and the minimum
    // fee rate that can lead to an enabled confirmation button.
    if (blockerReason === null) {
      if (minimumSelectableFeeRate === null)
        preferredInitialFeeRate = presignedTxInfos?.[0]?.feeRate ?? null;
      else if (feeRateForReasonableConfirmationTime !== null)
        preferredInitialFeeRate = Math.max(
          minimumSelectableFeeRate,
          feeRateForReasonableConfirmationTime
        );
    }

    const sharedActionBuildArgs =
      isModalVisibleOrHiding && presignedTxInfos
        ? {
            vaultMode,
            ...(pushedTxHex ? { pushedTxHex } : {}),
            presignedTxInfos,
            ...(typeof p2aBumpPlan === 'object' ? { p2aBumpPlan } : {})
          }
        : null;
    const currentWalletSupplementArgs = walletSupplementRequested
      ? {
          vaultableWalletUtxosData:
            pickedVaultableWalletUtxosData ?? vaultableWalletUtxosData
        }
      : {};
    if (
      preferredInitialFeeRate !== null &&
      sharedActionBuildArgs !== null &&
      blockerReason === null
    ) {
      vaultActionDataAtPreferredInitialFeeRate = buildVaultActionDataForFeeRate(
        {
          ...sharedActionBuildArgs,
          selectedFeeRate: preferredInitialFeeRate,
          ...currentWalletSupplementArgs,
          coinControl: walletSupplementCoinControl
        }
      );
    }

    if (vaultActionDataAtPreferredInitialFeeRate !== null)
      initialFeeRate = preferredInitialFeeRate;
    else if (
      minimumSelectableFeeRate !== null &&
      sharedActionBuildArgs !== null &&
      blockerReason === null
    ) {
      // If the preferred target is not fundable, use the lowest buildable fee.
      const vaultActionDataAtMinimumSelectableFeeRate =
        buildVaultActionDataForFeeRate({
          ...sharedActionBuildArgs,
          selectedFeeRate: minimumSelectableFeeRate,
          ...currentWalletSupplementArgs,
          coinControl: walletSupplementCoinControl
        });
      if (vaultActionDataAtMinimumSelectableFeeRate !== null)
        initialFeeRate = minimumSelectableFeeRate;
    }

    selectedFeeRate = feeRate ?? initialFeeRate;
    if (
      selectedFeeRate !== null &&
      sharedActionBuildArgs !== null &&
      blockerReason === null
    ) {
      vaultActionData = buildVaultActionDataForFeeRate({
        ...sharedActionBuildArgs,
        selectedFeeRate,
        ...currentWalletSupplementArgs,
        coinControl: walletSupplementCoinControl
      });

      // Probe the same action without wallet supplement inputs. If this is null
      // while vaultActionData is buildable, the selected fee needs supplement.
      vaultActionDataWithoutWalletSupplement = buildVaultActionDataForFeeRate({
        ...sharedActionBuildArgs,
        selectedFeeRate,
        coinControl: false
      });
    }

    if (!walletSupplementCoinControl) {
      vaultActionDataAssumingAutoWalletSupplement = vaultActionData;
    } else if (
      selectedFeeRate !== null &&
      sharedActionBuildArgs !== null &&
      blockerReasonAssumingAutoWalletSupplement === null
    ) {
      vaultActionDataAssumingAutoWalletSupplement =
        buildVaultActionDataForFeeRate({
          ...sharedActionBuildArgs,
          selectedFeeRate,
          ...(walletSupplementRequested ? { vaultableWalletUtxosData } : {}),
          coinControl: false
        });
    }

    return {
      blockerReason,
      blockerReasonAssumingAutoWalletSupplement,
      minimumSelectableFeeRate,
      needsFeeInput,
      preferredInitialFeeRate,
      initialFeeRate,
      selectedFeeRate,
      vaultActionData,
      vaultActionDataAssumingAutoWalletSupplement,
      vaultActionDataWithoutWalletSupplement
    };
  }, [
    pickedVaultableWalletUtxosData,
    vaultableWalletUtxosData,
    walletSupplementCoinControl,
    isModalVisibleOrHiding,
    presignedTxInfos,
    isP2ABumpPlanLoading,
    isP2ABumpPlanError,
    feeEstimates,
    isPushedButUnconfirmed,
    historyData,
    feeRateForReasonableConfirmationTime,
    feeRate,
    vaultMode,
    childTxHex,
    walletSupplementRequested,
    pushedTxHex,
    p2aBumpPlan
  ]);

  const cannotAccelerateMaxFee = blockerReason === 'replacementFeeAboveMaximum';

  const fee = vaultActionData ? vaultActionData.actionFee : null;

  const handleModalHide = useCallback(() => {
    setIsModalVisibleOrHiding(false);
    setStep('intro');
    setFeeRate(null);
    setWalletSupplementRequested(false);
    setPickedVaultableWalletUtxosData(null);
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
  const modalTitle =
    step === 'coincontrol' ? t('coinControl.title') : actionText;
  const activeModalIcon = step === 'coincontrol' ? coinControlIcon : modalIcon;

  // Hard reserve failure states. For a first push this means the reserve cannot
  // fund even the minimum dust-safe CPFP child. For acceleration this means no
  // valid replacement path exists with the current reserve/current child state.
  const showReserveCannotBuildAnyPackage =
    blockerReason === 'p2aReserveCannotFundMinimumPackage' ||
    (!isLadderedVault && blockerReason === 'noReplacementPath');
  // Capability gate: wallet supplement can only be offered when this trigger
  // flow has eligible hot-wallet UTXOs that can legally supplement the reserve.
  const canOfferWalletSupplement =
    role === 'TRIGGER' &&
    !isLadderedVault &&
    typeof p2aBumpPlan === 'object' &&
    vaultableWalletUtxosData.length > 0 &&
    !(vaultMode === 'P2A_TRUC' && p2aBumpPlan.hasUnconfirmedUtxos);
  // The selected fee has no buildable action data for the user's current
  // choices.
  const selectedFeeCannotBuildAction =
    !isLadderedVault && selectedFeeRate !== null && vaultActionData === null;
  const preferredPackageFeeNeedsMoreFunds =
    !isLadderedVault &&
    preferredInitialFeeRate !== null &&
    initialFeeRate !== null &&
    preferredInitialFeeRate > initialFeeRate;
  let reserveFundsMissingPromptText: string | null = null;
  if (!isLadderedVault) {
    if (selectedFeeCannotBuildAction)
      reserveFundsMissingPromptText =
        role === 'TRIGGER'
          ? t('wallet.vault.triggerUnfreeze.reserveCannotPaySelectedFee')
          : t('wallet.vault.rescue.reserveCannotPaySelectedFee');
    else if (preferredPackageFeeNeedsMoreFunds)
      reserveFundsMissingPromptText =
        role === 'TRIGGER'
          ? t('wallet.vault.triggerUnfreeze.packageBelowRecommendedFee')
          : t('wallet.vault.rescue.reserveBelowRecommendedFee');
    // UX: fixed-fee parent-only fallback can proceed, but show a warning that it
    // may confirm slower than the recommended (reasonable ~ 2 hours) target.
    else if (
      blockerReason === null &&
      !needsFeeInput &&
      feeRateForReasonableConfirmationTime !== null &&
      (presignedTxInfos?.[0]?.feeRate ?? Infinity) <
        feeRateForReasonableConfirmationTime
    )
      reserveFundsMissingPromptText =
        role === 'TRIGGER'
          ? t(
              'wallet.vault.triggerUnfreeze.noReserveParentFeeBelowRecommendedFee'
            )
          : t('wallet.vault.rescue.parentFeeBelowRecommendedFee');
  }
  const txUsesWalletSupplement =
    vaultActionData !== null &&
    Array.isArray(vaultActionData.walletSupplementUtxosData);
  if (txUsesWalletSupplement && !walletSupplementRequested)
    throw new Error('Wallet supplement used without user request');
  // Reserve-only cannot build at the selected fee. The current path may still
  // build if wallet supplement is used.
  const selectedFeeCannotBuildActionWithoutWalletSupplement =
    canOfferWalletSupplement &&
    selectedFeeRate !== null &&
    vaultActionDataWithoutWalletSupplement === null;
  // UX reason for offering wallet supplement: it may help the current action
  // build, or the current action already uses it. A below-recommended but
  // buildable fee is only a warning, not a supplement prompt.
  const walletSupplementOfferReason =
    selectedFeeCannotBuildActionWithoutWalletSupplement ||
    selectedFeeCannotBuildAction ||
    showReserveCannotBuildAnyPackage ||
    blockerReason === 'noP2AReserve'
      ? 'canHelpCurrentAction'
      : txUsesWalletSupplement
        ? 'txUsesWalletSupplement'
        : null;
  const showWalletSupplementCheckbox =
    canOfferWalletSupplement &&
    (walletSupplementOfferReason !== null || walletSupplementRequested);

  // Controls checkbox auto turn-off.
  useEffect(() => {
    if (!walletSupplementRequested) return;
    // The checkbox is an explicit opt-in. Clear it when wallet supplement stops
    // being offerable or no longer has a reason to affect this action.
    if (!canOfferWalletSupplement || walletSupplementOfferReason === null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setWalletSupplementRequested(false);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPickedVaultableWalletUtxosData(null);
    }
  }, [
    walletSupplementRequested,
    canOfferWalletSupplement,
    walletSupplementOfferReason
  ]);

  const toggleWalletSupplement = useCallback(() => {
    if (walletSupplementRequested) {
      setWalletSupplementRequested(false);
      setPickedVaultableWalletUtxosData(null);
    } else setWalletSupplementRequested(true);
  }, [walletSupplementRequested]);
  const handleOpenWalletSupplementCoinControl = useCallback(() => {
    setStep('coincontrol');
  }, []);
  const handleToggleManualWalletSupplement = useCallback(() => {
    if (walletSupplementCoinControl) setPickedVaultableWalletUtxosData(null);
    else setStep('coincontrol');
  }, [walletSupplementCoinControl]);
  const handleCloseWalletSupplementCoinControl = useCallback(() => {
    setStep('confirm');
  }, []);
  const handleUseAutoWalletSupplement = useCallback(() => {
    setPickedVaultableWalletUtxosData(null);
  }, []);
  const handleConfirmWalletSupplementCoinControl = useCallback(
    (pickedUtxosData: UtxosData) => {
      setPickedVaultableWalletUtxosData(pickedUtxosData);
      setStep('confirm');
    },
    []
  );

  const walletSupplementCheckbox = showWalletSupplementCheckbox ? (
    <Pressable
      onPress={toggleWalletSupplement}
      className="flex-row items-center pt-4"
    >
      <MaterialCommunityIcons
        name={
          walletSupplementRequested
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
  const manualWalletSupplementCheckbox =
    showWalletSupplementCheckbox && walletSupplementRequested ? (
      <Pressable
        onPress={handleToggleManualWalletSupplement}
        className="flex-row items-center pt-4"
      >
        <MaterialCommunityIcons
          name={
            walletSupplementCoinControl
              ? 'checkbox-marked-outline'
              : 'checkbox-blank-outline'
          }
          size={24}
          className="text-primary mr-3"
        />
        <Text className="flex-1 text-sm text-slate-700">
          {t('wallet.vault.triggerUnfreeze.manualWalletSupplementCheckbox')}
        </Text>
      </Pressable>
    ) : null;
  const autoWalletSupplementCanProceed =
    blockerReasonAssumingAutoWalletSupplement === null;
  const manualWalletSupplementNeedsRecovery =
    walletSupplementRequested &&
    walletSupplementCoinControl &&
    autoWalletSupplementCanProceed &&
    ((blockerReason !== undefined && blockerReason !== null) ||
      (selectedFeeRate !== null &&
        vaultActionData === null &&
        vaultActionDataAssumingAutoWalletSupplement !== null));
  const manualWalletSupplementRecoveryPrompt =
    manualWalletSupplementNeedsRecovery ? (
      <CoinControlRecoveryPanel
        message={t(
          'wallet.vault.triggerUnfreeze.pickedWalletSupplementUtxosInsufficient'
        )}
        className="pt-4 px-2"
        textClassName="text-base text-notification"
        onOpenCoinControl={handleOpenWalletSupplementCoinControl}
        onUseAuto={handleUseAutoWalletSupplement}
      />
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
    (!showWalletSupplementCheckbox || walletSupplementRequested) &&
    (selectedFeeCannotBuildAction ||
      showReserveCannotBuildAnyPackage ||
      blockerReason === 'noP2AReserve' ||
      txUsesWalletSupplement);

  // Size the suggested extra hot-wallet funding for the fee the user is
  // currently trying to pick. Recommended-fee warnings are advisory; the amount
  // here should explain the selected action, not a different target.
  const walletSupplementTargetFeeRate =
    selectedFeeRate ?? feeRateForReasonableConfirmationTime ?? MIN_FEE_RATE;
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
    walletSupplement === undefined || walletSupplement <= 0
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
        {manualWalletSupplementCheckbox}
        {walletSupplementHint}
      </>
    ) : (
      reserveFundsMissingButton
    );
  const reserveFundsMissingPrompt = reserveFundsMissingPromptText
    ? (manualWalletSupplementRecoveryPrompt ?? (
        <View className="pt-4 px-2">
          <Text className="text-base text-notification">
            {reserveFundsMissingPromptText}
          </Text>
          {reserveFundsMissingAction}
        </View>
      ))
    : manualWalletSupplementRecoveryPrompt;
  const postActionExplanation = (
    <View>
      <Text className="text-base text-slate-600 pt-4 px-2">
        {postActionExplanationText}
      </Text>
      {walletSupplementCheckbox ? (
        <View className="px-2">
          {walletSupplementCheckbox}
          {manualWalletSupplementCheckbox}
        </View>
      ) : null}
    </View>
  );
  const confirmationExplanation =
    reserveFundsMissingPrompt ?? postActionExplanation;
  const isConfirmationReadinessLoading =
    !isP2ABumpPlanError &&
    (isP2ABumpPlanLoading ||
      blockerReason === undefined ||
      (needsFeeInput && !feeEstimates));

  const hasBlockingState =
    blockerReason !== undefined && blockerReason !== null;

  // The intro button can advance once readiness is known. The next screen may
  // be a real confirmation, or a blocking reserve/error state with no action.
  // initialFeeRate !== null means we have a concrete buildable fee for the
  // confirmation step.
  const canLeaveIntro =
    isP2ABumpPlanError || hasBlockingState || initialFeeRate !== null;

  const canShowActionButton = blockerReason === null;

  let modalContent: React.ReactNode;
  if (step === 'coincontrol') {
    modalContent = (
      <CoinControlPanel
        utxosAvailability={vaultableWalletUtxosAvailability}
        pickedUtxosData={pickedVaultableWalletUtxosData}
        btcFiat={btcFiat}
        onClose={handleCloseWalletSupplementCoinControl}
        onConfirm={handleConfirmWalletSupplementCoinControl}
      />
    );
  } else if (step === 'intro') {
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
  } else if (blockerReason === 'noP2AReserve') {
    modalContent = (
      <View>
        {manualWalletSupplementRecoveryPrompt ?? (
          <>
            <Text className="text-base text-slate-600 pb-2 px-2">
              {noReserveAvailableYetText}
            </Text>
            <View className="px-2">{reserveFundsMissingAction}</View>
          </>
        )}
      </View>
    );
  } else if (blockerReason === 'p2aReserveUnconfirmed') {
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
        {manualWalletSupplementRecoveryPrompt ?? (
          <Text className="text-base text-slate-600 pb-2 px-2">
            {t('wallet.vault.cannotAccelerateMaxFee')}
          </Text>
        )}
      </View>
    );
  } else if (showReserveCannotBuildAnyPackage) {
    modalContent = (
      <View>
        {manualWalletSupplementRecoveryPrompt ?? (
          <>
            <Text className="text-base text-slate-600 pb-2 px-2">
              {reserveCannotBuildPackageText}
            </Text>
            <View className="px-2">{reserveFundsMissingAction}</View>
          </>
        )}
      </View>
    );
  } else if (step === 'confirm' && needsFeeInput && feeEstimates) {
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
      title={modalTitle}
      icon={activeModalIcon}
      onClose={
        step === 'coincontrol'
          ? handleCloseWalletSupplementCoinControl
          : onClose
      }
      onModalHide={handleModalHide}
      customButtons={
        step === 'coincontrol' ? (
          <View />
        ) : step === 'intro' ? (
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
