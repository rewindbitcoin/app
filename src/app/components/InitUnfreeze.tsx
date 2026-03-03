// Copyright (C) 2025 Jose-Luis Landabaso - https://rewindbitcoin.com
// Licensed under the GNU GPL v3 or later. See the LICENSE file for details.

import moize from 'moize';
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Modal, Button, ActivityIndicator } from '../../common/ui';
import { findLowestTrueBinarySearch } from '../../common/lib/binarySearch';
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
  type TxHex,
  type TxId,
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

export type InitUnfreezeData = {
  txHex: TxHex;
  txId: TxId;
  fee: number;
  feeRate: number;
  vSize: number;
  parentFee?: number;
};

/**
 * Finds the component in triggerSortedTxs with the next equal or larger feeRate.
 *
 * @param triggerSortedTxs - The search space
 * @param {number} feeRate - The fee rate to search for.
 * returns {object|null} The transaction data with the next equal or larger feeRate, or null if not found.
 */
const findNextEqualOrLargerFeeRate = moize(
  (triggerSortedTxs: Array<InitUnfreezeData>, feeRate: number) => {
    const result = findLowestTrueBinarySearch(
      triggerSortedTxs.length - 1,
      index => triggerSortedTxs[index]!.feeRate >= feeRate,
      100 //100 iterations at most
    );
    if (result.value !== undefined) return triggerSortedTxs[result.value]!;
    else return null;
  },
  { maxSize: 200 } //Let the Slider show around 200 points
);

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
  onInitUnfreeze: (initUnfreezeData: InitUnfreezeData) => void;
  lockBlocks: number;
  isVisible: boolean;
  onClose: () => void;
}) => {
  const { locale } = useLocalization();
  const vaultMode = useMemo(() => getVaultMode(vault), [vault]);
  const isLegacyVault = vaultMode === 'LEGACY';
  const isAccelerationAttempt = !!vaultStatus?.triggerTxHex;

  // zero if this is not a RBF, and => 1 if this is InitUnfreeze
  // trying to do a RBF of a prev one
  const feeRateToReplace = useMemo(() => {
    if (!isAccelerationAttempt) return 0;
    if (isLegacyVault) {
      if (!vaultStatus?.triggerTxHex) return 0;
      const { tx } = transactionFromHex(vaultStatus.triggerTxHex);
      const outValue = tx.outs[0]?.value;
      if (!tx || tx.outs.length !== 1 || !outValue)
        throw new Error('Invalid triggerTxHex');
      return (vault.vaultedAmount - toNumber(outValue)) / tx.virtualSize();
    }
    const triggerTxHex = vaultStatus?.triggerTxHex;
    if (!triggerTxHex) return 0;
    const triggerTxData = vault.txMap[triggerTxHex];
    if (!triggerTxData) return 0;
    const { tx } = transactionFromHex(triggerTxHex);
    return triggerTxData.fee / tx.virtualSize();
  }, [
    isAccelerationAttempt,
    isLegacyVault,
    vaultStatus?.triggerTxHex,
    vault.vaultedAmount,
    vault
  ]);

  const triggerSortedTxs = useMemo(() => {
    if (!isLegacyVault) return [];
    return Object.entries(vault.triggerMap)
      .map(([triggerTxHex]) => {
        const txData = vault.txMap[triggerTxHex];
        if (!txData) throw new Error('trigger tx not mapped');
        const { tx } = transactionFromHex(triggerTxHex);
        return { ...txData, vSize: tx.virtualSize(), txHex: triggerTxHex };
      })
      .sort((a, b) => a.feeRate - b.feeRate);
  }, [vault, isLegacyVault]);

  const rewind2TriggerTx = useMemo(() => {
    if (isLegacyVault) return null;
    const triggerTxHex = Object.keys(vault.triggerMap)[0];
    if (!triggerTxHex) return null;
    const txData = vault.txMap[triggerTxHex];
    if (!txData) throw new Error('trigger tx not mapped');
    const { tx } = transactionFromHex(triggerTxHex);
    return {
      ...txData,
      vSize: tx.virtualSize(),
      txHex: triggerTxHex
    };
  }, [vault, isLegacyVault]);

  const { t } = useTranslation();
  const {
    feeEstimates: feeEstimatesRealTime,
    btcFiat: btcFiatRealTime,
    utxosData,
    accounts,
    networkId
  } = useWallet();

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

  const initialFeeRate = feeEstimates
    ? Math.max(
        feeRateToReplace + 1,
        pickFeeEstimate(feeEstimates, settings.INITIAL_CONFIRMATION_TIME)
          .feeEstimate
      )
    : null;

  const [feeRate, setFeeRate] = useState<number | null>(null);

  const rewind2Plan = useMemo(() => {
    if (
      isLegacyVault ||
      feeRate === null ||
      !rewind2TriggerTx ||
      !utxosData ||
      !accounts ||
      Object.keys(accounts).length === 0 ||
      !networkId
    )
      return null;
    const network = networkMapping[networkId];
    const changeOutput = DUMMY_CHANGE_OUTPUT(
      getMainAccount(accounts, network),
      network
    );
    return estimateCpfpPackage({
      parentTxHex: rewind2TriggerTx.txHex,
      parentFee: rewind2TriggerTx.fee,
      targetEffectiveFeeRate: feeRate,
      utxosData,
      changeOutput
    });
  }, [
    isLegacyVault,
    feeRate,
    rewind2TriggerTx,
    utxosData,
    accounts,
    networkId
  ]);

  const txData: InitUnfreezeData | null =
    feeRate === null
      ? null
      : isLegacyVault
        ? (findNextEqualOrLargerFeeRate(triggerSortedTxs, feeRate) ?? null)
        : rewind2TriggerTx && rewind2Plan
          ? {
              ...rewind2TriggerTx,
              parentFee: rewind2TriggerTx.fee,
              fee: rewind2Plan.totalFee,
              feeRate: rewind2Plan.effectiveFeeRate
            }
          : null;
  const fee = feeRate === null ? null : txData && txData.fee;

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
        {
          //loading... (no buttons)
          ...(!initialFeeRate ||
          //cannot RBF
          feeRateToReplace + 1 > maxFeeRate
            ? {}
            : {
                customButtons:
                  step === 'intro' ? (
                    <View className="items-center gap-6 gap-y-4 flex-row flex-wrap justify-center pb-4">
                      <Button mode="secondary" onPress={onClose}>
                        {t('cancelButton')}
                      </Button>
                      <Button onPress={() => setStep('fee')}>
                        {isAccelerationAttempt
                          ? t('accelerateButton')
                          : t('continueButton')}
                      </Button>
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
              })
        }
      >
        {!initialFeeRate ? (
          //loading...
          <ActivityIndicator />
        ) : feeRateToReplace + 1 > maxFeeRate ? (
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
                  {...(feeRateToReplace ? { min: feeRateToReplace + 1 } : {})}
                  btcFiat={btcFiat}
                  feeEstimates={feeEstimates}
                  initialValue={initialFeeRate}
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
