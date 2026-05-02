// Copyright (C) 2026 Jose-Luis Landabaso - https://rewindbitcoin.com
// Licensed under the GNU GPL v3 or later. See the LICENSE file for details.

/**
 * @deprecated Kept temporarily for comparison with VaultAction.tsx.
 * TODO: Remove this file after the shared VaultAction modal is fully validated.
 */

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
  getLadderedTriggerSortedTxs,
  getP2ATriggerInfo,
  type P2ABumpPlan,
  type PresignedTxInfo,
  type VaultActionTxData
} from '../../../lib/vaultActionTx';

type TriggerProps = {
  vault: Vault;
  vaultStatus: VaultStatus | undefined;
  /**
   * P2A trigger acceleration plan.
   * - `undefined`: the real change-output-backed plan is still being prepared.
   * - empty `utxosData`: preparation finished with no reserve UTXOs.
   * - non-empty `utxosData`: acceleration can use these reserve UTXOs.
   */
  p2aBumpPlan: P2ABumpPlan | undefined;
  onTrigger: (triggerData: VaultActionTxData) => void;
  lockBlocks: number;
  isVisible: boolean;
  onClose: () => void;
};

const Trigger = ({
  vault,
  vaultStatus,
  p2aBumpPlan,
  isVisible,
  lockBlocks,
  onTrigger,
  onClose
}: TriggerProps) => {
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
  const p2aTriggerInfo = useMemo<PresignedTxInfo | null>(
    () => (isLadderedVault ? null : getP2ATriggerInfo(vault)),
    [isLadderedVault, vault]
  );
  const presignedTxInfos = useMemo<PresignedTxInfo[] | null>(
    () =>
      isLadderedVault
        ? getLadderedTriggerSortedTxs(vault)
        : p2aTriggerInfo
          ? [p2aTriggerInfo]
          : null,
    [isLadderedVault, vault, p2aTriggerInfo]
  );
  const isTriggerPushedButUnconfirmed =
    vaultStatus?.triggerTxBlockHeight !== undefined
      ? vaultStatus.triggerTxBlockHeight === 0
      : !!vaultStatus?.triggerPushTime;
  const triggerCpfpTxHex = vaultStatus?.triggerCpfpTxHex;
  const pushedTxHex =
    isTriggerPushedButUnconfirmed && triggerTxHex ? triggerTxHex : undefined;
  const isP2ABumpPlanLoading = !isLadderedVault && p2aBumpPlan === undefined;
  const actionAvailability = useMemo(() => {
    if (!isVisible || !feeEstimates || !presignedTxInfos) return null;
    if (isP2ABumpPlanLoading) return null;
    if (isTriggerPushedButUnconfirmed && !pushedTxHex) return null;
    return getActionAvailability({
      vaultMode,
      feeEstimates,
      ...(pushedTxHex ? { pushedTxHex } : {}),
      ...(pushedTxHex && triggerCpfpTxHex
        ? { pushedChildTxHex: triggerCpfpTxHex }
        : {}),
      presignedTxInfos,
      ...(p2aBumpPlan ? { p2aBumpPlan } : {})
    });
  }, [
    isVisible,
    feeEstimates,
    presignedTxInfos,
    isP2ABumpPlanLoading,
    isTriggerPushedButUnconfirmed,
    pushedTxHex,
    vaultMode,
    triggerCpfpTxHex,
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
    // While hidden, return inert render-time values instead of trigger data.
    if (!isVisible || !feeEstimates || !actionAvailability) return null;
    if (actionAvailability.result !== null) return null;
    if (actionAvailability.minimumSelectableFeeRate === null)
      return presignedTxInfos?.[0]?.feeRate ?? null;

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
    feeEstimates,
    actionAvailability,
    presignedTxInfos,
    settings.INITIAL_CONFIRMATION_TIME
  ]);

  const [feeRate, setFeeRate] = useState<number | null>(null);

  const getTxDataForFeeRate = useCallback(
    (selectedFeeRate: number): VaultActionTxData | null => {
      // This modal stays mounted so Modal can animate across isVisible changes.
      // While hidden or unavailable, return inert render-time values instead of trigger data.
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

  const handleTrigger = useCallback(() => {
    if (!txData) throw new Error('Cannot unfreeze non-existing selected tx');
    onTrigger(txData);
  }, [onTrigger, txData]);

  const timeLockTime = formatBlocks(lockBlocks, t, locale, true);

  const showInsufficientReserveFunds =
    availabilityResult === 'insufficientP2AReserve' ||
    (!isLadderedVault && availabilityResult === 'noReplacementPath');
  const additionalExplanation = (
    <Text className="text-base text-slate-600 pt-4 px-2">
      {t('wallet.vault.triggerUnfreeze.additionalExplanation', {
        timeLockTime
      })}
    </Text>
  );

  let modalContent: React.ReactNode;
  if (isP2ABumpPlanLoading || !feeEstimates || !actionAvailability) {
    modalContent = <ActivityIndicator />;
  } else if (availabilityResult === 'noP2AReserve') {
    modalContent = (
      <View>
        <Text className="text-base text-slate-600 pb-2 px-2">
          {t('wallet.vault.triggerUnfreeze.noReserveAvailableYet')}
        </Text>
      </View>
    );
  } else if (availabilityResult === 'p2aReserveUnconfirmed') {
    modalContent = (
      <View>
        <Text className="text-base text-slate-600 pb-2 px-2">
          {t('wallet.vault.triggerUnfreeze.reserveUnconfirmed')}
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
          {t('wallet.vault.triggerUnfreeze.insufficientReserveFunds')}
        </Text>
      </View>
    );
  } else if (step === 'intro') {
    modalContent = (
      <View>
        <Text className="text-base text-slate-600 pb-2 px-2">
          {isTriggerPushedButUnconfirmed
            ? t('wallet.vault.triggerUnfreeze.introAccelerate')
            : t('wallet.vault.triggerUnfreeze.intro', { timeLockTime })}
        </Text>
      </View>
    );
  } else if (step === 'confirm' && needsFeePicker) {
    modalContent = (
      <View>
        <Text className="text-base text-slate-600 pb-4 px-2">
          {t('wallet.vault.triggerUnfreeze.feeSelectorExplanation')}
        </Text>
        <View className="bg-slate-100 p-2 rounded-xl">
          {initialFeeRate !== null && minimumSelectableFeeRate !== null ? (
            <FeeInput
              min={minimumSelectableFeeRate}
              btcFiat={btcFiat}
              feeEstimates={feeEstimates}
              initialValue={initialFeeRate}
              fee={fee}
              label={t('wallet.vault.triggerUnfreeze.confirmationSpeedLabel')}
              onValueChange={setFeeRate}
            />
          ) : (
            <ActivityIndicator />
          )}
        </View>
        {additionalExplanation}
      </View>
    );
  } else if (step === 'confirm') {
    modalContent = (
      <View>
        <Text className="text-base text-slate-600 pb-4 px-2">
          {t('wallet.vault.triggerUnfreeze.parentOnlyConfirmation')}
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
      title={t('wallet.vault.triggerUnfreezeButton')}
      icon={{
        family: 'MaterialCommunityIcons',
        name: 'snowflake-melt'
      }}
      onClose={onClose}
      customButtons={
        step === 'intro' ? (
          <View className="items-center gap-6 gap-y-4 flex-row flex-wrap justify-center pb-4">
            <Button mode="secondary" onPress={onClose}>
              {t('cancelButton')}
            </Button>
            {canOpenConfirmStep && (
              <Button onPress={() => setStep('confirm')}>
                {isTriggerPushedButUnconfirmed
                  ? t('accelerateButton')
                  : t('continueButton')}
              </Button>
            )}
          </View>
        ) : step === 'confirm' ? (
          <View className="items-center gap-6 gap-y-4 flex-row flex-wrap justify-center pb-4">
            <Button mode="secondary" onPress={onClose}>
              {t('cancelButton')}
            </Button>
            <Button onPress={handleTrigger} disabled={!txData}>
              {t('wallet.vault.triggerUnfreezeButton')}
            </Button>
          </View>
        ) : undefined
      }
    >
      {modalContent}
    </Modal>
  );
};

export default Trigger;
