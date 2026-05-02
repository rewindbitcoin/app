// Copyright (C) 2026 Jose-Luis Landabaso - https://rewindbitcoin.com
// Licensed under the GNU GPL v3 or later. See the LICENSE file for details.

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Modal, Button, ActivityIndicator } from '../../../../common/ui';
import { useTranslation } from 'react-i18next';
import { View, Text } from 'react-native';
import FeeInput from '../../FeeInput';
import { FeeEstimates, pickFeeEstimate } from '../../../lib/fees';
import { useSettings } from '../../../hooks/useSettings';
import {
  type Vault,
  type VaultStatus,
  getVaultMode
} from '../../../lib/vaults';
import { useWallet } from '../../../hooks/useWallet';
import useFirstDefinedValue from '~/common/hooks/useFirstDefinedValue';
import {
  buildTxDataForFeeRate,
  getActionAvailability,
  getLadderedRescueSortedTxs,
  getP2ARescueInfo,
  type P2ABumpPlan,
  type PresignedTxInfo,
  type VaultActionTxData
} from '../../../lib/vaultActionTx';

type RescueProps = {
  vault: Vault;
  vaultStatus: VaultStatus | undefined;
  onRescue: (rescueData: VaultActionTxData) => void;
  isVisible: boolean;
  /** P2A acceleration plan. Undefined until rescue top-up funding is supported. */
  p2aBumpPlan: P2ABumpPlan | undefined;
  onClose: () => void;
};

const Rescue = ({
  vault,
  vaultStatus,
  isVisible,
  p2aBumpPlan,
  onRescue,
  onClose
}: RescueProps) => {
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
  const presignedTxInfos = useMemo<PresignedTxInfo[] | null>(
    () =>
      !triggerTxHex
        ? null
        : isLadderedVault
          ? getLadderedRescueSortedTxs(vault, triggerTxHex)
          : [getP2ARescueInfo(vault, triggerTxHex)],
    [isLadderedVault, vault, triggerTxHex]
  );
  const isRescuePushedButUnconfirmed =
    vaultStatus?.panicTxBlockHeight !== undefined
      ? vaultStatus.panicTxBlockHeight === 0
      : !!vaultStatus?.panicPushTime;
  const panicCpfpTxHex = vaultStatus?.panicCpfpTxHex;
  const pushedTxHex =
    isRescuePushedButUnconfirmed && vaultStatus?.panicTxHex
      ? vaultStatus.panicTxHex
      : undefined;
  const p2aBumpPlanHasSpendableUtxos =
    !isLadderedVault &&
    !!p2aBumpPlan &&
    p2aBumpPlan.utxosData.length > 0 &&
    !(vaultMode === 'P2A_TRUC' && p2aBumpPlan.hasUnconfirmedUtxos);
  const needsFeeEstimatesForAvailability =
    isLadderedVault || p2aBumpPlanHasSpendableUtxos;
  const actionAvailability = useMemo(() => {
    if (!isVisible || !presignedTxInfos) return null;
    if (needsFeeEstimatesForAvailability && !feeEstimates) return null;
    if (isRescuePushedButUnconfirmed && !pushedTxHex) return null;
    return getActionAvailability({
      vaultMode,
      ...(feeEstimates ? { feeEstimates } : {}),
      ...(pushedTxHex ? { pushedTxHex } : {}),
      ...(pushedTxHex && panicCpfpTxHex
        ? { pushedChildTxHex: panicCpfpTxHex }
        : {}),
      presignedTxInfos,
      ...(p2aBumpPlan ? { p2aBumpPlan } : {})
    });
  }, [
    isVisible,
    presignedTxInfos,
    needsFeeEstimatesForAvailability,
    feeEstimates,
    isRescuePushedButUnconfirmed,
    pushedTxHex,
    vaultMode,
    panicCpfpTxHex,
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
    // While hidden, return inert render-time values instead of rescue data.
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
      // While hidden or unavailable, return inert render-time values instead of rescue data.
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

  const handleRescue = useCallback(() => {
    if (!txData) throw new Error('Cannot rescue non-existing selected tx');
    onRescue(txData);
  }, [onRescue, txData]);

  const additionalExplanation = (
    <Text className="text-base text-slate-600 pt-4 px-2">
      {t('wallet.vault.rescue.additionalExplanation', {
        timeLockTime: 0
      })}
    </Text>
  );
  const showInsufficientReserveFunds =
    availabilityResult === 'insufficientP2AReserve' ||
    (!isLadderedVault && availabilityResult === 'noReplacementPath');

  let modalContent: React.ReactNode;
  if (!actionAvailability || (needsFeePicker && !feeEstimates)) {
    modalContent = <ActivityIndicator />;
  } else if (availabilityResult === 'noP2AReserve') {
    modalContent = (
      <View>
        <Text className="text-base text-slate-600 pb-2 px-2">
          {t('wallet.vault.rescue.noReserveAvailableYet')}
        </Text>
      </View>
    );
  } else if (availabilityResult === 'p2aReserveUnconfirmed') {
    modalContent = (
      <View>
        <Text className="text-base text-slate-600 pb-2 px-2">
          {t('wallet.vault.rescue.reserveUnconfirmed')}
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
          {t('wallet.vault.rescue.insufficientReserveFunds')}
        </Text>
      </View>
    );
  } else if (step === 'intro') {
    modalContent = (
      <View>
        <Text className="text-base text-slate-600 pb-2 px-2">
          {isRescuePushedButUnconfirmed
            ? t('wallet.vault.rescue.introAccelerate')
            : t('wallet.vault.rescue.intro', {
                panicAddress: vault.coldAddress
              })}
        </Text>
      </View>
    );
  } else if (step === 'confirm' && needsFeePicker && feeEstimates) {
    modalContent = (
      <View>
        {initialFeeRate !== null && minimumSelectableFeeRate !== null ? (
          <>
            <Text className="text-base text-slate-600 pb-4 px-2">
              {t('wallet.vault.rescue.feeSelectorExplanation')}
            </Text>
            <View className="bg-slate-100 p-2 rounded-xl">
              <FeeInput
                min={minimumSelectableFeeRate}
                btcFiat={btcFiat}
                feeEstimates={feeEstimates}
                initialValue={initialFeeRate}
                fee={fee}
                label={t('wallet.vault.rescue.confirmationSpeedLabel')}
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
          {t('wallet.vault.rescue.parentOnlyConfirmation')}
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
      title={t('wallet.vault.rescueButton')}
      icon={{
        family: 'MaterialCommunityIcons',
        name: 'alarm-light'
      }}
      onClose={onClose}
      customButtons={
        step === 'intro' ? (
          <View className="items-center gap-6 gap-y-4 flex-row flex-wrap justify-center pb-4">
            <Button mode="secondary" onPress={onClose}>
              {t('cancelButton')}
            </Button>
            {canOpenConfirmStep && (
              <Button mode="primary-alert" onPress={() => setStep('confirm')}>
                {isRescuePushedButUnconfirmed
                  ? t('accelerateButton')
                  : t('imInDangerButton')}
              </Button>
            )}
          </View>
        ) : step === 'confirm' ? (
          <View className="items-center gap-6 gap-y-4 flex-row flex-wrap justify-center pb-4">
            <Button mode="secondary" onPress={onClose}>
              {t('cancelButton')}
            </Button>
            <Button
              mode="primary-alert"
              onPress={handleRescue}
              disabled={!txData}
            >
              {t('wallet.vault.rescueButton')}
            </Button>
          </View>
        ) : undefined
      }
    >
      {modalContent}
    </Modal>
  );
};

export default Rescue;
