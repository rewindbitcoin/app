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
  pickActionableInitialFeeRate,
  type PreparedCpfpPlan,
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
  const vaultMode = useMemo(() => getVaultMode(vault), [vault]);
  const isLadderedVault = vaultMode === 'LADDERED';
  const { t } = useTranslation();
  const {
    feeEstimates: feeEstimatesRealTime,
    btcFiat: btcFiatRealTime,
    accounts,
    networkId,
    historyData,
    signers
  } = useWallet();
  // Cache to avoid flickering in the sliders while background refreshes happen.
  const btcFiat = useFirstDefinedValue<number>(btcFiatRealTime);
  const feeEstimates = useFirstDefinedValue<FeeEstimates>(feeEstimatesRealTime);
  const signer = signers?.[0];
  const triggerCpfpTxHex = vaultStatus?.triggerCpfpTxHex;
  const triggerTxHex = vaultStatus?.triggerTxHex;
  const p2aTriggerInfo = useMemo(
    () => (isLadderedVault ? undefined : getP2ATriggerInfo(vault)),
    [isLadderedVault, vault]
  );
  // Estimates can use a dummy change output; broadcast builds fresh wallet change.
  const bumpPlan = useMemo<PreparedCpfpPlan | undefined>(() => {
    if (
      isLadderedVault ||
      !networkId ||
      !signer ||
      !accounts ||
      !p2aTriggerInfo
    )
      return;
    const network = networkMapping[networkId];
    const utxosData = getTriggerReserveUtxosData({
      vault,
      signer,
      network
    });
    if (utxosData.length === 0) return;
    return {
      utxosData,
      changeOutput: DUMMY_CHANGE_OUTPUT(
        getMainAccount(accounts, network),
        network
      ),
      signer,
      ...(triggerCpfpTxHex ? { previousChildTxHex: triggerCpfpTxHex } : {})
    };
  }, [
    isLadderedVault,
    networkId,
    signer,
    accounts,
    p2aTriggerInfo,
    vault,
    triggerCpfpTxHex
  ]);
  const presignedTxs = useMemo(
    () =>
      isLadderedVault
        ? getLadderedTriggerSortedTxs(vault)
        : p2aTriggerInfo
          ? [p2aTriggerInfo]
          : [],
    [isLadderedVault, vault, p2aTriggerInfo]
  );
  const isPushedButUnconfirmed =
    vaultStatus?.triggerTxBlockHeight !== undefined
      ? vaultStatus.triggerTxBlockHeight === 0
      : !!vaultStatus?.triggerPushTime;
  const accelerationInfo = useMemo<AccelerationInfo | null>(() => {
    if (!isPushedButUnconfirmed || !feeEstimates) return null;
    if (!triggerTxHex) throw new Error('Unconfirmed trigger is missing tx hex');
    return getActionAccelerationInfo({
      vaultMode,
      feeEstimates,
      pushedTxHex: triggerTxHex,
      presignedTxs,
      bumpPlan,
      ...(historyData ? { historyData } : {})
    });
  }, [
    vaultMode,
    feeEstimates,
    historyData,
    isPushedButUnconfirmed,
    triggerTxHex,
    presignedTxs,
    bumpPlan
  ]);
  const replacementFeeRateFloor =
    accelerationInfo?.replacementFeeRateFloor ?? null;
  const hasAccelerationPath = accelerationInfo?.hasAccelerationPath ?? false;
  const hasFundingUtxos = (bumpPlan?.utxosData.length ?? 0) > 0;

  const maxFeeRate = feeEstimates ? computeMaxAllowedFeeRate(feeEstimates) : 0;
  const { settings } = useSettings();
  if (!settings)
    throw new Error(
      'This component should only be started after settings has been retrieved from storage'
    );

  const [step, setStep] = useState<'intro' | 'fee'>('intro');

  const preferredInitialFeeRate = useMemo(() => {
    // This modal stays mounted so Modal can animate across isVisible changes.
    // While hidden, return inert render-time values instead of trigger data.
    if (!isVisible) {
      return null;
    } else if (!feeEstimates) {
      return null;
    } else {
      const preferredNetworkFeeRate = pickFeeEstimate(
        feeEstimates,
        settings.INITIAL_CONFIRMATION_TIME
      ).feeEstimate;
      if (!isPushedButUnconfirmed) return preferredNetworkFeeRate;
      else {
        if (replacementFeeRateFloor === null) return null;
        else return Math.max(replacementFeeRateFloor, preferredNetworkFeeRate);
      }
    }
  }, [
    isVisible,
    feeEstimates,
    settings.INITIAL_CONFIRMATION_TIME,
    isPushedButUnconfirmed,
    replacementFeeRateFloor
  ]);

  const [feeRate, setFeeRate] = useState<number | null>(null);

  const buildTxDataForFeeRate = useCallback(
    (selectedFeeRate: number): VaultActionTxData | null => {
      // This modal stays mounted so Modal can animate across isVisible changes.
      // While hidden, return inert render-time values instead of trigger data.
      if (!isVisible) {
        return null;
      } else if (isLadderedVault) {
        const triggerInfo = findNextEqualOrLargerFeeRate(
          presignedTxs ?? [],
          selectedFeeRate
        );
        if (!triggerInfo) return null;
        return {
          parentTxHex: triggerInfo.txHex,
          parentTxFee: triggerInfo.fee,
          actionFee: triggerInfo.fee,
          actionFeeRate: triggerInfo.feeRate
        };
      } else {
        if (!bumpPlan || !p2aTriggerInfo) return null;
        // Trigger fee bumping is reserve-only by design: always reuse this
        // vault's dedicated reserve UTXO as the only non-anchor input and send
        // any leftover value back through normal wallet change.
        if (isPushedButUnconfirmed) {
          const previousChildTxHex = bumpPlan.previousChildTxHex;
          if (!previousChildTxHex || !historyData?.length) return null;
        }
        const plan = estimateCpfpPackage({
          parentTxHex: p2aTriggerInfo.txHex,
          parentFee: p2aTriggerInfo.fee,
          targetPackageFeeRate: selectedFeeRate,
          utxosData: bumpPlan.utxosData,
          changeOutput: bumpPlan.changeOutput
        });
        if (!plan) return null;
        return {
          parentTxHex: p2aTriggerInfo.txHex,
          parentTxFee: p2aTriggerInfo.fee,
          actionFee: plan.packageFee,
          actionFeeRate: plan.packageFeeRate
        };
      }
    },
    [
      isVisible,
      isLadderedVault,
      presignedTxs,
      bumpPlan,
      p2aTriggerInfo,
      isPushedButUnconfirmed,
      historyData
    ]
  );

  const minimumSelectableFeeRate = useMemo(() => {
    // This modal stays mounted so Modal can animate across isVisible changes.
    // While hidden, return inert render-time values instead of trigger data.
    if (!isVisible) {
      return null;
    } else if (isLadderedVault) {
      return isPushedButUnconfirmed
        ? replacementFeeRateFloor
        : (presignedTxs[0]?.feeRate ?? MIN_FEE_RATE);
    } else {
      if (isPushedButUnconfirmed) {
        return replacementFeeRateFloor;
      } else {
        return findMinimumActionableFeeRate({
          minimumFeeRate: MIN_FEE_RATE,
          maximumFeeRate: maxFeeRate,
          canBuildAtFeeRate: feeRate => buildTxDataForFeeRate(feeRate) !== null
        });
      }
    }
  }, [
    isVisible,
    isLadderedVault,
    isPushedButUnconfirmed,
    replacementFeeRateFloor,
    presignedTxs,
    maxFeeRate,
    buildTxDataForFeeRate
  ]);

  const initialFeeRate = useMemo(
    () =>
      // If the wallet's preferred confirmation target is no longer fundable,
      // fall back to the minimum actionable replacement floor instead of
      // opening an acceleration modal that cannot proceed past the intro step.
      pickActionableInitialFeeRate({
        preferredFeeRate:
          isPushedButUnconfirmed &&
          replacementFeeRateFloor !== null &&
          replacementFeeRateFloor > maxFeeRate
            ? null
            : preferredInitialFeeRate,
        minimumActionableFeeRate:
          isPushedButUnconfirmed &&
          replacementFeeRateFloor !== null &&
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

  const handleInitUnfreeze = useCallback(() => {
    if (!txData) throw new Error('Cannot unfreeze non-existing selected tx');
    onInitUnfreeze(txData);
  }, [onInitUnfreeze, txData]);

  const timeLockTime = formatBlocks(lockBlocks, t, locale, true);

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
                  {isPushedButUnconfirmed
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
      {isPushedButUnconfirmed && !isLadderedVault && !hasFundingUtxos ? (
        <View>
          <Text className="text-base text-slate-600 pb-2 px-2">
            {t('wallet.vault.triggerUnfreeze.noReserveAvailableYet')}
          </Text>
        </View>
      ) : !feeEstimates ? (
        //loading...
        <ActivityIndicator />
      ) : isPushedButUnconfirmed &&
        replacementFeeRateFloor !== null &&
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
              ? t('wallet.vault.triggerUnfreeze.introAccelerate')
              : t('wallet.vault.triggerUnfreeze.intro', { timeLockTime })}
          </Text>
        </View>
      ) : step === 'fee' ? (
        <View>
          <Text className="text-base text-slate-600 pb-4 px-2">
            {t('wallet.vault.triggerUnfreeze.feeSelectorExplanation')}
          </Text>
          <View className="bg-slate-100 p-2 rounded-xl">
            {feeEstimates ? (
              <FeeInput
                {...(minimumSelectableFeeRate !== null
                  ? { min: minimumSelectableFeeRate }
                  : {})}
                btcFiat={btcFiat}
                feeEstimates={feeEstimates}
                initialValue={initialFeeRate!}
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
      ) : null}
    </Modal>
  );
};

export default InitUnfreeze;
