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
import { formatBlocks } from '../lib/format';
import { useSettings } from '../hooks/useSettings';
import {
  type Vault,
  type VaultStatus,
  estimateCpfpPackage,
  getTriggerReserveUtxosData,
  getVaultMode
} from '../lib/vaults';
import { useWallet } from '../hooks/useWallet';
import useFirstDefinedValue from '~/common/hooks/useFirstDefinedValue';
import { useLocalization } from '../hooks/useLocalization';
import { DUMMY_CHANGE_OUTPUT, getMainAccount } from '../lib/vaultDescriptors';
import { networkMapping } from '../lib/network';
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
} from '../lib/vaultActionTx';

type InitUnfreezeProps = {
  vault: Vault;
  vaultStatus: VaultStatus | undefined;
  onInitUnfreeze: (initUnfreezeData: VaultActionTxData) => void;
  lockBlocks: number;
  isVisible: boolean;
  onClose: () => void;
};

const InitUnfreeze = ({
  vault,
  vaultStatus,
  isVisible,
  lockBlocks,
  onInitUnfreeze,
  onClose
}: InitUnfreezeProps) => {
  const { locale } = useLocalization();
  const vaultMode = useMemo<'LADDERED' | 'P2A_TRUC' | 'P2A_NON_TRUC'>(
    () => getVaultMode(vault),
    [vault]
  );
  const isLadderedVault = vaultMode === 'LADDERED';
  const { t } = useTranslation();
  const {
    feeEstimates: feeEstimatesRealTime,
    btcFiat: btcFiatRealTime,
    accounts,
    networkId,
    signers
  } = useWallet();
  // Cache to avoid flickering in the sliders while background refreshes happen.
  const btcFiat = useFirstDefinedValue<number>(btcFiatRealTime);
  const feeEstimates = useFirstDefinedValue<FeeEstimates>(feeEstimatesRealTime);
  const signer = signers?.[0];
  const triggerCpfpTxHex = vaultStatus?.triggerCpfpTxHex;
  const triggerTxHex = vaultStatus?.triggerTxHex;
  const p2aTriggerInfo = useMemo<PresignedTxInfo | null>(
    () => (isLadderedVault ? null : getP2ATriggerInfo(vault)),
    [isLadderedVault, vault]
  );
  // p2aBumpPlan is used for fee estimations only; real changeOutput used in Vaults.tsx
  const p2aBumpPlan = useMemo<P2ABumpPlan | null>(() => {
    if (isLadderedVault || !networkId || !signer || !accounts) return null;
    const network = networkMapping[networkId];
    const utxosData = getTriggerReserveUtxosData({ vault, signer, network });
    if (utxosData.length === 0) return null;
    return {
      utxosData,
      changeOutput: DUMMY_CHANGE_OUTPUT(
        getMainAccount(accounts, network),
        network
      ),
      signer,
      ...(triggerCpfpTxHex ? { previousChildTxHex: triggerCpfpTxHex } : {})
    };
  }, [isLadderedVault, networkId, signer, accounts, vault, triggerCpfpTxHex]);
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
      presignedTxInfos,
      ...(p2aBumpPlan ? { p2aBumpPlan } : {})
    });
  }, [
    vaultMode,
    feeEstimates,
    isTriggerPushedButUnconfirmed,
    triggerTxHex,
    presignedTxInfos,
    p2aBumpPlan
  ]);
  const replacementFeeRateFloor =
    accelerationInfo?.replacementFeeRateFloor ?? null;
  const hasAccelerationPath = accelerationInfo?.hasAccelerationPath ?? false;

  const maxFeeRate = feeEstimates
    ? computeMaxAllowedFeeRate(feeEstimates)
    : null;
  const { settings } = useSettings();
  if (!settings)
    throw new Error(
      'This component should only be started after settings has been retrieved from storage'
    );

  const [step, setStep] = useState<'intro' | 'fee'>('intro');

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
      if (!p2aBumpPlan || !p2aTriggerInfo) return null;
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

  let canOpenFeeStep: boolean;
  if (!feeEstimates) {
    canOpenFeeStep = false;
  } else if (isTriggerPushedButUnconfirmed) {
    canOpenFeeStep = hasAccelerationPath;
  } else {
    canOpenFeeStep = initialFeeRate !== null;
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

  const handleInitUnfreeze = useCallback(() => {
    if (!txData) throw new Error('Cannot unfreeze non-existing selected tx');
    onInitUnfreeze(txData);
  }, [onInitUnfreeze, txData]);

  const timeLockTime = formatBlocks(lockBlocks, t, locale, true);

  let modalContent: React.ReactNode;
  if (isTriggerPushedButUnconfirmed && !isLadderedVault && !p2aBumpPlan) {
    modalContent = (
      <View>
        <Text className="text-base text-slate-600 pb-2 px-2">
          {t('wallet.vault.triggerUnfreeze.noReserveAvailableYet')}
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
  } else if (step === 'fee') {
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
              {canOpenFeeStep && (
                <Button onPress={() => setStep('fee')}>
                  {isTriggerPushedButUnconfirmed
                    ? t('accelerateButton')
                    : t('continueButton')}
                </Button>
              )}
            </View>
          ) : step === 'fee' ? (
            <View className="items-center gap-6 gap-y-4 flex-row flex-wrap justify-center pb-4">
              <Button mode="secondary" onPress={onClose}>
                {t('cancelButton')}
              </Button>
              <Button onPress={handleInitUnfreeze} disabled={!txData}>
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

export default InitUnfreeze;
