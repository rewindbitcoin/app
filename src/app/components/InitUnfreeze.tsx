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
  getTriggerReserveUtxoData,
  getVaultMode
} from '../lib/vaults';
import { transactionFromHex } from '../lib/bitcoin';
import { useWallet } from '../hooks/useWallet';
import useFirstDefinedValue from '~/common/hooks/useFirstDefinedValue';
import { useLocalization } from '../hooks/useLocalization';
import { toNumber } from '../lib/sats';
import { DUMMY_CHANGE_OUTPUT, getMainAccount } from '../lib/vaultDescriptors';
import { networkMapping } from '../lib/network';
import {
  findMinimumActionableFeeRate,
  findNextEqualOrLargerActionFeeRate,
  getCpfpReplacementFeeRateFloor,
  pickActionableInitialFeeRate,
  type VaultActionTxData
} from '../lib/vaultActionTx';

const getP2ATriggerInfo = (
  vault: Vault
):
  | {
      txHex: string;
      fee: number;
      feeRate: number;
    }
  | null => {
  const triggerTxHex = Object.keys(vault.triggerMap)[0];
  if (!triggerTxHex) return null;
  const triggerTxData = vault.txMap[triggerTxHex];
  if (!triggerTxData) return null;
  return {
    txHex: triggerTxHex,
    fee: triggerTxData.fee,
    feeRate: triggerTxData.feeRate
  };
};

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
  const isLadderedVault = vaultMode === 'LADDERED';
  const isAccelerationAttempt =
    !!vaultStatus?.triggerPushTime || vaultStatus?.triggerTxBlockHeight === 0;
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
  // Minimum effective fee-rate floor required only when replacing an already
  // existing fee-bump child. `null` means we cannot compute that floor yet.
  const replacementFeeRateFloor = useMemo<number | null>(() => {
    if (!isAccelerationAttempt) return null;
    if (isLadderedVault) {
      if (!vaultStatus?.triggerTxHex) return null;
      const { tx } = transactionFromHex(vaultStatus.triggerTxHex);
      const outValue = tx.outs[0]?.value;
      if (!tx || tx.outs.length !== 1 || !outValue)
        throw new Error('Invalid triggerTxHex');
      return (vault.vaultedAmount - toNumber(outValue)) / tx.virtualSize() + 1;
    } else {
      const triggerInfo = getP2ATriggerInfo(vault);
      if (!triggerInfo) return null;
      const triggerCpfpTxHex = vaultStatus?.triggerCpfpTxHex;
      const signer = signers?.[0];
      if (!triggerCpfpTxHex || !signer || !networkId || !accounts) return null;
      const network = networkMapping[networkId];
      const triggerReserveUtxoData = getTriggerReserveUtxoData({
        vault,
        signer,
        network
      });
      return getCpfpReplacementFeeRateFloor({
        parentTxHex: triggerInfo.txHex,
        parentFee: triggerInfo.fee,
        previousChildTxHex: triggerCpfpTxHex,
        historyData,
        feeEstimates,
        utxosData: [triggerReserveUtxoData],
        childOutput: DUMMY_CHANGE_OUTPUT(
          getMainAccount(accounts, network),
          network
        )
      });
    }
  }, [
    isAccelerationAttempt,
    isLadderedVault,
    vaultStatus,
    vault,
    accounts,
    networkId,
    historyData,
    feeEstimates,
    signers
  ]);

  const ladderedTriggerSortedTxs = useMemo(() => {
    if (!isLadderedVault) return [];
    return Object.entries(vault.triggerMap)
      .map(([triggerTxHex]) => {
        const txData = vault.txMap[triggerTxHex];
        if (!txData) throw new Error('trigger tx not mapped');
        return {
          parentTxHex: triggerTxHex,
          parentTxFee: txData.fee,
          actionFee: txData.fee,
          actionFeeRate: txData.feeRate
        };
      })
      .sort((a, b) => a.actionFeeRate - b.actionFeeRate);
  }, [vault, isLadderedVault]);

  const maxFeeRate = feeEstimates ? computeMaxAllowedFeeRate(feeEstimates) : 0;
  const { settings } = useSettings();
  if (!settings)
    throw new Error(
      'This component should only be started after settings has been retrieved from storage'
    );

  const [step, setStep] = useState<'intro' | 'fee'>('intro');

  const preferredInitialFeeRate = useMemo(() => {
    if (!feeEstimates) return null;
    const preferredNetworkFeeRate = pickFeeEstimate(
      feeEstimates,
      settings.INITIAL_CONFIRMATION_TIME
    ).feeEstimate;
    if (!isAccelerationAttempt) return preferredNetworkFeeRate;
    if (replacementFeeRateFloor === null) return null;
    return Math.max(replacementFeeRateFloor, preferredNetworkFeeRate);
  }, [
    feeEstimates,
    settings.INITIAL_CONFIRMATION_TIME,
    isAccelerationAttempt,
    replacementFeeRateFloor
  ]);

  const isAccelerationSyncPending =
    isAccelerationAttempt && replacementFeeRateFloor === null;
  const cannotAccelerateMaxFee =
    isAccelerationAttempt &&
    replacementFeeRateFloor !== null &&
    replacementFeeRateFloor > maxFeeRate;

  const [feeRate, setFeeRate] = useState<number | null>(null);

  const buildTxDataForFeeRate = useCallback(
    (selectedFeeRate: number): VaultActionTxData | null => {
      if (isLadderedVault)
        return findNextEqualOrLargerActionFeeRate(
          ladderedTriggerSortedTxs,
          selectedFeeRate
        );
      else {
        const signer = signers?.[0];
        if (!networkId || !signer || !accounts) return null;
        const triggerInfo = getP2ATriggerInfo(vault);
        if (!triggerInfo) return null;
        const network = networkMapping[networkId];
        const triggerReserveUtxoData = getTriggerReserveUtxoData({
          vault,
          signer,
          network
        });
        const changeOutput = DUMMY_CHANGE_OUTPUT(
          getMainAccount(accounts, network),
          network
        );
        // Trigger fee bumping is reserve-only by design: always reuse this
        // vault's dedicated reserve UTXO as the only non-anchor input and send
        // any leftover value back through normal wallet change.
        if (isAccelerationAttempt) {
          const previousChildTxHex = vaultStatus?.triggerCpfpTxHex;
          if (!previousChildTxHex || !historyData?.length) return null;
        }
        const plan = estimateCpfpPackage({
          parentTxHex: triggerInfo.txHex,
          parentFee: triggerInfo.fee,
          targetEffectiveFeeRate: selectedFeeRate,
          utxosData: [triggerReserveUtxoData],
          changeOutput
        });
        if (!plan) return null;
        return {
          parentTxHex: triggerInfo.txHex,
          parentTxFee: triggerInfo.fee,
          actionFee: plan.totalFee,
          actionFeeRate: plan.effectiveFeeRate
        };
      }
    },
    [
      isLadderedVault,
      ladderedTriggerSortedTxs,
      accounts,
      networkId,
      vault,
      isAccelerationAttempt,
      vaultStatus?.triggerCpfpTxHex,
      historyData,
      signers
    ]
  );

  const minimumSelectableFeeRate = useMemo(() => {
    if (isLadderedVault)
      return isAccelerationAttempt
        ? replacementFeeRateFloor
        : (ladderedTriggerSortedTxs[0]?.actionFeeRate ?? MIN_FEE_RATE);
    if (isAccelerationAttempt) return replacementFeeRateFloor;
    return findMinimumActionableFeeRate({
      minimumFeeRate: MIN_FEE_RATE,
      maximumFeeRate: maxFeeRate,
      canBuildAtFeeRate: feeRate => buildTxDataForFeeRate(feeRate) !== null
    });
  }, [
    isLadderedVault,
    isAccelerationAttempt,
    replacementFeeRateFloor,
    ladderedTriggerSortedTxs,
    maxFeeRate,
    buildTxDataForFeeRate
  ]);

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

  useEffect(() => {
    if (!isVisible) {
      setStep('intro');
    }
  }, [isVisible]);

  // Reset feeRate every time the selected initial fee changes.
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
