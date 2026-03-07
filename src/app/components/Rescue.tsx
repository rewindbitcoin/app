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
  pickFeeEstimate
} from '../lib/fees';
import { useSettings } from '../hooks/useSettings';
import {
  type Vault,
  type VaultStatus,
  estimateCpfpPackage,
  findMinimumReplacementEffectiveFeeRate,
  getSpendableUtxosData,
  getVaultMode
} from '../lib/vaults';
import { transactionFromHex } from '../lib/bitcoin';
import { useWallet } from '../hooks/useWallet';
import useFirstDefinedValue from '~/common/hooks/useFirstDefinedValue';
import { toNumber } from '../lib/sats';
import { DUMMY_CHANGE_OUTPUT, getMainAccount } from '../lib/vaultDescriptors';
import { networkMapping } from '../lib/network';
import {
  getPreviousCpfpChildData,
  findNextEqualOrLargerEffectiveFeeRate,
  getReplacementUtxosData,
  type VaultActionTxData
} from '../lib/vaultActionTx';

const Rescue = ({
  vault,
  vaultStatus,
  isVisible,
  onRescue,
  onClose
}: {
  vault: Vault;
  vaultStatus: VaultStatus | undefined;
  onRescue: (rescueData: VaultActionTxData) => void;
  isVisible: boolean;
  onClose: () => void;
}) => {
  const vaultMode = useMemo(() => getVaultMode(vault), [vault]);
  const isLegacyVault = vaultMode === 'LEGACY';
  const isAccelerationAttempt =
    !!vaultStatus?.panicPushTime || vaultStatus?.panicTxBlockHeight === 0;
  const { t } = useTranslation();
  const {
    feeEstimates: feeEstimatesRealTime,
    btcFiat: btcFiatRealTime,
    utxosData,
    vaultsStatuses,
    getUtxosDataFromTxos,
    accounts,
    networkId,
    historyData
  } = useWallet();
  // Cache to avoid flickering in the sliders while background refreshes happen.
  const btcFiat = useFirstDefinedValue<number>(btcFiatRealTime);
  const feeEstimates = useFirstDefinedValue<FeeEstimates>(feeEstimatesRealTime);
  const spendableUtxosData = useMemo(
    () =>
      utxosData
        ? getSpendableUtxosData(utxosData, vaultsStatuses, historyData)
        : undefined,
    [utxosData, vaultsStatuses, historyData]
  );

  const previousCpfpData = useMemo(() => {
    if (!isAccelerationAttempt || isLegacyVault) return null;
    const panicTxHex = vaultStatus?.panicTxHex;
    const panicCpfpTxHex = vaultStatus?.panicCpfpTxHex;
    if (!panicTxHex || !panicCpfpTxHex || !historyData?.length) return null;
    const panicTxData = vault.txMap[panicTxHex];
    if (!panicTxData) return null;
    return getPreviousCpfpChildData({
      parentTxHex: panicTxHex,
      parentFee: panicTxData.fee,
      previousChildTxHex: panicCpfpTxHex,
      historyData
    });
  }, [
    isAccelerationAttempt,
    isLegacyVault,
    vaultStatus?.panicTxHex,
    vaultStatus?.panicCpfpTxHex,
    vault,
    historyData
  ]);

  // Minimum fee-rate floor required for acceleration.
  //
  // For Rewind2 we must clear two different relay checks at once:
  // 1) package feerate must improve, and
  // 2) the new child must add enough absolute fee over the old child.
  //
  // This avoids a common confusing failure mode where the replacement looks
  // "faster" by feerate but still gets rejected for not adding enough sats.
  const feeRateToReplace = useMemo<number | null>(() => {
    if (!isAccelerationAttempt) return 0;
    if (isLegacyVault) {
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
      const panicTxHex = vaultStatus?.panicTxHex;
      if (!panicTxHex) return null;
      const panicTxData = vault.txMap[panicTxHex];
      if (!panicTxData) return null;
      if (!previousCpfpData || !spendableUtxosData || !accounts || !networkId)
        return null;
      const network = networkMapping[networkId];
      const changeOutput = DUMMY_CHANGE_OUTPUT(
        getMainAccount(accounts, network),
        network
      );
      const panicCpfpTxHex = vaultStatus?.panicCpfpTxHex;
      if (!panicCpfpTxHex || !historyData?.length) return null;
      const replacementUtxosData = getReplacementUtxosData({
        parentTxHex: panicTxHex,
        previousChildTxHex: panicCpfpTxHex,
        utxosData: spendableUtxosData,
        historyData,
        getUtxosDataFromTxos
      });
      if (!replacementUtxosData || !feeEstimates) return null;
      const replacementFloor = findMinimumReplacementEffectiveFeeRate({
        parentTxHex: panicTxHex,
        parentFee: panicTxData.fee,
        previousChildFee: previousCpfpData.childFee,
        mandatoryUtxosData: replacementUtxosData.mandatoryUtxosData,
        optionalUtxosData: replacementUtxosData.optionalUtxosData,
        changeOutput,
        maxTargetEffectiveFeeRate: computeMaxAllowedFeeRate(feeEstimates),
        minimumComparedEffectiveFeeRate: previousCpfpData.effectiveFeeRate + 1
      });
      return replacementFloor ?? null;
    }
  }, [
    isAccelerationAttempt,
    isLegacyVault,
    vaultStatus,
    vault,
    previousCpfpData,
    spendableUtxosData,
    accounts,
    networkId,
    historyData,
    getUtxosDataFromTxos,
    feeEstimates
  ]);

  const legacyRescueSortedTxs = useMemo(() => {
    if (!isLegacyVault) return [];
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
        const { tx } = transactionFromHex(txHex);
        return {
          parentTxHex: txHex,
          parentTxId: txData.txId,
          parentTxVSize: tx.virtualSize(),
          parentTxFee: txData.fee,
          effectiveFee: txData.fee,
          effectiveFeeRate: txData.feeRate
        };
      })
      .sort((a, b) => a.effectiveFeeRate - b.effectiveFeeRate);
  }, [vault, vaultStatus?.triggerTxHex, isVisible, isLegacyVault]);

  const maxFeeRate = feeEstimates ? computeMaxAllowedFeeRate(feeEstimates) : 0;
  const { settings } = useSettings();
  if (!settings)
    throw new Error(
      'This component should only be started after settings has been retrieved from storage'
    );

  const [step, setStep] = useState<'intro' | 'fee'>('intro');

  const initialFeeRate =
    feeEstimates && feeRateToReplace !== null
      ? Math.max(
          feeRateToReplace,
          pickFeeEstimate(feeEstimates, settings.INITIAL_CONFIRMATION_TIME)
            .feeEstimate
        )
      : null;

  const isAccelerationSyncPending =
    isAccelerationAttempt && feeRateToReplace === null;
  const cannotAccelerateMaxFee =
    feeRateToReplace !== null && feeRateToReplace > maxFeeRate;
  const canOpenFeeStepBase =
    initialFeeRate !== null &&
    !isAccelerationSyncPending &&
    !cannotAccelerateMaxFee;

  const [feeRate, setFeeRate] = useState<number | null>(null);

  const txData = useMemo<VaultActionTxData | null>(() => {
    const selectedFeeRate = feeRate ?? initialFeeRate;
    if (selectedFeeRate === null) return null;
    if (isLegacyVault)
      return findNextEqualOrLargerEffectiveFeeRate(
        legacyRescueSortedTxs,
        selectedFeeRate
      );
    else {
      if (
        !isVisible ||
        !spendableUtxosData ||
        !accounts ||
        Object.keys(accounts).length === 0 ||
        !networkId
      )
        return null;

      const triggerTxHex = vaultStatus?.triggerTxHex;
      if (!triggerTxHex) throw new Error('Vault has not been triggered');
      const rescueTxs = vault.triggerMap[triggerTxHex];
      if (!rescueTxs || rescueTxs.length === 0)
        throw new Error("Triggered vault doesn't have matching rescue txs");
      const rescueTxHex = rescueTxs[0];
      if (!rescueTxHex) throw new Error('Invalid rescue tx');
      const rescueTxData = vault.txMap[rescueTxHex];
      if (!rescueTxData) throw new Error('rescue tx not mapped');
      const { tx } = transactionFromHex(rescueTxHex);

      const network = networkMapping[networkId];
      const changeOutput = DUMMY_CHANGE_OUTPUT(
        getMainAccount(accounts, network),
        network
      );
      let mandatoryUtxosData = undefined;
      let optionalUtxosData = spendableUtxosData;
      if (isAccelerationAttempt) {
        const previousChildTxHex = vaultStatus?.panicCpfpTxHex;
        if (!previousChildTxHex || !historyData?.length) return null;
        const replacementUtxosData = getReplacementUtxosData({
          parentTxHex: rescueTxHex,
          previousChildTxHex,
          utxosData: spendableUtxosData,
          historyData,
          getUtxosDataFromTxos
        });
        if (!replacementUtxosData) return null;
        mandatoryUtxosData = replacementUtxosData.mandatoryUtxosData;
        optionalUtxosData = replacementUtxosData.optionalUtxosData;
      }
      const rewind2Plan = estimateCpfpPackage({
        parentTxHex: rescueTxHex,
        parentFee: rescueTxData.fee,
        targetEffectiveFeeRate: selectedFeeRate,
        ...(mandatoryUtxosData ? { mandatoryUtxosData } : {}),
        optionalUtxosData,
        changeOutput
      });
      if (!rewind2Plan) return null;
      return {
        parentTxHex: rescueTxHex,
        parentTxId: rescueTxData.txId,
        parentTxVSize: tx.virtualSize(),
        parentTxFee: rescueTxData.fee,
        effectiveFee: rewind2Plan.totalFee,
        effectiveFeeRate: rewind2Plan.effectiveFeeRate
      };
    }
  }, [
    feeRate,
    initialFeeRate,
    isLegacyVault,
    legacyRescueSortedTxs,
    isVisible,
    spendableUtxosData,
    getUtxosDataFromTxos,
    accounts,
    networkId,
    vault,
    vaultStatus?.triggerTxHex,
    isAccelerationAttempt,
    vaultStatus?.panicCpfpTxHex,
    historyData
  ]);

  const canOpenFeeStep = canOpenFeeStepBase && txData !== null;

  const fee = txData ? txData.effectiveFee : null;

  useEffect(() => {
    if (!isVisible) {
      setStep('intro');
    }
  }, [isVisible]);

  // Reset feeRate every time initialFeeRate changes, that is,
  // every time feeRateToReplace changes
  useEffect(() => {
    setFeeRate(prev =>
      initialFeeRate !== null && prev !== initialFeeRate ? initialFeeRate : prev
    );
  }, [initialFeeRate]);

  const handleRescue = useCallback(() => {
    if (!txData) throw new Error('Cannot rescue non-existing selected tx');
    onRescue(txData);
  }, [onRescue, txData]);

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
            ) : step === 'fee' && canOpenFeeStep ? (
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
        {!feeEstimates ? (
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
        ) : step === 'fee' && canOpenFeeStep ? (
          <View>
            <Text className="text-base text-slate-600 pb-4 px-2">
              {t('wallet.vault.rescue.feeSelectorExplanation')}
            </Text>
            <View className="bg-slate-100 p-2 rounded-xl">
              {feeEstimates ? (
                <FeeInput
                  {...(feeRateToReplace ? { min: feeRateToReplace } : {})}
                  btcFiat={btcFiat}
                  feeEstimates={feeEstimates}
                  initialValue={initialFeeRate!}
                  fee={fee}
                  label={t('wallet.vault.rescue.confirmationSpeedLabel')}
                  onValueChange={setFeeRate}
                />
              ) : (
                <ActivityIndicator />
              )}
            </View>
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
