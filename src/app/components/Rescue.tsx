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
import { useWallet } from '../hooks/useWallet';
import useFirstDefinedValue from '~/common/hooks/useFirstDefinedValue';
import {
  type AccelerationInfo,
  findNextEqualOrLargerFeeRate,
  getActionAccelerationInfo,
  getLadderedRescueSortedTxs,
  getP2ARescueInfo,
  pickActionableInitialFeeRate,
  type PreparedCpfpPlan,
  type VaultActionTxData
} from '../lib/vaultActionTx';

type RescueProps = {
  vault: Vault;
  vaultStatus: VaultStatus | undefined;
  onRescue: (
    rescueData: VaultActionTxData,
    bumpPlan?: PreparedCpfpPlan
  ) => void;
  isVisible: boolean;
  /**
   * Optional external CPFP funding plan for P2A-vault-type rescue.
   *
   * This is a small emergency wallet plan prepared outside the
   * main wallet after an attack. It provides fresh UTXOs and a signer that are
   * not meant to be under the compromised wallet's normal flow.
   *
   * When present, rescue can attach a child tx that spends those fresh UTXOs to
   * add more fee and sends leftover value to the provided output, which should
   * normally be the emergency address. When absent, P2A rescue stays parent-only.
   */
  bumpPlan?: PreparedCpfpPlan;
  onClose: () => void;
};

const Rescue = ({
  vault,
  vaultStatus,
  isVisible,
  bumpPlan,
  onRescue,
  onClose
}: RescueProps) => {
  const vaultMode = useMemo(() => getVaultMode(vault), [vault]);
  const isLadderedVault = vaultMode === 'LADDERED';
  const { t } = useTranslation();
  const {
    feeEstimates: feeEstimatesRealTime,
    btcFiat: btcFiatRealTime,
    historyData
  } = useWallet();
  // Cache to avoid flickering in the sliders while background refreshes happen.
  const btcFiat = useFirstDefinedValue<number>(btcFiatRealTime);
  const feeEstimates = useFirstDefinedValue<FeeEstimates>(feeEstimatesRealTime);
  const triggerTxHex = vaultStatus?.triggerTxHex;
  const presignedTxs = useMemo(
    () =>
      isLadderedVault && triggerTxHex
        ? getLadderedRescueSortedTxs(vault, triggerTxHex)
        : triggerTxHex
          ? [getP2ARescueInfo(vault, triggerTxHex)]
          : [],
    [isLadderedVault, vault, triggerTxHex]
  );
  const isPushedButUnconfirmed =
    vaultStatus?.panicTxBlockHeight !== undefined
      ? vaultStatus.panicTxBlockHeight === 0
      : !!vaultStatus?.panicPushTime;
  const accelerationInfo = useMemo<AccelerationInfo | null>(() => {
    if (!isPushedButUnconfirmed) return null;
    if (!feeEstimates) return null;
    if (!triggerTxHex)
      throw new Error('Unconfirmed rescue is missing trigger tx');
    const pushedTxHex = vaultStatus?.panicTxHex;
    if (!pushedTxHex) throw new Error('Unconfirmed rescue is missing tx hex');
    return getActionAccelerationInfo({
      vaultMode,
      feeEstimates,
      pushedTxHex,
      presignedTxs,
      bumpPlan,
      ...(historyData ? { historyData } : {})
    });
  }, [
    vaultMode,
    feeEstimates,
    historyData,
    isPushedButUnconfirmed,
    vaultStatus?.panicTxHex,
    triggerTxHex,
    presignedTxs,
    bumpPlan
  ]);
  const replacementFeeRateFloor =
    accelerationInfo?.replacementFeeRateFloor ?? null;
  const hasAccelerationPath = accelerationInfo?.hasAccelerationPath ?? false;
  const hasFundingUtxos = (bumpPlan?.utxosData.length ?? 0) > 0;

  const maxFeeRate = feeEstimates
    ? computeMaxAllowedFeeRate(feeEstimates)
    : null;
  const { settings } = useSettings();
  if (!settings)
    throw new Error(
      'This component should only be started after settings has been retrieved from storage'
    );

  const [step, setStep] = useState<'intro' | 'fee'>('intro');

  const preferredInitialFeeRate = useMemo(() => {
    // This modal stays mounted so Modal can animate across isVisible changes.
    // While hidden, return inert render-time values instead of rescue data.
    if (!isVisible) {
      return null;
    } else if (isLadderedVault) {
      if (!feeEstimates) return null;
      const preferredNetworkFeeRate = pickFeeEstimate(
        feeEstimates,
        settings.INITIAL_CONFIRMATION_TIME
      ).feeEstimate;
      if (!isPushedButUnconfirmed) return preferredNetworkFeeRate;
      else {
        if (replacementFeeRateFloor === null) return null;
        else return Math.max(replacementFeeRateFloor, preferredNetworkFeeRate);
      }
    } else {
      if (!triggerTxHex)
        throw new Error('Visible rescue is missing trigger tx');
      const rescueInfo = getP2ARescueInfo(vault, triggerTxHex);

      if (!hasFundingUtxos)
        return isPushedButUnconfirmed ? null : rescueInfo.feeRate;

      if (!feeEstimates) return null;
      const preferredNetworkFeeRate = pickFeeEstimate(
        feeEstimates,
        settings.INITIAL_CONFIRMATION_TIME
      ).feeEstimate;

      if (!isPushedButUnconfirmed)
        return Math.max(rescueInfo.feeRate, preferredNetworkFeeRate);
      if (replacementFeeRateFloor === null) return null;
      return Math.max(replacementFeeRateFloor, preferredNetworkFeeRate);
    }
  }, [
    feeEstimates,
    settings.INITIAL_CONFIRMATION_TIME,
    isLadderedVault,
    vault,
    isVisible,
    triggerTxHex,
    hasFundingUtxos,
    isPushedButUnconfirmed,
    replacementFeeRateFloor
  ]);

  const showsFeePicker = isLadderedVault || hasFundingUtxos;
  const needsFeeEstimates = showsFeePicker;

  const [feeRate, setFeeRate] = useState<number | null>(null);

  const minimumSelectableFeeRate = useMemo(() => {
    // This modal stays mounted so Modal can animate across isVisible changes.
    // While hidden, return inert render-time values instead of rescue data.
    if (!isVisible) {
      return null;
    } else if (isLadderedVault) {
      return isPushedButUnconfirmed
        ? replacementFeeRateFloor
        : (presignedTxs[0]?.feeRate ?? MIN_FEE_RATE);
    } else {
      if (!triggerTxHex)
        throw new Error('Visible rescue is missing trigger tx');
      if (!hasFundingUtxos) {
        return null;
      } else {
        const rescueInfo = getP2ARescueInfo(vault, triggerTxHex);
        if (!isPushedButUnconfirmed) {
          return rescueInfo.feeRate;
        } else {
          return replacementFeeRateFloor;
        }
      }
    }
  }, [
    isLadderedVault,
    isPushedButUnconfirmed,
    replacementFeeRateFloor,
    isVisible,
    presignedTxs,
    hasFundingUtxos,
    vault,
    triggerTxHex
  ]);

  const buildTxDataForFeeRate = useCallback(
    (selectedFeeRate: number): VaultActionTxData | null => {
      // This modal stays mounted so Modal can animate across isVisible changes.
      // While hidden, return inert render-time values instead of rescue data.
      if (!isVisible) {
        return null;
      } else if (isLadderedVault) {
        const rescueInfo = findNextEqualOrLargerFeeRate(
          presignedTxs,
          selectedFeeRate
        );
        if (!rescueInfo) return null;
        return {
          parentTxHex: rescueInfo.txHex,
          parentTxFee: rescueInfo.fee,
          actionFee: rescueInfo.fee,
          actionFeeRate: rescueInfo.feeRate
        };
      } else {
        if (!triggerTxHex)
          throw new Error('Visible rescue is missing trigger tx');
        const rescueInfo = getP2ARescueInfo(vault, triggerTxHex);
        // Rescue is parent-only by default. Only switch to a package when an
        // explicit external emergency bump plan exists.
        if (selectedFeeRate <= rescueInfo.feeRate)
          return {
            parentTxHex: rescueInfo.txHex,
            parentTxFee: rescueInfo.fee,
            actionFee: rescueInfo.fee,
            actionFeeRate: rescueInfo.feeRate
          };
        else if (!bumpPlan || bumpPlan.utxosData.length === 0) return null;
        else {
          const plan = estimateCpfpPackage({
            parentTxHex: rescueInfo.txHex,
            parentFee: rescueInfo.fee,
            targetPackageFeeRate: selectedFeeRate,
            utxosData: bumpPlan.utxosData,
            changeOutput: bumpPlan.changeOutput
          });
          if (!plan) return null;
          else
            return {
              parentTxHex: rescueInfo.txHex,
              parentTxFee: rescueInfo.fee,
              actionFee: plan.packageFee,
              actionFeeRate: plan.packageFeeRate
            };
        }
      }
    },
    [isVisible, isLadderedVault, presignedTxs, vault, triggerTxHex, bumpPlan]
  );

  const initialFeeRate = useMemo(
    () =>
      // If the wallet's preferred confirmation target is no longer fundable,
      // fall back to the minimum actionable replacement floor instead of
      // opening an acceleration modal that cannot proceed past the intro step.
      pickActionableInitialFeeRate({
        preferredFeeRate:
          isPushedButUnconfirmed &&
          replacementFeeRateFloor !== null &&
          maxFeeRate !== null &&
          replacementFeeRateFloor > maxFeeRate
            ? null
            : preferredInitialFeeRate,
        minimumActionableFeeRate:
          isPushedButUnconfirmed &&
          replacementFeeRateFloor !== null &&
          maxFeeRate !== null &&
          replacementFeeRateFloor > maxFeeRate
            ? null
            : minimumSelectableFeeRate,
        canBuildAtFeeRate: feeRate => buildTxDataForFeeRate(feeRate) !== null
      }),
    [
      preferredInitialFeeRate,
      isPushedButUnconfirmed,
      replacementFeeRateFloor,
      maxFeeRate,
      minimumSelectableFeeRate,
      buildTxDataForFeeRate
    ]
  );

  const txData = useMemo<VaultActionTxData | null>(() => {
    const selectedFeeRate = feeRate ?? initialFeeRate;
    if (selectedFeeRate === null) return null;
    return buildTxDataForFeeRate(selectedFeeRate);
  }, [feeRate, initialFeeRate, buildTxDataForFeeRate]);

  const canOpenFeeStep = isPushedButUnconfirmed
    ? hasAccelerationPath
    : initialFeeRate !== null;

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
    onRescue(
      txData,
      txData.actionFee > txData.parentTxFee ? bumpPlan : undefined
    );
  }, [onRescue, txData, bumpPlan]);

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
      {...{
        customButtons:
          step === 'intro' ? (
            <View className="items-center gap-6 gap-y-4 flex-row flex-wrap justify-center pb-4">
              <Button mode="secondary" onPress={onClose}>
                {t('cancelButton')}
              </Button>
              {canOpenFeeStep && (
                <Button mode="primary-alert" onPress={() => setStep('fee')}>
                  {isPushedButUnconfirmed
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
      ) : isPushedButUnconfirmed &&
        replacementFeeRateFloor !== null &&
        maxFeeRate !== null &&
        replacementFeeRateFloor > maxFeeRate ? (
        //cannot RBF
        <View>
          <Text className="text-base text-slate-600 pb-2 px-2">
            {t('wallet.vault.cannotAccelerateMaxFee')}
          </Text>
        </View>
      ) : step === 'intro' ? (
        <View>
          <Text className="text-base text-slate-600 pb-2 px-2">
            {isPushedButUnconfirmed
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
  );
};

export default Rescue;
