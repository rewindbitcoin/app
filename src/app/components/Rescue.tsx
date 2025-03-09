import moize from 'moize';
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Modal, Button, ActivityIndicator } from '../../common/ui';
import { findLowestTrueBinarySearch } from '../../common/lib/binarySearch';
import { useTranslation } from 'react-i18next';
import { View, Text } from 'react-native';
import FeeInput from './FeeInput';
import { FeeEstimates, pickFeeEstimate } from '../lib/fees';
import { useSettings } from '../hooks/useSettings';
import type { TxHex, TxId, Vault, VaultStatus } from '../lib/vaults';
import { transactionFromHex } from '../lib/bitcoin';
import { useWallet } from '../hooks/useWallet';
import useFirstDefinedValue from '~/common/hooks/useFirstDefinedValue';

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
  const { settings } = useSettings();
  if (!settings)
    throw new Error(
      'This component should only be started after settings has been retrieved from storage'
    );

  const [step, setStep] = useState<'intro' | 'fee'>('intro');

  const initialFeeRate = feeEstimates
    ? pickFeeEstimate(feeEstimates, settings.INITIAL_CONFIRMATION_TIME)
        .feeEstimate
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

  useEffect(() => {
    if (initialFeeRate !== null) {
      setFeeRate(prevFeeRate =>
        prevFeeRate === null ? initialFeeRate : prevFeeRate
      );
    }
  }, [initialFeeRate]);

  const handleRescue = useCallback(() => {
    if (!txData) throw new Error('Cannot rescue non-existing selected tx');
    onRescue(txData);
  }, [onRescue, txData]);

  return (
    isVisible &&
    (initialFeeRate ? (
      <Modal
        headerMini={true}
        isVisible={true}
        title={t('wallet.vault.rescueButton')}
        icon={{
          family: 'MaterialCommunityIcons',
          name: 'alarm-light'
        }}
        onClose={onClose}
        customButtons={
          step === 'intro' ? (
            <View className="items-center gap-6 gap-y-4 flex-row flex-wrap justify-center pb-4">
              <Button mode="secondary" onPress={onClose}>
                {t('cancelButton')}
              </Button>
              <Button mode="primary-alert" onPress={() => setStep('fee')}>
                {t('imInDangerButton')}
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
        }
      >
        {step === 'intro' ? (
          <View>
            <Text className="text-base text-slate-600 pb-2 px-2">
              {t('wallet.vault.rescue.intro', {
                panicAddress: vault.coldAddress
              })}
            </Text>
          </View>
        ) : step === 'fee' ? (
          <View>
            <Text className="text-slate-600 pb-4 px-2">
              {t('wallet.vault.rescue.feeSelectorExplanation')}
            </Text>
            <View className="bg-slate-100 p-2 rounded-xl">
              {feeEstimates ? (
                <FeeInput
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
            <Text className="text-slate-600 pt-4 px-2">
              {t('wallet.vault.rescue.additionalExplanation', {
                timeLockTime: 0
              })}
            </Text>
          </View>
        ) : null}
      </Modal>
    ) : (
      <ActivityIndicator />
    ))
  );
};

export default Rescue;
