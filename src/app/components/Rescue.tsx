// Copyright (C) 2026 Jose-Luis Landabaso - https://rewindbitcoin.com
// Licensed under the GNU GPL v3 or later. See the LICENSE file for details.

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Modal, Button, ActivityIndicator } from '../../common/ui';
import { useTranslation } from 'react-i18next';
import { View, Text } from 'react-native';
import FeeInput from './FeeInput';
import {
  computeMaxAllowedFeeRate,
  FeeEstimates,
  MIN_FEE_RATE,
  pickFeeEstimate
} from '../lib/fees';
import { useSettings } from '../hooks/useSettings';
import {
  type Vault,
  type VaultStatus,
  estimateCpfpPackage,
  getVaultMode
} from '../lib/vaults';
import { transactionFromHex } from '../lib/bitcoin';
import { useWallet } from '../hooks/useWallet';
import useFirstDefinedValue from '~/common/hooks/useFirstDefinedValue';
import { toNumber } from '../lib/sats';
import {
  findNextEqualOrLargerFeeRate,
  getCpfpReplacementFeeRateFloor,
  pickActionableInitialFeeRate,
  type PreparedCpfpPlan,
  type VaultActionTxData
} from '../lib/vaultActionTx';

const getP2ARescueInfo = (vault: Vault, triggerTxHex: string | undefined) => {
  if (!triggerTxHex) throw new Error('P2A vault is missing trigger tx');
  const txHex = vault.triggerMap[triggerTxHex]?.[0];
  if (!txHex) throw new Error('P2A trigger tx is missing rescue tx');
  const rescueTxData = vault.txMap[txHex];
  if (!rescueTxData) throw new Error('P2A rescue tx is not mapped');
  return { txHex, fee: rescueTxData.fee, feeRate: rescueTxData.feeRate };
};

const Rescue = ({
  vault,
  vaultStatus,
  isVisible,
  emergencyBumpPlan,
  onRescue,
  onClose
}: {
  vault: Vault;
  vaultStatus: VaultStatus | undefined;
  onRescue: (
    rescueData: VaultActionTxData,
    emergencyBumpPlan?: PreparedCpfpPlan
  ) => void;
  isVisible: boolean;
  emergencyBumpPlan?: PreparedCpfpPlan;
  onClose: () => void;
}) => {
  const vaultMode = useMemo(() => getVaultMode(vault), [vault]);
  const isLadderedVault = vaultMode === 'LADDERED';
  const isAccelerationAttempt =
    !!vaultStatus?.panicPushTime || vaultStatus?.panicTxBlockHeight === 0;
  const { t } = useTranslation();
  const {
    feeEstimates: feeEstimatesRealTime,
    btcFiat: btcFiatRealTime,
    historyData
  } = useWallet();
  // Cache to avoid flickering in the sliders while background refreshes happen.
  const btcFiat = useFirstDefinedValue<number>(btcFiatRealTime);
  const feeEstimates = useFirstDefinedValue<FeeEstimates>(feeEstimatesRealTime);

  // Minimum effective fee-rate floor required only when replacing an already
  // existing fee-bump child. `null` means there is no replacement floor yet or
  // we cannot compute it safely with the data currently available.
  const replacementFeeRateFloor = useMemo<number | null>(() => {
    if (!isAccelerationAttempt) return null;
    if (isLadderedVault) {
      if (!vaultStatus?.triggerTxHex || !vaultStatus?.panicTxHex) return null;
      const { tx: triggerTx } = transactionFromHex(vaultStatus.triggerTxHex);
      const { tx: panicTx } = transactionFromHex(vaultStatus.panicTxHex);
      const triggerOutValue = triggerTx.outs[0]?.value;
      if (!triggerTx || triggerTx.outs.length !== 1 || !triggerOutValue)
        throw new Error('Invalid triggerTxHex');
      const panicOutValue = panicTx.outs[0]?.value;
      if (!panicTx || panicTx.outs.length !== 1 || !panicOutValue)
        throw new Error('Invalid panicTxHex');
      return (
        (toNumber(triggerOutValue) - toNumber(panicOutValue)) /
          panicTx.virtualSize() +
        1
      );
    } else {
      const rescueInfo = getP2ARescueInfo(vault, vaultStatus?.triggerTxHex);
      const panicCpfpTxHex = vaultStatus?.panicCpfpTxHex;
      if (!panicCpfpTxHex) return null;
      if (!emergencyBumpPlan) return null;
      return getCpfpReplacementFeeRateFloor({
        parentTxHex: rescueInfo.txHex,
        parentFee: rescueInfo.fee,
        previousChildTxHex: panicCpfpTxHex,
        historyData,
        feeEstimates,
        utxosData: emergencyBumpPlan.utxosData,
        childOutput: emergencyBumpPlan.changeOutput
      });
    }
  }, [
    isAccelerationAttempt,
    isLadderedVault,
    vaultStatus,
    vault,
    historyData,
    feeEstimates,
    emergencyBumpPlan
  ]);

  const ladderedRescueSortedTxs = useMemo(() => {
    if (!isLadderedVault) return [];
    if (!isVisible) return [];
    const triggerTxHex = vaultStatus?.triggerTxHex;
    if (!triggerTxHex) throw new Error('Vault has not been triggered');
    const rescueTxs = vault.triggerMap[triggerTxHex];
    if (!rescueTxs)
      throw new Error("Triggered vault doesn't have matching rescue txs");
    return rescueTxs
      .map(txHex => {
        const txData = vault.txMap[txHex];
        if (!txData) throw new Error('rescue tx not mapped');
        return { txHex, fee: txData.fee, feeRate: txData.feeRate };
      })
      .sort((a, b) => a.feeRate - b.feeRate);
  }, [vault, vaultStatus?.triggerTxHex, isVisible, isLadderedVault]);

  const maxFeeRate = feeEstimates ? computeMaxAllowedFeeRate(feeEstimates) : 0;
  const { settings } = useSettings();
  if (!settings)
    throw new Error(
      'This component should only be started after settings has been retrieved from storage'
    );

  const [step, setStep] = useState<'intro' | 'fee'>('intro');

  const preferredInitialFeeRate = useMemo(() => {
    if (isLadderedVault) {
      if (!feeEstimates) return null;
      const preferredNetworkFeeRate = pickFeeEstimate(
        feeEstimates,
        settings.INITIAL_CONFIRMATION_TIME
      ).feeEstimate;
      if (!isAccelerationAttempt) return preferredNetworkFeeRate;
      if (replacementFeeRateFloor === null) return null;
      return Math.max(replacementFeeRateFloor, preferredNetworkFeeRate);
    }

    const rescueInfo = getP2ARescueInfo(vault, vaultStatus?.triggerTxHex);

    if (!emergencyBumpPlan)
      return isAccelerationAttempt ? null : rescueInfo.feeRate;

    if (!feeEstimates) return null;
    const preferredNetworkFeeRate = pickFeeEstimate(
      feeEstimates,
      settings.INITIAL_CONFIRMATION_TIME
    ).feeEstimate;

    // If rescue is already in flight but no child exists yet, the first CPFP
    // package is not a replacement. The natural floor is the current parent
    // feerate, not a replacement floor.
    if (!isAccelerationAttempt || !vaultStatus?.panicCpfpTxHex)
      return Math.max(rescueInfo.feeRate, preferredNetworkFeeRate);
    if (replacementFeeRateFloor === null) return null;
    return Math.max(replacementFeeRateFloor, preferredNetworkFeeRate);
  }, [
    feeEstimates,
    settings.INITIAL_CONFIRMATION_TIME,
    isLadderedVault,
    vault,
    vaultStatus?.triggerTxHex,
    vaultStatus?.panicCpfpTxHex,
    emergencyBumpPlan,
    isAccelerationAttempt,
    replacementFeeRateFloor
  ]);

  const isAccelerationSyncPending =
    isAccelerationAttempt &&
    !!vaultStatus?.panicCpfpTxHex &&
    !!emergencyBumpPlan &&
    replacementFeeRateFloor === null;
  const cannotAccelerateMaxFee =
    isAccelerationAttempt &&
    replacementFeeRateFloor !== null &&
    replacementFeeRateFloor > maxFeeRate;

  const showsFeePicker = isLadderedVault || !!emergencyBumpPlan;
  const needsFeeEstimates = showsFeePicker;

  const [feeRate, setFeeRate] = useState<number | null>(null);

  const minimumSelectableFeeRate = useMemo(() => {
    if (isLadderedVault)
      return isAccelerationAttempt
        ? replacementFeeRateFloor
        : (ladderedRescueSortedTxs[0]?.feeRate ?? MIN_FEE_RATE);
    if (!emergencyBumpPlan) return null;
    const rescueInfo = getP2ARescueInfo(vault, vaultStatus?.triggerTxHex);
    if (!isAccelerationAttempt || !vaultStatus?.panicCpfpTxHex)
      return rescueInfo.feeRate;
    return replacementFeeRateFloor;
  }, [
    isLadderedVault,
    isAccelerationAttempt,
    replacementFeeRateFloor,
    ladderedRescueSortedTxs,
    emergencyBumpPlan,
    vault,
    vaultStatus?.triggerTxHex,
    vaultStatus?.panicCpfpTxHex
  ]);

  const buildTxDataForFeeRate = useCallback(
    (selectedFeeRate: number): VaultActionTxData | null => {
      if (isLadderedVault) {
        const rescueInfo = findNextEqualOrLargerFeeRate(
          ladderedRescueSortedTxs,
          selectedFeeRate
        );
        if (!rescueInfo) return null;
        return {
          parentTxHex: rescueInfo.txHex,
          parentTxFee: rescueInfo.fee,
          actionFee: rescueInfo.fee,
          actionFeeRate: rescueInfo.feeRate
        };
      }
      if (!isVisible) return null;
      const rescueInfo = getP2ARescueInfo(vault, vaultStatus?.triggerTxHex);
      // Rescue is parent-only by default. Only switch to a package when an
      // explicit external emergency bump plan exists.
      if (selectedFeeRate <= rescueInfo.feeRate)
        return {
          parentTxHex: rescueInfo.txHex,
          parentTxFee: rescueInfo.fee,
          actionFee: rescueInfo.fee,
          actionFeeRate: rescueInfo.feeRate
        };
      if (!emergencyBumpPlan) return null;
      const plan = estimateCpfpPackage({
        parentTxHex: rescueInfo.txHex,
        parentFee: rescueInfo.fee,
        targetPackageFeeRate: selectedFeeRate,
        utxosData: emergencyBumpPlan.utxosData,
        changeOutput: emergencyBumpPlan.changeOutput
      });
      if (!plan) return null;
      return {
        parentTxHex: rescueInfo.txHex,
        parentTxFee: rescueInfo.fee,
        actionFee: plan.packageFee,
        actionFeeRate: plan.packageFeeRate
      };
    },
    [
      isLadderedVault,
      ladderedRescueSortedTxs,
      isVisible,
      vault,
      vaultStatus?.triggerTxHex,
      emergencyBumpPlan
    ]
  );

  const initialFeeRate = useMemo(
    () =>
      // If the wallet's preferred confirmation target is no longer fundable,
      // fall back to the minimum actionable replacement floor instead of
      // opening an acceleration modal that cannot proceed past the intro step.
      pickActionableInitialFeeRate({
        preferredFeeRate: cannotAccelerateMaxFee
          ? null
          : preferredInitialFeeRate,
        minimumActionableFeeRate: cannotAccelerateMaxFee
          ? null
          : minimumSelectableFeeRate,
        canBuildAtFeeRate: feeRate => buildTxDataForFeeRate(feeRate) !== null
      }),
    [
      preferredInitialFeeRate,
      cannotAccelerateMaxFee,
      minimumSelectableFeeRate,
      buildTxDataForFeeRate
    ]
  );

  const txData = useMemo<VaultActionTxData | null>(() => {
    const selectedFeeRate = feeRate ?? initialFeeRate;
    if (selectedFeeRate === null) return null;
    return buildTxDataForFeeRate(selectedFeeRate);
  }, [feeRate, initialFeeRate, buildTxDataForFeeRate]);

  const canOpenFeeStep =
    initialFeeRate !== null &&
    !isAccelerationSyncPending &&
    !cannotAccelerateMaxFee;

  const fee = txData ? txData.actionFee : null;

  // Reset the local wizard step when the modal closes so reopening it always
  // starts from the intro screen instead of a stale fee-selection step.
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
    onRescue(
      txData,
      txData.actionFee > txData.parentTxFee ? emergencyBumpPlan : undefined
    );
  }, [onRescue, txData, emergencyBumpPlan]);

  return (
    isVisible && (
      <Modal
        headerMini={true}
        isVisible={true}
        title={t('wallet.vault.rescueButton')}
        icon={{
          family: 'MaterialCommunityIcons',
          name: 'alarm-light'
        }}
        onClose={onClose}
        {...{
          customButtons:
            step === 'intro' ? (
              <View className="items-center gap-6 gap-y-4 flex-row flex-wrap justify-center pb-4">
                <Button mode="secondary" onPress={onClose}>
                  {t('cancelButton')}
                </Button>
                {canOpenFeeStep && (
                  <Button mode="primary-alert" onPress={() => setStep('fee')}>
                    {isAccelerationAttempt
                      ? t('accelerateButton')
                      : t('imInDangerButton')}
                  </Button>
                )}
              </View>
            ) : step === 'fee' ? (
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
        }}
      >
        {needsFeeEstimates && !feeEstimates ? (
          //loading...
          <ActivityIndicator />
        ) : cannotAccelerateMaxFee ? (
          //cannot RBF
          <View>
            <Text className="text-base text-slate-600 pb-2 px-2">
              {t('wallet.vault.cannotAccelerateMaxFee')}
            </Text>
          </View>
        ) : step === 'intro' ? (
          <View>
            <Text className="text-base text-slate-600 pb-2 px-2">
              {isAccelerationAttempt
                ? t('wallet.vault.rescue.introAccelerate')
                : t('wallet.vault.rescue.intro', {
                    panicAddress: vault.coldAddress
                  })}
            </Text>
          </View>
        ) : step === 'fee' ? (
          <View>
            {showsFeePicker ? (
              <>
                <Text className="text-base text-slate-600 pb-4 px-2">
                  {t('wallet.vault.rescue.feeSelectorExplanation')}
                </Text>
                <View className="bg-slate-100 p-2 rounded-xl">
                  <FeeInput
                    {...(minimumSelectableFeeRate !== null
                      ? { min: minimumSelectableFeeRate }
                      : {})}
                    btcFiat={btcFiat}
                    feeEstimates={feeEstimates!}
                    initialValue={initialFeeRate!}
                    fee={fee}
                    label={t('wallet.vault.rescue.confirmationSpeedLabel')}
                    onValueChange={setFeeRate}
                  />
                </View>
              </>
            ) : (
              <Text className="text-base text-slate-600 pb-4 px-2">
                {t('wallet.vault.rescue.highFeeConfirmation')}
              </Text>
            )}
            <Text className="text-base text-slate-600 pt-4 px-2">
              {t('wallet.vault.rescue.additionalExplanation', {
                timeLockTime: 0
              })}
            </Text>
          </View>
        ) : null}
      </Modal>
    )
  );
};

export default Rescue;
