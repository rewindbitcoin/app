// Copyright (C) 2026 Jose-Luis Landabaso - https://rewindbitcoin.com
// Licensed under the GNU GPL v3 or later. See the LICENSE file for details.

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Modal, Button, ActivityIndicator } from '../../../../common/ui';
import { useTranslation } from 'react-i18next';
import { View, Text } from 'react-native';
import FeeInput from '../../FeeInput';
import {
  computeMaxAllowedFeeRate,
  FeeEstimates,
  MIN_FEE_RATE,
  pickFeeEstimate
} from '../../../lib/fees';
import { formatBlocks } from '../../../lib/format';
import { useSettings } from '../../../hooks/useSettings';
import {
  type Vault,
  type VaultStatus,
  estimateCpfpPackage,
  getVaultMode
} from '../../../lib/vaults';
import { useWallet } from '../../../hooks/useWallet';
import useFirstDefinedValue from '~/common/hooks/useFirstDefinedValue';
import { useLocalization } from '../../../hooks/useLocalization';
import {
  type AccelerationInfo,
  findMinimumActionableFeeRate,
  findNextEqualOrLargerFeeRate,
  getActionAccelerationInfo,
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
  const accelerationInfo = useMemo<AccelerationInfo | null>(() => {
    if (
      !isTriggerPushedButUnconfirmed ||
      !triggerTxHex ||
      !feeEstimates ||
      !presignedTxInfos
    )
      return null;
    return getActionAccelerationInfo({
      vaultMode,
      feeEstimates,
      pushedTxHex: triggerTxHex,
      ...(vaultStatus?.triggerCpfpTxHex
        ? { pushedChildTxHex: vaultStatus.triggerCpfpTxHex }
        : {}),
      presignedTxInfos,
      ...(p2aBumpPlan ? { p2aBumpPlan } : {})
    });
  }, [
    vaultMode,
    feeEstimates,
    isTriggerPushedButUnconfirmed,
    triggerTxHex,
    vaultStatus?.triggerCpfpTxHex,
    presignedTxInfos,
    p2aBumpPlan
  ]);
  const replacementFeeRateFloor =
    accelerationInfo?.replacementFeeRateFloor ?? null;
  const hasAccelerationPath = accelerationInfo?.hasAccelerationPath ?? false;
  const isP2ABumpPlanLoading = !isLadderedVault && p2aBumpPlan === undefined;

  const maxFeeRate = feeEstimates
    ? computeMaxAllowedFeeRate(feeEstimates)
    : null;
  if (!settings)
    throw new Error(
      'This component should only be started after settings has been retrieved from storage'
    );

  const [step, setStep] = useState<'intro' | 'confirm'>('intro');

  const preferredInitialFeeRate = useMemo<number | null>(() => {
    // This modal stays mounted so Modal can animate across isVisible changes.
    // While hidden, return inert render-time values instead of trigger data.
    if (!isVisible || !feeEstimates) return null;
    const preferredNetworkFeeRate = pickFeeEstimate(
      feeEstimates,
      settings.INITIAL_CONFIRMATION_TIME
    ).feeEstimate;
    if (!isTriggerPushedButUnconfirmed) return preferredNetworkFeeRate;
    if (replacementFeeRateFloor === null) return null;
    return Math.max(replacementFeeRateFloor, preferredNetworkFeeRate);
  }, [
    isVisible,
    feeEstimates,
    settings.INITIAL_CONFIRMATION_TIME,
    isTriggerPushedButUnconfirmed,
    replacementFeeRateFloor
  ]);

  const [feeRate, setFeeRate] = useState<number | null>(null);

  const buildTxDataForFeeRate = useCallback(
    (selectedFeeRate: number): VaultActionTxData | null => {
      // This modal stays mounted so Modal can animate across isVisible changes.
      // While hidden, return inert render-time values instead of trigger data.
      if (!isVisible) return null;
      if (isLadderedVault) {
        if (!presignedTxInfos) return null;
        const triggerInfo = findNextEqualOrLargerFeeRate(
          presignedTxInfos,
          selectedFeeRate
        );
        if (!triggerInfo) return null;
        return {
          parentTxHex: triggerInfo.txHex,
          parentTxFee: triggerInfo.fee,
          actionFee: triggerInfo.fee,
          actionFeeRate: triggerInfo.feeRate
        };
      }
      if (!p2aBumpPlan || p2aBumpPlan.utxosData.length === 0 || !p2aTriggerInfo)
        return null;
      // Trigger fee bumping is reserve-only by design: always reuse this
      // vault's dedicated reserve UTXO as the only non-anchor input and send
      // any leftover value back through normal wallet change.
      const plan = estimateCpfpPackage({
        parentTxHex: p2aTriggerInfo.txHex,
        parentFee: p2aTriggerInfo.fee,
        targetPackageFeeRate: selectedFeeRate,
        utxosData: p2aBumpPlan.utxosData,
        changeOutput: p2aBumpPlan.changeOutput
      });
      if (!plan) return null;
      return {
        parentTxHex: p2aTriggerInfo.txHex,
        parentTxFee: p2aTriggerInfo.fee,
        actionFee: plan.packageFee,
        actionFeeRate: plan.packageFeeRate
      };
    },
    [isVisible, isLadderedVault, presignedTxInfos, p2aBumpPlan, p2aTriggerInfo]
  );

  const minimumSelectableFeeRate = useMemo<number | null>(() => {
    // This modal stays mounted so Modal can animate across isVisible changes.
    // While hidden, return inert render-time values instead of trigger data.
    if (!isVisible) return null;
    if (isLadderedVault) {
      if (!presignedTxInfos) return null;
      return isTriggerPushedButUnconfirmed
        ? replacementFeeRateFloor
        : (presignedTxInfos[0]?.feeRate ?? MIN_FEE_RATE);
    }
    if (isTriggerPushedButUnconfirmed) return replacementFeeRateFloor;
    if (maxFeeRate === null) return null;
    return findMinimumActionableFeeRate({
      minimumFeeRate: MIN_FEE_RATE,
      maximumFeeRate: maxFeeRate,
      canBuildAtFeeRate: feeRate => buildTxDataForFeeRate(feeRate) !== null
    });
  }, [
    isVisible,
    isLadderedVault,
    isTriggerPushedButUnconfirmed,
    replacementFeeRateFloor,
    presignedTxInfos,
    maxFeeRate,
    buildTxDataForFeeRate
  ]);

  const cannotAccelerateMaxFee =
    isTriggerPushedButUnconfirmed &&
    replacementFeeRateFloor !== null &&
    maxFeeRate !== null &&
    replacementFeeRateFloor > maxFeeRate;

  const initialFeeRate = useMemo<number | null>(() => {
    // No selectable fee can satisfy replacement rules above the picker max.
    if (cannotAccelerateMaxFee) return null;

    if (
      preferredInitialFeeRate !== null &&
      buildTxDataForFeeRate(preferredInitialFeeRate) !== null
    )
      return preferredInitialFeeRate;

    // If the preferred target is not fundable, use the lowest buildable fee.
    if (
      minimumSelectableFeeRate !== null &&
      buildTxDataForFeeRate(minimumSelectableFeeRate) !== null
    )
      return minimumSelectableFeeRate;

    return null;
  }, [
    preferredInitialFeeRate,
    cannotAccelerateMaxFee,
    minimumSelectableFeeRate,
    buildTxDataForFeeRate
  ]);

  const txData = useMemo<VaultActionTxData | null>(() => {
    const selectedFeeRate = feeRate ?? initialFeeRate;
    if (selectedFeeRate === null) return null;
    return buildTxDataForFeeRate(selectedFeeRate);
  }, [feeRate, initialFeeRate, buildTxDataForFeeRate]);

  let canOpenConfirmStep: boolean;
  if (isP2ABumpPlanLoading) {
    canOpenConfirmStep = false;
  } else if (!feeEstimates) {
    canOpenConfirmStep = false;
  } else if (isTriggerPushedButUnconfirmed) {
    canOpenConfirmStep = hasAccelerationPath;
  } else {
    canOpenConfirmStep = initialFeeRate !== null;
  }

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

  // Modal opened with a prepared P2A plan, but no reserve UTXOs were found.
  const noP2AReserveUtxos =
    !isLadderedVault &&
    p2aBumpPlan !== undefined &&
    p2aBumpPlan.utxosData.length === 0;
  // Modal opened from the acceleration status line: replace the already pushed
  // trigger package, if a valid replacement path exists.
  const noP2AAccelerationPath =
    !isLadderedVault && isTriggerPushedButUnconfirmed && !hasAccelerationPath;
  // Modal opened from the Init Unfreeze button: build the initial trigger
  // package, if any selectable fee rate can fund it.
  const noP2AStartPath =
    !isLadderedVault &&
    !isTriggerPushedButUnconfirmed &&
    // At this point fee estimates exist; null means no selectable fee rate can
    // build the initial P2A trigger package.
    initialFeeRate === null;
  const showInsufficientReserveFunds = noP2AAccelerationPath || noP2AStartPath;

  let modalContent: React.ReactNode;
  if (isP2ABumpPlanLoading) {
    modalContent = <ActivityIndicator />;
  } else if (noP2AReserveUtxos) {
    modalContent = (
      <View>
        <Text className="text-base text-slate-600 pb-2 px-2">
          {
            //FIXME:wizard
            //  - no trigger reserve UTXO was found for this vault
            //  - Rewind cannot start or accelerate the P2A trigger package
            t('wallet.vault.triggerUnfreeze.noReserveAvailableYet')
          }
        </Text>
      </View>
    );
  } else if (!feeEstimates) {
    modalContent = <ActivityIndicator />;
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
          {
            //FIXME:wizard
            //  - reserve UTXOs exist
            //  - but no selectable fee rate can start the trigger package, or
            //    getActionAccelerationInfo(...) cannot find a valid acceleration path
            t('wallet.vault.triggerUnfreeze.insufficientReserveFunds')
          }
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
  } else if (step === 'confirm') {
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
        <Text className="text-base text-slate-600 pt-4 px-2">
          {t('wallet.vault.triggerUnfreeze.additionalExplanation', {
            timeLockTime
          })}
        </Text>
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
      {...{
        customButtons:
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
      }}
    >
      {modalContent}
    </Modal>
  );
};

export default Trigger;
