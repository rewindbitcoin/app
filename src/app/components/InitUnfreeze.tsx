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
import type { TxHex, TxId, Vault, VaultStatus } from '../lib/vaults';
import { transactionFromHex } from '../lib/bitcoin';
import { useWallet } from '../hooks/useWallet';
import useFirstDefinedValue from '~/common/hooks/useFirstDefinedValue';
import { useLocalization } from '../hooks/useLocalization';
import { toNumber } from '../lib/sats';

export type InitUnfreezeData = {
  txHex: TxHex;
  txId: TxId;
  fee: number;
  feeRate: number;
  vSize: number;
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

  // zero if this is not a RBF, and => 1 if this is InitUnfreeze
  // isVisibletrying to do a RBF of a prev one
  const feeRateToReplace = useMemo(() => {
    if (!vaultStatus?.triggerTxHex) return 0;
    else {
      const { tx } = transactionFromHex(vaultStatus.triggerTxHex);
      const outValue = tx.outs[0]?.value;
      if (!tx || tx.outs.length !== 1 || !outValue)
        throw new Error('Invalid triggerTxHex');
      return (
        (vault.vaultedAmount - toNumber(outValue)) /
        tx.virtualSize()
      );
    }
  }, [vaultStatus?.triggerTxHex, vault.vaultedAmount]);

  const triggerSortedTxs = useMemo(() => {
    return Object.entries(vault.triggerMap)
      .map(([triggerTxHex]) => {
        const txData = vault.txMap[triggerTxHex];
        if (!txData) throw new Error('trigger tx not mapped');
        const { tx } = transactionFromHex(triggerTxHex);
        return { ...txData, vSize: tx.virtualSize(), txHex: triggerTxHex };
      })
      .sort((a, b) => a.feeRate - b.feeRate);
  }, [vault]);

  const { t } = useTranslation();
  const { feeEstimates: feeEstimatesRealTime, btcFiat: btcFiatRealTime } =
    useWallet();

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

  const txData =
    feeRate && findNextEqualOrLargerFeeRate(triggerSortedTxs, feeRate);
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
                        {feeRateToReplace
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
              {feeRateToReplace
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
