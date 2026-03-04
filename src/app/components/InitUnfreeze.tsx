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
import { formatBlocks } from '../lib/format';
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
import { useLocalization } from '../hooks/useLocalization';
import { toNumber } from '../lib/sats';
import { DUMMY_CHANGE_OUTPUT, getMainAccount } from '../lib/vaultDescriptors';
import { networkMapping } from '../lib/network';
import { toHex } from 'uint8array-tools';
import {
  findNextEqualOrLargerEffectiveFeeRate,
  getReplacementNonAnchorTxos,
  type VaultActionTxData
} from '../lib/vaultActionTx';

const InitUnfreeze = ({
  vault,
  vaultStatus,
  isVisible,
  lockBlocks,
  onInitUnfreeze,
  onClose
}: {
  vault: Vault;
  vaultStatus: VaultStatus | undefined;
  onInitUnfreeze: (initUnfreezeData: VaultActionTxData) => void;
  lockBlocks: number;
  isVisible: boolean;
  onClose: () => void;
}) => {
  const { locale } = useLocalization();
  const vaultMode = useMemo(() => getVaultMode(vault), [vault]);
  const isLegacyVault = vaultMode === 'LEGACY';
  const isAccelerationAttempt =
    !!vaultStatus?.triggerPushTime || vaultStatus?.triggerTxBlockHeight === 0;
  const { t } = useTranslation();
  const {
    feeEstimates: feeEstimatesRealTime,
    btcFiat: btcFiatRealTime,
    utxosData,
    getUtxosDataFromTxos,
    accounts,
    networkId,
    historyData
  } = useWallet();

  // Exact minimum fee-rate floor required for acceleration.
  // zero if this is the first unfreeze attempt (not acceleration)
  //
  // Non-legacy acceleration must use the previous effective package fee rate
  // (parent + existing CPFP child). If we cannot derive it exactly from synced
  // data yet, return null and hide the Accelerate CTA until sync catches up.
  const feeRateToReplace = useMemo<number | null>(() => {
    if (!isAccelerationAttempt) return 0;
    if (isLegacyVault) {
      if (!vaultStatus?.triggerTxHex) return null;
      const { tx } = transactionFromHex(vaultStatus.triggerTxHex);
      const outValue = tx.outs[0]?.value;
      if (!tx || tx.outs.length !== 1 || !outValue)
        throw new Error('Invalid triggerTxHex');
      return (vault.vaultedAmount - toNumber(outValue)) / tx.virtualSize();
    } else {
      //compute the effectiveFeeRate
      const triggerTxHex = vaultStatus?.triggerTxHex;
      if (!triggerTxHex) return null;
      const triggerTxData = vault.txMap[triggerTxHex];
      if (!triggerTxData) return null;
      const { tx } = transactionFromHex(triggerTxHex);
      const triggerCpfpTxHex = vaultStatus?.triggerCpfpTxHex;
      if (!triggerCpfpTxHex || !historyData?.length) return null;
      const { tx: triggerCpfpTx } = transactionFromHex(triggerCpfpTxHex);
      const triggerAnchorOutput = tx.outs[1];
      if (!triggerAnchorOutput) return null;

      const txById = new Map(historyData.map(item => [item.txId, item.tx]));
      const parentTxId = tx.getId();
      let childInputValue = BigInt(0);

      for (const input of triggerCpfpTx.ins) {
        const prevTxId = toHex(Uint8Array.from(input.hash).reverse());
        if (prevTxId === parentTxId && input.index === 1) {
          childInputValue += triggerAnchorOutput.value;
          continue;
        }
        const prevTx = txById.get(prevTxId);
        const prevOut = prevTx?.outs[input.index];
        if (!prevOut) return null;
        childInputValue += prevOut.value;
      }

      const childOutputValue = triggerCpfpTx.outs.reduce(
        (sum, output) => sum + output.value,
        BigInt(0)
      );
      if (childInputValue <= childOutputValue) return null;
      const childFee = Number(childInputValue - childOutputValue);
      return (
        (triggerTxData.fee + childFee) /
        (tx.virtualSize() + triggerCpfpTx.virtualSize())
      );
    }
  }, [
    isAccelerationAttempt,
    isLegacyVault,
    vaultStatus?.triggerTxHex,
    vaultStatus?.triggerCpfpTxHex,
    vault,
    historyData
  ]);

  const legacyTriggerSortedTxs = useMemo(() => {
    if (!isLegacyVault) return [];
    return Object.entries(vault.triggerMap)
      .map(([triggerTxHex]) => {
        const txData = vault.txMap[triggerTxHex];
        if (!txData) throw new Error('trigger tx not mapped');
        const { tx } = transactionFromHex(triggerTxHex);
        return {
          parentTxHex: triggerTxHex,
          parentTxId: txData.txId,
          parentTxVSize: tx.virtualSize(),
          parentTxFee: txData.fee,
          effectiveFee: txData.fee,
          effectiveFeeRate: txData.feeRate
        };
      })
      .sort((a, b) => a.effectiveFeeRate - b.effectiveFeeRate);
  }, [vault, isLegacyVault]);

  //Cache to avoid flickering in the Sliders
  const btcFiat = useFirstDefinedValue<number>(btcFiatRealTime);
  const feeEstimates = useFirstDefinedValue<FeeEstimates>(feeEstimatesRealTime);
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
          feeRateToReplace + 1,
          pickFeeEstimate(feeEstimates, settings.INITIAL_CONFIRMATION_TIME)
            .feeEstimate
        )
      : null;

  const isAccelerationSyncPending =
    isAccelerationAttempt && feeRateToReplace === null;
  const cannotAccelerateMaxFee =
    feeRateToReplace !== null && feeRateToReplace + 1 > maxFeeRate;
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
        legacyTriggerSortedTxs,
        selectedFeeRate
      );
    else {
      if (
        !utxosData ||
        !accounts ||
        Object.keys(accounts).length === 0 ||
        !networkId
      )
        return null;
      const triggerTxHex = Object.keys(vault.triggerMap)[0];
      if (!triggerTxHex) return null;
      const triggerTxData = vault.txMap[triggerTxHex];
      if (!triggerTxData) throw new Error('trigger tx not mapped');
      const { tx } = transactionFromHex(triggerTxHex);
      const network = networkMapping[networkId];
      const changeOutput = DUMMY_CHANGE_OUTPUT(
        getMainAccount(accounts, network),
        network
      );
      let candidateUtxosData = utxosData;
      if (isAccelerationAttempt) {
        const previousChildTxHex = vaultStatus?.triggerCpfpTxHex;
        if (!previousChildTxHex || !historyData?.length) return null;
        const replacementTxos = getReplacementNonAnchorTxos({
          parentTxHex: triggerTxHex,
          previousChildTxHex
        });
        candidateUtxosData = getUtxosDataFromTxos(replacementTxos);
        if (candidateUtxosData.length !== replacementTxos.length) return null;
      }
      const plan = estimateCpfpPackage({
        parentTxHex: triggerTxHex,
        parentFee: triggerTxData.fee,
        targetEffectiveFeeRate: selectedFeeRate,
        utxosData: candidateUtxosData,
        changeOutput
      });
      if (!plan) return null;
      return {
        parentTxHex: triggerTxHex,
        parentTxId: triggerTxData.txId,
        parentTxVSize: tx.virtualSize(),
        parentTxFee: triggerTxData.fee,
        effectiveFee: plan.totalFee,
        effectiveFeeRate: plan.effectiveFeeRate
      };
    }
  }, [
    feeRate,
    initialFeeRate,
    isLegacyVault,
    legacyTriggerSortedTxs,
    utxosData,
    getUtxosDataFromTxos,
    accounts,
    networkId,
    vault,
    isAccelerationAttempt,
    vaultStatus?.triggerCpfpTxHex,
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

  const handleInitUnfreeze = useCallback(() => {
    if (!txData) throw new Error('Cannot unfreeze non-existing selected tx');
    onInitUnfreeze(txData);
  }, [onInitUnfreeze, txData]);

  const timeLockTime = formatBlocks(lockBlocks, t, locale, true);

  return (
    isVisible && (
      <Modal
        headerMini={true}
        isVisible={true}
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
                    {isAccelerationAttempt
                      ? t('accelerateButton')
                      : t('continueButton')}
                  </Button>
                )}
              </View>
            ) : step === 'fee' && canOpenFeeStep ? (
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
                ? t('wallet.vault.triggerUnfreeze.introAccelerate')
                : t('wallet.vault.triggerUnfreeze.intro', { timeLockTime })}
            </Text>
          </View>
        ) : step === 'fee' && canOpenFeeStep ? (
          <View>
            <Text className="text-base text-slate-600 pb-4 px-2">
              {t('wallet.vault.triggerUnfreeze.feeSelectorExplanation')}
            </Text>
            <View className="bg-slate-100 p-2 rounded-xl">
              {feeEstimates ? (
                <FeeInput
                  {...(feeRateToReplace ? { min: feeRateToReplace + 1 } : {})}
                  btcFiat={btcFiat}
                  feeEstimates={feeEstimates}
                  initialValue={initialFeeRate!}
                  fee={fee}
                  label={t(
                    'wallet.vault.triggerUnfreeze.confirmationSpeedLabel'
                  )}
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
    )
  );
};

export default InitUnfreeze;
