import React, { useState, useEffect, useContext } from 'react';
import { Modal, Button, ActivityIndicator } from '../../common/ui';
import { useTranslation } from 'react-i18next';
import { View, Text } from 'react-native';
import FeeInput from './FeeInput';
import { pickFeeEstimate } from '../lib/fees';
import { WalletContext, WalletContextType } from '../contexts/WalletContext';
import { useSettings } from '../hooks/useSettings';

const InitUnfreeze = ({
  isVisible,
  onInit,
  onClose
}: {
  onInit: () => void;
  isVisible: boolean;
  onClose: () => void;
}) => {
  const { t } = useTranslation();
  const context = useContext<WalletContextType | null>(WalletContext);
  if (context === null) throw new Error('Context was not set');
  const { feeEstimates } = context;
  const { settings } = useSettings();
  if (!settings)
    throw new Error(
      'This component should only be started after settings has been retrieved from storage'
    );

  const [step, setStep] = useState<'STEP1' | 'STEP2'>('STEP1');

  const initialFeeRate = feeEstimates
    ? pickFeeEstimate(feeEstimates, settings.INITIAL_CONFIRMATION_TIME)
    : null;

  const [feeRate, setFeeRate] = useState<number | null>(initialFeeRate);
  void feeRate;
  const txSize = 200; //TODO

  useEffect(() => {
    if (!isVisible) {
      setStep('STEP1');
    }
  }, [isVisible]);

  return (
    isVisible &&
    (initialFeeRate ? (
      <Modal
        headerMini={true}
        isVisible={true}
        title={t('TODO')}
        icon={{
          family: 'Ionicons',
          name: 'wallet'
        }}
        onClose={onClose}
        customButtons={
          step === 'STEP1' ? (
            <View className="items-center gap-6 flex-row justify-center pb-4">
              <Button onPress={onClose}>{t('cancelButton')}</Button>
              <Button onPress={() => setStep('STEP2')}>{t('TODO')}</Button>
            </View>
          ) : step === 'STEP2' ? (
            <View className="items-center gap-6 flex-row justify-center pb-4">
              <Button onPress={onClose}>{t('cancelButton')}</Button>
              <Button onPress={onInit}>{t('TODO Init')}</Button>
            </View>
          ) : undefined
        }
      >
        {step === 'STEP1' ? (
          <View>
            <Text className="text-slate-600 pb-2">
              {t('addressInput.coldAddress.intro')}
            </Text>
          </View>
        ) : step === 'STEP2' ? (
          <View>
            <FeeInput
              initialValue={initialFeeRate}
              txSize={txSize}
              label={t('vaultSetup.confirmationSpeedLabel')}
              onValueChange={setFeeRate}
            />
          </View>
        ) : null}
      </Modal>
    ) : (
      <ActivityIndicator />
    ))
  );
};

export default InitUnfreeze;
