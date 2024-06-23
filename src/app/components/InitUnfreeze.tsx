import moize from 'moize';
import React, {
  useState,
  useEffect,
  useContext,
  useMemo,
  useCallback
} from 'react';
import { Modal, Button, ActivityIndicator } from '../../common/ui';
import { findLowestTrueBinarySearch } from '../../common/lib/binarySearch';
import { useTranslation } from 'react-i18next';
import { View, Text } from 'react-native';
import FeeInput from './FeeInput';
import { pickFeeEstimate } from '../lib/fees';
import { formatBlocks } from '../lib/format';
import { WalletContext, WalletContextType } from '../contexts/WalletContext';
import { useSettings } from '../hooks/useSettings';
import type { TxHex, TxId, Vault } from '../lib/vaults';
import { Transaction } from 'bitcoinjs-lib';

export type InitUnfreezeData = {
  txHex: TxHex;
  txId: TxId;
  fee: number;
  feeRate: number;
  vSize: number;
};

/**
 * n
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
  { maxSize: 200 } //Assume the Slider shows around 200 points
);

const InitUnfreeze = ({
  vault,
  isVisible,
  lockBlocks,
  onInit,
  onClose
}: {
  vault: Vault;
  onInit: (initUnfreezeData: InitUnfreezeData) => void;
  lockBlocks: number;
  isVisible: boolean;
  onClose: () => void;
}) => {
  const triggerSortedTxs = useMemo(() => {
    return Object.entries(vault.triggerMap)
      .map(([triggerTxHex]) => {
        const txData = vault.txMap[triggerTxHex];
        if (!txData) throw new Error('trigger tx not mapped');
        const tx = Transaction.fromHex(triggerTxHex);
        return { ...txData, vSize: tx.virtualSize(), txHex: triggerTxHex };
      })
      .sort((a, b) => a.feeRate - b.feeRate);
  }, [vault]);

  const { t } = useTranslation();
  const context = useContext<WalletContextType | null>(WalletContext);
  if (context === null) throw new Error('Context was not set');
  const { feeEstimates } = context;
  const { settings } = useSettings();
  if (!settings)
    throw new Error(
      'This component should only be started after settings has been retrieved from storage'
    );

  const [step, setStep] = useState<'intro' | 'fee'>('intro');

  const initialFeeRate = feeEstimates
    ? pickFeeEstimate(feeEstimates, settings.INITIAL_CONFIRMATION_TIME)
    : null;

  const [feeRate, setFeeRate] = useState<number | null>(null);

  const txData =
    feeRate && findNextEqualOrLargerFeeRate(triggerSortedTxs, feeRate);
  const txSize = feeRate === null ? null : txData && txData.vSize;

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

  const handleInitUnfreeze = useCallback(() => {
    if (!txData || !txSize)
      throw new Error('Cannot unfreeze non-existing selected tx');
    onInit(txData);
  }, [onInit, txData, txSize]);

  const timeLockTime = formatBlocks(lockBlocks, t, true);

  return (
    isVisible &&
    (initialFeeRate ? (
      <Modal
        headerMini={true}
        isVisible={true}
        title={t('wallet.vault.triggerUnfreezeButton')}
        icon={{
          family: 'MaterialCommunityIcons',
          name: 'snowflake-melt'
        }}
        onClose={onClose}
        customButtons={
          step === 'intro' ? (
            <View className="items-center gap-6 flex-row justify-center pb-4">
              <Button onPress={onClose}>{t('cancelButton')}</Button>
              <Button onPress={() => setStep('fee')}>
                {t('continueButton')}
              </Button>
            </View>
          ) : step === 'fee' ? (
            <View className="items-center gap-6 flex-row justify-center pb-4">
              <Button onPress={onClose}>{t('cancelButton')}</Button>
              <Button onPress={handleInitUnfreeze} disabled={!txSize}>
                {t('wallet.vault.triggerUnfreezeButton')}
              </Button>
            </View>
          ) : undefined
        }
      >
        {step === 'intro' ? (
          <View>
            <Text className="text-slate-600 pb-2 px-2">
              {t('wallet.vault.triggerUnfreeze.intro', { timeLockTime })}
            </Text>
          </View>
        ) : step === 'fee' ? (
          <View>
            <Text className="text-slate-600 pb-4 px-2">
              {t('wallet.vault.triggerUnfreeze.feeSelectorExplanation')}
            </Text>
            <View className="bg-slate-100 p-2 rounded-xl">
              <FeeInput
                initialValue={initialFeeRate}
                txSize={txSize}
                label={t('wallet.vault.triggerUnfreeze.confirmationSpeedLabel')}
                onValueChange={setFeeRate}
              />
            </View>
            <Text className="text-slate-600 pt-4 px-2">
              {t('wallet.vault.triggerUnfreeze.additionalExplanation', {
                timeLockTime
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

export default InitUnfreeze;
