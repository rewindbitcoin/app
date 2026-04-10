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
  findNextEqualOrLargerEffectiveFeeRate,
  getTriggerAccelerationFeeRateFloor,
  pickActionableInitialFeeRate,
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
    accounts,
    networkId,
    historyData,
    signers
  } = useWallet();
  // Cache to avoid flickering in the sliders while background refreshes happen.
  const btcFiat = useFirstDefinedValue<number>(btcFiatRealTime);
  const feeEstimates = useFirstDefinedValue<FeeEstimates>(feeEstimatesRealTime);
  // Minimum effective fee-rate floor required for acceleration.
  //
  // For Rewind2, a replacement child must satisfy two relay checks at once:
  // 1) the new package feerate must improve over the previous one, and
  // 2) the new child fee must be at least:
  //    previousChildFee + ceil(childVSize * 0.1 sat/vB)
  //
  // Example: if the previous child paid 584 sats and the replacement child
  // would be 160 vB, relay requires at least 584 + ceil(160 * 0.1) = 600 sats.
  // A new package can therefore look "faster" by feerate and still be
  // rejected if the child only pays, say, 590 sats.
  const feeRateToReplace = useMemo<number | null>(() => {
    if (!isAccelerationAttempt) return 0;
    if (isLegacyVault) {
      if (!vaultStatus?.triggerTxHex) return null;
      const { tx } = transactionFromHex(vaultStatus.triggerTxHex);
      const outValue = tx.outs[0]?.value;
      if (!tx || tx.outs.length !== 1 || !outValue)
        throw new Error('Invalid triggerTxHex');
      return (vault.vaultedAmount - toNumber(outValue)) / tx.virtualSize() + 1;
    } else {
      const triggerTxHex = vaultStatus?.triggerTxHex;
      if (!triggerTxHex) return null;
      const triggerTxData = vault.txMap[triggerTxHex];
      if (!triggerTxData) return null;
      const triggerCpfpTxHex = vaultStatus?.triggerCpfpTxHex;
      const signer = signers?.[0];
      if (!triggerCpfpTxHex || !signer || !networkId || !accounts) return null;
      const network = networkMapping[networkId];
      const triggerReserveUtxoData = getTriggerReserveUtxoData({
        vault,
        signer,
        network
      });
      return getTriggerAccelerationFeeRateFloor({
        parentTxHex: triggerTxHex,
        parentFee: triggerTxData.fee,
        previousChildTxHex: triggerCpfpTxHex,
        historyData,
        feeEstimates,
        mandatoryUtxosData: [triggerReserveUtxoData],
        childOutput: DUMMY_CHANGE_OUTPUT(
          getMainAccount(accounts, network),
          network
        )
      });
    }
  }, [
    isAccelerationAttempt,
    isLegacyVault,
    vaultStatus,
    vault,
    accounts,
    networkId,
    historyData,
    feeEstimates,
    signers
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

  const maxFeeRate = feeEstimates ? computeMaxAllowedFeeRate(feeEstimates) : 0;
  const { settings } = useSettings();
  if (!settings)
    throw new Error(
      'This component should only be started after settings has been retrieved from storage'
    );

  const [step, setStep] = useState<'intro' | 'fee'>('intro');

  const preferredInitialFeeRate =
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
    isLegacyVault && feeRateToReplace !== null && feeRateToReplace > maxFeeRate;

  const [feeRate, setFeeRate] = useState<number | null>(null);

  const buildTxDataForFeeRate = useCallback(
    (selectedFeeRate: number): VaultActionTxData | null => {
      if (isLegacyVault)
        return findNextEqualOrLargerEffectiveFeeRate(
          legacyTriggerSortedTxs,
          selectedFeeRate
        );
      else {
        const signer = signers?.[0];
        if (!networkId || !signer || !accounts) return null;
        const triggerTxHex = Object.keys(vault.triggerMap)[0];
        if (!triggerTxHex) return null;
        const triggerTxData = vault.txMap[triggerTxHex];
        if (!triggerTxData) throw new Error('trigger tx not mapped');
        const { tx } = transactionFromHex(triggerTxHex);
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
        if (isAccelerationAttempt) {
          const previousChildTxHex = vaultStatus?.triggerCpfpTxHex;
          if (!previousChildTxHex || !historyData?.length) return null;
        }
        const plan = estimateCpfpPackage({
          parentTxHex: triggerTxHex,
          parentFee: triggerTxData.fee,
          targetEffectiveFeeRate: selectedFeeRate,
          mandatoryUtxosData: [triggerReserveUtxoData],
          optionalUtxosData: [],
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
    },
    [
      isLegacyVault,
      legacyTriggerSortedTxs,
      accounts,
      networkId,
      vault,
      isAccelerationAttempt,
      vaultStatus?.triggerCpfpTxHex,
      historyData,
      signers
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
        minimumActionableFeeRate:
          !isAccelerationAttempt || cannotAccelerateMaxFee
            ? null
            : feeRateToReplace,
        canBuildAtFeeRate: feeRate => buildTxDataForFeeRate(feeRate) !== null
      }),
    [
      preferredInitialFeeRate,
      isAccelerationAttempt,
      cannotAccelerateMaxFee,
      feeRateToReplace,
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
                  {...(feeRateToReplace ? { min: feeRateToReplace } : {})}
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
