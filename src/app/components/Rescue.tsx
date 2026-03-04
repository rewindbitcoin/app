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
  getVaultMode
} from '../lib/vaults';
import { transactionFromHex } from '../lib/bitcoin';
import { useWallet } from '../hooks/useWallet';
import useFirstDefinedValue from '~/common/hooks/useFirstDefinedValue';
import { toNumber } from '../lib/sats';
import { DUMMY_CHANGE_OUTPUT, getMainAccount } from '../lib/vaultDescriptors';
import { networkMapping } from '../lib/network';
import { toHex } from 'uint8array-tools';
import {
  findNextEqualOrLargerEffectiveFeeRate,
  getReplacementNonAnchorTxos,
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
    getUtxosDataFromTxos,
    accounts,
    networkId,
    historyData
  } = useWallet();

  // Exact minimum fee-rate floor required for acceleration.
  // zero if this is the first rescue attempt (not acceleration)
  //
  // Non-legacy acceleration must use the previous effective package fee rate
  // (parent + existing CPFP child). If we cannot derive it exactly from synced
  // data yet, return null and hide the Accelerate CTA until sync catches up.
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
        panicTx.virtualSize()
      );
    } else {
      //compute the effectiveFeeRate
      const panicTxHex = vaultStatus?.panicTxHex;
      if (!panicTxHex) return null;
      const panicTxData = vault.txMap[panicTxHex];
      if (!panicTxData) return null;
      const { tx } = transactionFromHex(panicTxHex);
      const panicCpfpTxHex = vaultStatus?.panicCpfpTxHex;
      if (!panicCpfpTxHex || !historyData?.length) return null;
      const { tx: panicCpfpTx } = transactionFromHex(panicCpfpTxHex);
      const panicAnchorOutput = tx.outs[1];
      if (!panicAnchorOutput) return null;

      const txById = new Map(historyData.map(item => [item.txId, item.tx]));
      const parentTxId = tx.getId();
      let childInputValue = BigInt(0);

      for (const input of panicCpfpTx.ins) {
        const prevTxId = toHex(Uint8Array.from(input.hash).reverse());
        if (prevTxId === parentTxId && input.index === 1) {
          childInputValue += panicAnchorOutput.value;
          continue;
        }
        const prevTx = txById.get(prevTxId);
        const prevOut = prevTx?.outs[input.index];
        if (!prevOut) return null;
        childInputValue += prevOut.value;
      }

      const childOutputValue = panicCpfpTx.outs.reduce(
        (sum, output) => sum + output.value,
        BigInt(0)
      );
      if (childInputValue <= childOutputValue) return null;
      const childFee = Number(childInputValue - childOutputValue);
      return (
        (panicTxData.fee + childFee) /
        (tx.virtualSize() + panicCpfpTx.virtualSize())
      );
    }
  }, [
    isAccelerationAttempt,
    isLegacyVault,
    vaultStatus?.triggerTxHex,
    vaultStatus?.panicTxHex,
    vaultStatus?.panicCpfpTxHex,
    vault,
    historyData
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
        legacyRescueSortedTxs,
        selectedFeeRate
      );
    else {
      if (
        !isVisible ||
        !utxosData ||
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
      let candidateUtxosData = utxosData;
      if (isAccelerationAttempt) {
        const previousChildTxHex = vaultStatus?.panicCpfpTxHex;
        if (!previousChildTxHex || !historyData?.length) return null;
        const replacementTxos = getReplacementNonAnchorTxos({
          parentTxHex: rescueTxHex,
          previousChildTxHex
        });
        candidateUtxosData = getUtxosDataFromTxos(replacementTxos);
        if (candidateUtxosData.length !== replacementTxos.length) return null;
      }
      const rewind2Plan = estimateCpfpPackage({
        parentTxHex: rescueTxHex,
        parentFee: rescueTxData.fee,
        targetEffectiveFeeRate: selectedFeeRate,
        utxosData: candidateUtxosData,
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
    utxosData,
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
                  {...(feeRateToReplace ? { min: feeRateToReplace + 1 } : {})}
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
