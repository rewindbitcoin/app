// Copyright (C) 2026 Jose-Luis Landabaso - https://rewindbitcoin.com
// Licensed under the GNU GPL v3 or later. See the LICENSE file for details.

import React, { useState, useRef, useMemo, useCallback } from 'react';
import { Modal, Button, ActivityIndicator } from '../../../../common/ui';
import { useTranslation } from 'react-i18next';
import { View, Text, Pressable } from 'react-native';
import type { Account } from '@bitcoinerlab/discovery';
import { FontAwesome5, MaterialCommunityIcons } from '@expo/vector-icons';
import { AdvancedTransactionOptionsModal } from '../../AdvancedTransactionOptions';
import type { AddressScriptSelection } from '../../AddressScriptPicker';
import FeeInput from '../../FeeInput';
import {
  FeeEstimates,
  MIN_FEE_RATE,
  pickFeeEstimate,
  computeMaxAllowedFeeRate
} from '../../../lib/fees';
import { getVaultActionFunding } from '../../../lib/vaultActionFunding';
import { formatBlocks } from '../../../lib/format';
import { formatBtc } from '../../../lib/btcRates';
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
import {
  getVaultableUtxos,
  withFrozenVaultUtxosForCoinControl
} from '../../../lib/utxoPolicy';
import { networkMapping } from '../../../lib/network';
import { computeOutput } from '../../../lib/vaultDescriptors';

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
   */
  p2aBumpPlan: P2ABumpPlan | 'loading' | 'error';
  /**
   * Child change selected before the user opens advanced options.
   *
   * It is used for fee sizing. It also becomes the final child change unless
   * the trigger user manually picks a custom change address.
   */
  initialChildChange?: { descriptor: string; index: number };
  /** True while refreshing reserve data behind an already loaded bump plan. */
  p2aBumpPlanRefreshing: boolean;
  /** Called with the selected parent-only or parent-plus-child package data. */
  onAction: (actionData: VaultActionData) => void;
  /** Syncs reserve discovery after a role-specific reserve scan failure. */
  onReserveSync?: () => void;
  /** Optional funding flow opener for missing or underfunded P2A reserves. */
  onReserveFundsMissing?: (targetFeeRate: number) => void;
  onWalletFundsMissing?: () => void;
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
 * - Rescue first-push explains that funds move to the emergency address and
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
  initialChildChange,
  p2aBumpPlanRefreshing,
  isVisible,
  onAction,
  onReserveSync,
  onReserveFundsMissing,
  onWalletFundsMissing,
  onClose,
  onModalHide,
  lockBlocks
}: PresignedVaultActionProps) => {
  const { locale, currency } = useLocalization();
  const vaultMode = useMemo<'LADDERED' | 'P2A_TRUC' | 'P2A_NON_TRUC'>(
    () => getVaultMode(vault),
    [vault]
  );
  const network = networkMapping[vault.networkId];
  const isLadderedVault = vaultMode === 'LADDERED';
  const { t } = useTranslation();
  const {
    feeEstimates: feeEstimatesRealTime,
    btcFiat: btcFiatRealTime,
    utxosData,
    historyData,
    vaults,
    tipStatus,
    vaultsStatuses,
    accounts,
    discoveryReady,
    getPreferredAccount
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
  const [isAdvancedOptionsVisible, setIsAdvancedOptionsVisible] =
    useState(false);
  // react-native-modal keeps animating after isVisible becomes false.
  // Keep action data alive until the hide animation is fully done.
  const [
    keepContentRenderedUntilModalHidden,
    setKeepContentRenderedUntilModalHidden
  ] = useState(isVisible);
  const isModalVisibleOrHiding =
    isVisible || keepContentRenderedUntilModalHidden;
  // User opt-in from the checkbox: when true, eligible hot-wallet UTXOs are
  // allowed into package building as a supplement to the reserve inputs.
  const [walletSupplementRequested, setWalletSupplementRequested] =
    useState(false);
  // undefined = no choice yet; null = invalid user input, never a default.
  const [feeRate, setFeeRate] = useState<number | null | undefined>();
  // If set, these are the vaultable wallet supplement UTXOs manually picked by
  // the user.
  const [pickedVaultableWalletUtxosData, setPickedVaultableWalletUtxosData] =
    useState<UtxosData | null>(null);
  // If set, the user chose where the CPFP child transaction should send change.
  const [
    customTriggerChangeAddressSelection,
    setCustomTriggerChangeAddressSelection
  ] = useState<AddressScriptSelection | null>(null);
  const walletSupplementCoinControl = pickedVaultableWalletUtxosData !== null;
  const fundingTransitionRef = useRef(false);
  const initialChildChangeOutput = useMemo(
    () =>
      initialChildChange
        ? computeOutput(
            {
              descriptor: initialChildChange.descriptor,
              index: initialChildChange.index
            },
            network
          )
        : undefined,
    [initialChildChange, network]
  );
  // Describes where child transaction change should go for sizing and broadcast.
  // finalChildChange usually equals initialChildChange. It differs only when the
  // trigger user manually picks a custom change address.
  const childChangePlan = useMemo(() => {
    if (customTriggerChangeAddressSelection) {
      const finalChildChange = {
        descriptor: customTriggerChangeAddressSelection.descriptor,
        index: customTriggerChangeAddressSelection.index,
        walletAccountToTrack:
          customTriggerChangeAddressSelection.descriptor.replace(
            /\/[01]\/\*/g,
            '/0/*'
          ) as Account
      };
      return {
        output: computeOutput(
          {
            descriptor: finalChildChange.descriptor,
            index: finalChildChange.index
          },
          network
        ),
        finalChildChange
      };
    }
    if (!initialChildChange || !initialChildChangeOutput) return undefined;
    return {
      output: initialChildChangeOutput,
      finalChildChange: initialChildChange
    };
  }, [
    customTriggerChangeAddressSelection,
    initialChildChange,
    initialChildChangeOutput,
    network
  ]);
  const childChangeOutput = childChangePlan?.output;
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
  const currentPickedWalletUtxos = useMemo(() => {
    if (pickedVaultableWalletUtxosData === null) return null;
    const available = new Map(
      vaultableWalletUtxosData.map(utxo => [
        `${utxo.tx.getId()}:${utxo.vout}`,
        utxo
      ])
    );
    return pickedVaultableWalletUtxosData.flatMap(utxo => {
      const current = available.get(`${utxo.tx.getId()}:${utxo.vout}`);
      return current ? [current] : [];
    });
  }, [pickedVaultableWalletUtxosData, vaultableWalletUtxosData]);
  const hasUnavailablePickedCoins =
    currentPickedWalletUtxos !== null &&
    currentPickedWalletUtxos.length !== pickedVaultableWalletUtxosData?.length;
  const vaultableWalletUtxosAvailability =
    role === 'TRIGGER' &&
    vaults &&
    vaultsStatuses &&
    tipStatus?.blockHeight !== undefined
      ? withFrozenVaultUtxosForCoinControl(
          vaultableWalletUtxosResult.utxosAvailability,
          vaults,
          vaultsStatuses,
          tipStatus.blockHeight,
          vault.networkId
        )
      : vaultableWalletUtxosResult.utxosAvailability;
  if (walletSupplementRequested && role !== 'TRIGGER')
    throw new Error('Wallet supplement is only allowed for trigger actions');
  const isP2ABumpPlanLoading = !isLadderedVault && p2aBumpPlan === 'loading';
  const isP2ABumpPlanError = !isLadderedVault && p2aBumpPlan === 'error';
  // Trigger fees stay editable before wallet funding is permitted. Rescue also
  // keeps its target if the user cancels before creating a temporary wallet.
  const hasUnfundedFeeTarget =
    (role === 'TRIGGER' || feeRate !== undefined) &&
    feeEstimates !== undefined &&
    computeMaxAllowedFeeRate(feeEstimates) >
      (presignedTxInfos?.[0]?.feeRate ?? MIN_FEE_RATE);
  const canPickP2APackageFee =
    !isLadderedVault &&
    !isPushedButUnconfirmed &&
    typeof p2aBumpPlan === 'object' &&
    (childChangePlan !== undefined ||
      (p2aBumpPlan.txosData.length === 0 && hasUnfundedFeeTarget)) &&
    (p2aBumpPlan.txosData.length > 0 ||
      (walletSupplementRequested && vaultableWalletUtxosData.length > 0) ||
      hasUnfundedFeeTarget) &&
    !(vaultMode === 'P2A_TRUC' && p2aBumpPlan.hasUnconfirmedUtxos);

  const handleModalWillShow = useCallback(() => {
    setKeepContentRenderedUntilModalHidden(true);
  }, []);

  if (!settings)
    throw new Error(
      'This component should only be started after settings has been retrieved from storage'
    );
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

  const hasUnconfirmedAncestor =
    role === 'RESCUE' &&
    !(
      vaultStatus.triggerTxBlockHeight !== undefined &&
      vaultStatus.triggerTxBlockHeight > 0
    );
  const selectedWalletUtxos = walletSupplementRequested
    ? (currentPickedWalletUtxos ?? vaultableWalletUtxosData)
    : undefined;
  // Readiness/replacement searches do not depend on slider position.
  const readiness = useMemo(() => {
    if (
      !isModalVisibleOrHiding ||
      !presignedTxInfos ||
      isP2ABumpPlanLoading ||
      isP2ABumpPlanError ||
      !feeEstimates ||
      !historyData ||
      (isPushedButUnconfirmed && !pushedTxHex)
    )
      return {
        blockerReason: undefined,
        blockerReasonAssumingAutoWalletSupplement: undefined,
        minimumSelectableFeeRate: null
      };
    const sharedArgs = {
      vaultMode,
      feeEstimates,
      presignedTxInfos,
      historyData,
      hasUnconfirmedAncestor,
      ...(pushedTxHex ? { pushedTxHex } : {}),
      ...(pushedTxHex && childTxHex ? { pushedChildTxHex: childTxHex } : {}),
      ...(typeof p2aBumpPlan === 'object' ? { p2aBumpPlan } : {}),
      ...(childChangeOutput ? { childChangeOutput } : {})
    };
    const current = getVaultActionBlocker({
      ...sharedArgs,
      ...(selectedWalletUtxos
        ? { vaultableWalletUtxosData: selectedWalletUtxos }
        : {}),
      coinControl: walletSupplementCoinControl
    });
    const automatic = walletSupplementCoinControl
      ? getVaultActionBlocker({
          ...sharedArgs,
          ...(walletSupplementRequested ? { vaultableWalletUtxosData } : {}),
          coinControl: false
        })
      : current;
    return {
      blockerReason: current.reason,
      blockerReasonAssumingAutoWalletSupplement: automatic.reason,
      minimumSelectableFeeRate: current.minimumSelectableFeeRate
    };
  }, [
    isModalVisibleOrHiding,
    presignedTxInfos,
    isP2ABumpPlanLoading,
    isP2ABumpPlanError,
    feeEstimates,
    historyData,
    isPushedButUnconfirmed,
    pushedTxHex,
    vaultMode,
    hasUnconfirmedAncestor,
    childTxHex,
    p2aBumpPlan,
    childChangeOutput,
    selectedWalletUtxos,
    walletSupplementCoinControl,
    walletSupplementRequested,
    vaultableWalletUtxosData
  ]);

  /**
   * Current trigger/rescue readiness and concrete action data for the user's
   * current wallet-supplement choice.
   *
   * `getVaultActionBlocker(...)` explains whether the flow is blocked
   * and which fee range can be offered. `buildVaultActionDataForFeeRate(...)`
   * then proves a concrete fee can build the tx/package the user would submit.
   * Keeping both results together makes that coupling explicit for the UI.
   */
  const {
    blockerReason,
    minimumSelectableFeeRate,
    needsFeeInput,
    initialFeeRate,
    selectedFeeRate,
    vaultActionData,
    vaultActionDataAssumingAutoWalletSupplement,
    canBuildRecommended,
    canBuildRecommendedWithAutomaticCoins,
    canBuildSelectedAfterConfirmation
  } = useMemo(() => {
    // UX: unlocks intro-to-confirm or shows why trigger/rescue is unavailable; undefined means the block check has not run and null means unblocked.
    const {
      blockerReason,
      blockerReasonAssumingAutoWalletSupplement,
      minimumSelectableFeeRate
    } = readiness;
    // UX: decides whether the confirm step shows FeeInput; false means fixed-fee/no-input or unknown.
    let needsFeeInput = false;
    // UX: selects the first recommended fee shown to the user; null means no default can be chosen yet.
    // "Preferred" is normally the reasonable confirmation target above (about 2
    // hours by default). The extra Math.max floor below protects acceleration
    // and package cases where the action must use a higher minimum fee to
    // improve the existing mempool state or build a valid package.
    let preferredInitialFeeRate: number | null = null;
    // UX: checks whether the recommended default fee can be offered; null means it is absent or unbuildable.
    let vaultActionDataAtPreferredInitialFeeRate: VaultActionData | null = null;
    let canBuildRecommendedWithAutomaticCoins = false;
    // UX: tracks the fee currently driving the preview/action button; null means there is no usable fee yet.
    let selectedFeeRate: number | null = null;
    // UX: enables the final action button for the current supplement choice; null means it cannot build now.
    let vaultActionData: VaultActionData | null = null;
    // UX: same as above, but assuming wallet supplement is opted in and auto coin selection is used for supplement UTXOs.
    let vaultActionDataAssumingAutoWalletSupplement: VaultActionData | null =
      null;
    needsFeeInput = minimumSelectableFeeRate !== null;

    // Start at the reasonable confirmation target, respecting the minimum
    // required for this action (including replacement rules).
    if (blockerReason === null) {
      if (minimumSelectableFeeRate === null && !canPickP2APackageFee)
        preferredInitialFeeRate = presignedTxInfos?.[0]?.feeRate ?? null;
      else if (feeRateForReasonableConfirmationTime !== null)
        preferredInitialFeeRate = Math.max(
          minimumSelectableFeeRate ?? MIN_FEE_RATE,
          feeRateForReasonableConfirmationTime
        );
    }

    const sharedActionBuildArgs =
      isModalVisibleOrHiding && presignedTxInfos
        ? {
            vaultMode,
            hasUnconfirmedAncestor,
            ...(pushedTxHex ? { pushedTxHex } : {}),
            presignedTxInfos,
            ...(typeof p2aBumpPlan === 'object' ? { p2aBumpPlan } : {}),
            ...(childChangePlan ? { childChangePlan } : {})
          }
        : null;
    const currentWalletSupplementArgs = walletSupplementRequested
      ? {
          vaultableWalletUtxosData:
            currentPickedWalletUtxos ?? vaultableWalletUtxosData
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
    if (
      walletSupplementRequested &&
      walletSupplementCoinControl &&
      preferredInitialFeeRate !== null &&
      sharedActionBuildArgs !== null &&
      blockerReasonAssumingAutoWalletSupplement === null
    ) {
      canBuildRecommendedWithAutomaticCoins =
        buildVaultActionDataForFeeRate({
          ...sharedActionBuildArgs,
          selectedFeeRate: preferredInitialFeeRate,
          vaultableWalletUtxosData,
          coinControl: false
        }) !== null;
    }

    // Show the preferred target even when it needs funding. Do not silently
    // replace it with the cheapest buildable fee; affordability gates submission.
    const initialFeeRate = preferredInitialFeeRate;

    selectedFeeRate =
      feeRate !== undefined
        ? feeRate
        : (initialFeeRate ??
          (canPickP2APackageFee ||
          blockerReason === 'noP2AReserve' ||
          blockerReason === 'p2aReserveCannotFundMinimumPackage' ||
          blockerReason === 'noReplacementPath'
            ? (feeRateForReasonableConfirmationTime ?? MIN_FEE_RATE)
            : null));
    if (
      selectedFeeRate !== null &&
      (!Number.isFinite(selectedFeeRate) ||
        (minimumSelectableFeeRate !== null &&
          selectedFeeRate < minimumSelectableFeeRate) ||
        (needsFeeInput &&
          feeEstimates &&
          selectedFeeRate > computeMaxAllowedFeeRate(feeEstimates)))
    )
      selectedFeeRate = null;
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
      if (
        hasUnavailablePickedCoins &&
        Array.isArray(vaultActionData?.walletSupplementUtxosData)
      )
        vaultActionData = null;
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

    // Estimate only when pending normal-wallet outputs could resolve a shortfall.
    // These are not the frozen-vault rows added solely for the coin picker.
    const canBuildSelectedAfterConfirmation =
      vaultActionDataAssumingAutoWalletSupplement === null &&
      selectedFeeRate !== null &&
      sharedActionBuildArgs !== null &&
      childChangePlan !== undefined &&
      typeof p2aBumpPlan === 'object' &&
      vaultableWalletUtxosResult.utxosAvailability.some(
        utxo => utxo.status === 'temporarilyUnavailable'
      ) &&
      buildVaultActionDataForFeeRate({
        ...sharedActionBuildArgs,
        selectedFeeRate,
        vaultableWalletUtxosData:
          vaultableWalletUtxosResult.utxosAvailability.map(
            ({ utxoData }) => utxoData
          ),
        coinControl: false
      }) !== null;

    return {
      blockerReason,
      minimumSelectableFeeRate,
      needsFeeInput,
      initialFeeRate,
      selectedFeeRate,
      vaultActionData,
      vaultActionDataAssumingAutoWalletSupplement,
      canBuildRecommendedWithAutomaticCoins,
      canBuildSelectedAfterConfirmation,
      canBuildRecommended:
        vaultActionDataAtPreferredInitialFeeRate !== null &&
        (needsFeeInput ||
          (feeRateForReasonableConfirmationTime !== null &&
            vaultActionDataAtPreferredInitialFeeRate.actionFeeRate >=
              feeRateForReasonableConfirmationTime))
    };
  }, [
    currentPickedWalletUtxos,
    vaultableWalletUtxosData,
    vaultableWalletUtxosResult.utxosAvailability,
    walletSupplementCoinControl,
    isModalVisibleOrHiding,
    presignedTxInfos,
    feeEstimates,
    feeRateForReasonableConfirmationTime,
    feeRate,
    vaultMode,
    walletSupplementRequested,
    pushedTxHex,
    p2aBumpPlan,
    childChangePlan,
    canPickP2APackageFee,
    readiness,
    hasUnconfirmedAncestor,
    hasUnavailablePickedCoins
  ]);

  const cannotAccelerateMaxFee = blockerReason === 'replacementFeeAboveMaximum';

  const fee = vaultActionData ? vaultActionData.actionFee : null;

  const handleModalHide = useCallback(() => {
    setKeepContentRenderedUntilModalHidden(false);
    setIsAdvancedOptionsVisible(false);
    if (!fundingTransitionRef.current) {
      setStep('intro');
      setFeeRate(undefined);
      setWalletSupplementRequested(false);
      setPickedVaultableWalletUtxosData(null);
      setCustomTriggerChangeAddressSelection(null);
    }
    fundingTransitionRef.current = false;
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
  let reserveUnconfirmedText: string;
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
    reserveUnconfirmedText = t(
      'wallet.vault.triggerUnfreeze.reserveUnconfirmed'
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
    reserveUnconfirmedText = t('wallet.vault.rescue.reserveUnconfirmed');
    reserveScanErrorText = t('wallet.vault.rescue.reserveScanError');
    introText = isPushedButUnconfirmed
      ? t('wallet.vault.rescue.introAccelerate')
      : t('wallet.vault.rescue.intro', { rescueAddress: vault.coldAddress });
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
  const initialTriggerChangeAccount =
    role === 'TRIGGER' &&
    !isLadderedVault &&
    isModalVisibleOrHiding &&
    discoveryReady &&
    accounts
      ? getPreferredAccount()
      : undefined;
  const canChooseCustomTriggerChangeAddress =
    role === 'TRIGGER' &&
    !isLadderedVault &&
    initialTriggerChangeAccount !== undefined &&
    typeof p2aBumpPlan === 'object' &&
    (p2aBumpPlan.txosData.length > 0 || walletSupplementRequested) &&
    childChangeOutput !== undefined;
  const showTriggerChangeAddressOption =
    initialTriggerChangeAccount !== undefined &&
    (canChooseCustomTriggerChangeAddress ||
      customTriggerChangeAddressSelection !== null);
  const txUsesWalletSupplement =
    vaultActionData !== null &&
    Array.isArray(vaultActionData.walletSupplementUtxosData);
  if (txUsesWalletSupplement && !walletSupplementRequested)
    throw new Error('Wallet supplement used without user request');
  const manualWalletSupplementNeedsRecovery =
    walletSupplementRequested &&
    walletSupplementCoinControl &&
    vaultActionData === null &&
    vaultActionDataAssumingAutoWalletSupplement !== null;
  const funding = getVaultActionFunding({
    role,
    selectedFeeRate:
      blockerReason === null ||
      blockerReason === 'noP2AReserve' ||
      blockerReason === 'p2aReserveCannotFundMinimumPackage' ||
      blockerReason === 'noReplacementPath'
        ? selectedFeeRate
        : null,
    recommendedFeeRate:
      feeRateForReasonableConfirmationTime === null
        ? null
        : Math.max(
            minimumSelectableFeeRate ?? MIN_FEE_RATE,
            feeRateForReasonableConfirmationTime
          ),
    canBuildSelected: vaultActionData !== null,
    canBuildRecommended,
    canBuildRecommendedWithAutomaticCoins,
    manualSelectionNeedsRecovery: manualWalletSupplementNeedsRecovery,
    hasUsableWalletFunds: canOfferWalletSupplement,
    canBuildSelectedAfterConfirmation,
    walletSupplementRequested
  });
  const showWalletSupplementOption =
    role === 'TRIGGER' &&
    !isLadderedVault &&
    (funding.action === 'wallet' || walletSupplementRequested);

  const handleWalletSupplementEnabledChange = useCallback(
    (enabled: boolean) => {
      if (enabled) setWalletSupplementRequested(true);
      else {
        setWalletSupplementRequested(false);
        setPickedVaultableWalletUtxosData(null);
      }
    },
    []
  );
  const handleOpenAdvancedOptions = useCallback(() => {
    setIsAdvancedOptionsVisible(true);
  }, []);
  const handleCloseAdvancedOptions = useCallback(() => {
    setIsAdvancedOptionsVisible(false);
  }, []);
  const handleUseAutoWalletSupplement = useCallback(() => {
    setPickedVaultableWalletUtxosData(null);
  }, []);
  const handleConfirmWalletSupplementCoinControl = useCallback(
    (pickedUtxosData: UtxosData) => {
      setPickedVaultableWalletUtxosData(pickedUtxosData);
      setIsAdvancedOptionsVisible(false);
    },
    []
  );
  const handleConfirmTriggerChangeAddress = useCallback(
    (selection: AddressScriptSelection) => {
      setCustomTriggerChangeAddressSelection(selection);
      setIsAdvancedOptionsVisible(false);
    },
    []
  );
  const handleClearTriggerChangeAddress = useCallback(() => {
    setCustomTriggerChangeAddressSelection(null);
  }, []);
  const handleUseDefaults = useCallback(() => {
    setWalletSupplementRequested(false);
    setPickedVaultableWalletUtxosData(null);
    setCustomTriggerChangeAddressSelection(null);
  }, []);

  const hasAdvancedTransactionOptions =
    customTriggerChangeAddressSelection !== null || walletSupplementCoinControl;
  const showAdvancedOptionsCard =
    showTriggerChangeAddressOption ||
    walletSupplementRequested ||
    hasAdvancedTransactionOptions;
  const advancedOptionStatusItems = [
    ...(showTriggerChangeAddressOption
      ? [
          {
            key: 'change',
            label: customTriggerChangeAddressSelection
              ? t('coinControl.changeCustomStatus')
              : t('coinControl.changeAutomaticStatus'),
            active: customTriggerChangeAddressSelection !== null
          }
        ]
      : []),
    ...(walletSupplementRequested
      ? [
          {
            key: 'coins',
            label: walletSupplementCoinControl
              ? t('coinControl.coinsManualStatus')
              : t('coinControl.coinsAutomaticStatus'),
            active: walletSupplementCoinControl
          }
        ]
      : [])
  ];
  const advancedOptionsCard = showAdvancedOptionsCard ? (
    <Pressable
      onPress={handleOpenAdvancedOptions}
      className={`mx-2 mt-4 rounded-xl border px-3 py-2.5 ${hasAdvancedTransactionOptions ? 'border-primary bg-primary-light' : 'border-slate-200 bg-white'}`}
    >
      <View className="flex-row items-center gap-2">
        <FontAwesome5
          name="sliders-h"
          size={13}
          className={
            hasAdvancedTransactionOptions ? 'text-primary' : 'text-slate-500'
          }
        />
        <Text className="text-sm font-semibold text-slate-900">
          {t('coinControl.advanced')}
        </Text>
        <View className="flex-1 flex-row flex-wrap justify-end gap-1.5">
          {advancedOptionStatusItems.map(item => (
            <View
              key={item.key}
              className={`rounded-full border px-2 py-0.5 ${item.active ? 'border-primary bg-white' : 'border-slate-200 bg-slate-50'}`}
            >
              <Text
                className={`text-xs ${item.active ? 'font-medium text-primary-dark' : 'text-slate-600'}`}
              >
                {item.label}
              </Text>
            </View>
          ))}
        </View>
        <MaterialCommunityIcons
          name="chevron-right"
          size={20}
          className="text-slate-400"
        />
      </View>
    </Pressable>
  ) : null;
  // Lets the user cover a short fee reserve with normal wallet funds instead
  // of stopping the unfreeze until more reserve funds arrive.
  const walletSupplementControl = showWalletSupplementOption ? (
    <Pressable
      onPress={() =>
        handleWalletSupplementEnabledChange(!walletSupplementRequested)
      }
      className={`mx-2 mt-5 rounded-2xl border p-4 ${walletSupplementRequested ? 'border-primary bg-primary-light' : 'border-slate-200 bg-white'}`}
    >
      <View className="flex-row items-start gap-3">
        <MaterialCommunityIcons
          name={
            walletSupplementRequested
              ? 'checkbox-marked-outline'
              : 'checkbox-blank-outline'
          }
          size={24}
          className="text-primary mt-0.5"
        />
        <View className="flex-1 gap-1">
          <View className="flex-row flex-wrap items-center justify-between gap-2">
            <Text className="text-base font-medium text-slate-900">
              {t('coinControl.walletFunds')}
            </Text>
            <Text className="text-xs font-medium text-slate-500">
              {walletSupplementRequested
                ? t('coinControl.walletFundsEnabled')
                : t('coinControl.walletFundsOff')}
            </Text>
          </View>
          <Text className="text-sm leading-5 text-slate-600">
            {t('wallet.vault.triggerUnfreeze.walletSupplementCheckbox')}
          </Text>
        </View>
      </View>
    </Pressable>
  ) : null;
  const manualWalletSupplementNotice =
    funding.action === 'coins' ? (
      <Text className="text-base text-notification pt-4 px-2">
        {funding.notice === 'belowRecommended'
          ? t(
              'wallet.vault.triggerUnfreeze.pickedWalletSupplementBelowRecommended',
              {
                advancedLabel: t('coinControl.advanced')
              }
            )
          : t(
              'wallet.vault.triggerUnfreeze.pickedWalletSupplementUtxosInsufficient',
              {
                advancedLabel: t('coinControl.advanced')
              }
            )}
      </Text>
    ) : null;
  const handleFunding = () => {
    if (funding.targetFeeRate === null) return;
    fundingTransitionRef.current = true;
    setFeeRate(funding.targetFeeRate);
    if (role === 'TRIGGER') onWalletFundsMissing?.();
    else onReserveFundsMissing?.(funding.targetFeeRate);
  };
  const reserveFundsMissingButton = onReserveFundsMissing ? (
    <View className="items-center pt-4">
      <Button mode="secondary-alert" onPress={handleFunding}>
        {t('wallet.vault.addReserveFundsButton')}
      </Button>
    </View>
  ) : null;
  // The notice, funding amount, and funding flow must all use the same target.
  const walletSupplementParentTxInfo = presignedTxInfos?.[0];
  const walletSupplement =
    role === 'TRIGGER' &&
    funding.action === 'receive' &&
    funding.targetFeeRate !== null &&
    typeof p2aBumpPlan === 'object' &&
    initialChildChangeOutput &&
    childChangeOutput &&
    walletSupplementParentTxInfo &&
    historyData
      ? getAdditionalOutputValue({
          p2aBumpPlan,
          // The additional wallet input will have the same output type as wallet
          // change, even when the child change itself is custom.
          additionalOutput: initialChildChangeOutput,
          childChangeOutput,
          parentTxInfo: walletSupplementParentTxInfo,
          targetPackageFeeRate: funding.targetFeeRate,
          vaultableWalletUtxosData,
          ...(pushedTxHex && childTxHex
            ? { pushedChildTxHex: childTxHex }
            : {}),
          historyData
        })
      : undefined;
  const formattedWalletSupplement =
    walletSupplement === undefined || walletSupplement <= 0
      ? undefined
      : formatBtc({
          amount: walletSupplement,
          subUnit: settings.SUB_UNIT,
          btcFiat,
          currency,
          locale
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
        {walletSupplementHint}
        {funding.action === 'receive' && onWalletFundsMissing ? (
          <View className="items-center pt-4">
            <Button mode="secondary" onPress={handleFunding}>
              {t('wallet.vault.funding.addButton')}
            </Button>
          </View>
        ) : null}
      </>
    ) : (
      reserveFundsMissingButton
    );
  const reserveFundsMissingPromptText =
    funding.notice === 'belowRecommended'
      ? t('wallet.vault.funding.belowRecommended')
      : funding.notice === 'insufficient'
        ? t('wallet.vault.funding.insufficient')
        : null;
  const fundingActionText =
    funding.action && funding.action !== 'coins'
      ? {
          wallet: t('wallet.vault.funding.wallet', {
            feeRate: funding.targetFeeRate,
            walletFundsLabel: t('coinControl.walletFunds')
          }),
          receive: t('wallet.vault.funding.receive', {
            feeRate: funding.targetFeeRate
          }),
          reserve: t('wallet.vault.funding.reserve', {
            feeRate: funding.targetFeeRate
          }),
          wait: t('wallet.vault.funding.wait')
        }[funding.action]
      : null;
  const reserveFundsMissingPrompt =
    !isLadderedVault && reserveFundsMissingPromptText
      ? (manualWalletSupplementNotice ?? (
          <View className="pt-4 px-2">
            <Text className="text-base text-notification">
              {reserveFundsMissingPromptText}
            </Text>
            {fundingActionText ? (
              <Text className="text-base text-slate-600 pt-2">
                {fundingActionText}
              </Text>
            ) : null}
            {reserveFundsMissingAction}
          </View>
        ))
      : manualWalletSupplementNotice;
  const postActionExplanation = (
    <Text className="text-base text-slate-600 pt-4 px-2">
      {postActionExplanationText}
    </Text>
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
  // initialFeeRate !== null means we have an initial target to review; it does
  // not imply that the current funds cover it.
  const canLeaveIntro =
    isP2ABumpPlanError || hasBlockingState || initialFeeRate !== null;

  const canShowActionButton = blockerReason === null;
  const showFeeInput = needsFeeInput || canPickP2APackageFee;
  const feeInputMin =
    minimumSelectableFeeRate ??
    Math.max(MIN_FEE_RATE, presignedTxInfos?.[0]?.feeRate ?? MIN_FEE_RATE);
  const feeInputInitialValue = Math.max(
    feeInputMin,
    selectedFeeRate ??
      initialFeeRate ??
      feeRateForReasonableConfirmationTime ??
      feeInputMin
  );

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
        {onReserveSync ? (
          <View className="items-center pt-4">
            <Button mode="secondary-alert" onPress={onReserveSync}>
              {t('tryAgain')}
            </Button>
          </View>
        ) : null}
      </View>
    );
  } else if (isConfirmationReadinessLoading) {
    modalContent = <ActivityIndicator />;
  } else if (blockerReason === 'childChangeUnavailable') {
    modalContent = (
      <View className="gap-4 px-2">
        <Text>{t('wallet.vault.funding.changeUnavailable')}</Text>
        <Button onPress={onReserveSync ?? onClose}>{t('tryAgain')}</Button>
      </View>
    );
  } else if (
    blockerReason === 'p2aReserveUnconfirmed' ||
    blockerReason === 'p2aAncestorUnconfirmed'
  ) {
    modalContent = (
      <View>
        <Text className="text-base text-slate-600 pb-2 px-2">
          {blockerReason === 'p2aAncestorUnconfirmed'
            ? t('wallet.vault.funding.triggerUnconfirmed')
            : reserveUnconfirmedText}
        </Text>
      </View>
    );
  } else if (cannotAccelerateMaxFee) {
    modalContent = (
      <View>
        {manualWalletSupplementNotice ?? (
          <Text className="text-base text-slate-600 pb-2 px-2">
            {t('wallet.vault.cannotAccelerateMaxFee')}
          </Text>
        )}
      </View>
    );
  } else if (step === 'confirm' && showFeeInput && feeEstimates) {
    modalContent = (
      <View>
        <Text className="text-base text-slate-600 pb-4 px-2">
          {feeSelectorExplanationText}
        </Text>
        <View className="bg-slate-100 p-2 rounded-xl">
          <FeeInput
            min={feeInputMin}
            btcFiat={btcFiat}
            feeEstimates={feeEstimates}
            initialValue={feeInputInitialValue}
            fee={fee}
            isOptimal={
              fee !== null &&
              selectedFeeRate === feeRateForReasonableConfirmationTime
            }
            label={confirmationSpeedLabel}
            onValueChange={setFeeRate}
          />
        </View>
        {confirmationExplanation}
      </View>
    );
  } else if (
    showReserveCannotBuildAnyPackage ||
    blockerReason === 'noP2AReserve'
  ) {
    modalContent = confirmationExplanation;
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
      onModalWillShow={handleModalWillShow}
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
      {step === 'confirm' ? (
        <>
          {walletSupplementControl}
          {advancedOptionsCard}
        </>
      ) : null}
      <AdvancedTransactionOptionsModal
        isVisible={isVisible && isAdvancedOptionsVisible}
        btcFiat={btcFiat}
        onClose={handleCloseAdvancedOptions}
        onUseDefaults={handleUseDefaults}
        {...(walletSupplementRequested
          ? {
              utxosAvailability: vaultableWalletUtxosAvailability,
              pickedUtxosData: pickedVaultableWalletUtxosData,
              onClearCoinSelection: handleUseAutoWalletSupplement,
              onConfirmCoinSelection: handleConfirmWalletSupplementCoinControl
            }
          : {})}
        {...(showTriggerChangeAddressOption && initialTriggerChangeAccount
          ? {
              changeAddressSelection: customTriggerChangeAddressSelection,
              initialChangeAccount: initialTriggerChangeAccount,
              onClearChangeAddress: handleClearTriggerChangeAddress,
              onConfirmChangeAddress: handleConfirmTriggerChangeAddress
            }
          : {})}
      />
    </Modal>
  );
};

export default PresignedVaultAction;
