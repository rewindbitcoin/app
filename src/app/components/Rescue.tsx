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
import { useSettings } from '../hooks/useSettings';
import type { TxHex, TxId, Vault, VaultStatus } from '../lib/vaults';
import { transactionFromHex } from '../lib/bitcoin';
import { useWallet } from '../hooks/useWallet';
import useFirstDefinedValue from '~/common/hooks/useFirstDefinedValue';
import { satsToNumber } from '../lib/sats';

export type RescueData = {
  txHex: TxHex;
  txId: TxId;
  fee: number;
  feeRate: number;
  vSize: number;
};

/**
 * Finds the component in rescueSortedTxs with the next equal or larger feeRate.
 *
 * @param rescueSortedTxs - The search space
 * @param {number} feeRate - The fee rate to search for.
 * returns {object|null} The transaction data with the next equal or larger feeRate, or null if not found.
 */
const findNextEqualOrLargerFeeRate = moize(
  (rescueSortedTxs: Array<RescueData>, feeRate: number) => {
    const result = findLowestTrueBinarySearch(
      rescueSortedTxs.length - 1,
      index => rescueSortedTxs[index]!.feeRate >= feeRate,
      100 //100 iterations at most
    );
    if (result.value !== undefined) return rescueSortedTxs[result.value]!;
    else return null;
  },
  { maxSize: 200 } //Let the Slider show around 200 points
);

const Rescue = ({
  vault,
  vaultStatus,
  isVisible,
  onRescue,
  onClose
}: {
  vault: Vault;
  vaultStatus: VaultStatus | undefined;
  onRescue: (rescueData: RescueData) => void;
  isVisible: boolean;
  onClose: () => void;
}) => {
  // zero if this is not a RBF, and => 1 if this is InitUnfreeze
  // isVisibletrying to do a RBF of a prev one
  const feeRateToReplace = useMemo(() => {
    if (!vaultStatus?.triggerTxHex || !vaultStatus?.panicTxHex) return 0;
    else {
      const { tx: triggerTx } = transactionFromHex(vaultStatus.triggerTxHex);
      const { tx: panicTx } = transactionFromHex(vaultStatus.panicTxHex);
      const triggerOutValue = triggerTx.outs[0]?.value;
      if (!triggerTx || triggerTx.outs.length !== 1 || !triggerOutValue)
        throw new Error('Invalid triggerTxHex');
      const panicOutValue = panicTx.outs[0]?.value;
      if (!panicTx || panicTx.outs.length !== 1 || !panicOutValue)
        throw new Error('Invalid panicTxHex');
      return (
        (satsToNumber(triggerOutValue, 'trigger out value') -
          satsToNumber(panicOutValue, 'panic out value')) /
        panicTx.virtualSize()
      );
    }
  }, [vaultStatus?.triggerTxHex, vaultStatus?.panicTxHex]);

  const rescueSortedTxs = useMemo(() => {
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
        return { ...txData, vSize: tx.virtualSize(), txHex };
      })
      .sort((a, b) => a.feeRate - b.feeRate);
  }, [vault, vaultStatus?.triggerTxHex, isVisible]);

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
    feeRate && findNextEqualOrLargerFeeRate(rescueSortedTxs, feeRate);
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
                      <Button
                        mode="primary-alert"
                        onPress={() => setStep('fee')}
                      >
                        {feeRateToReplace
                          ? t('accelerateButton')
                          : t('imInDangerButton')}
                      </Button>
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
                ? t('wallet.vault.rescue.introAccelerate')
                : t('wallet.vault.rescue.intro', {
                    panicAddress: vault.coldAddress
                  })}
            </Text>
          </View>
        ) : step === 'fee' ? (
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
                  initialValue={initialFeeRate}
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
