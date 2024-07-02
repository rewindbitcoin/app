import React, { useState, useContext, useCallback } from 'react';
import { Modal, Button } from '../../common/ui';
import { useTranslation } from 'react-i18next';
import { View, Text } from 'react-native';
import { WalletContext, WalletContextType } from '../contexts/WalletContext';
import type { Vault } from '../lib/vaults';
import { delegateVault } from '../lib/backup';

const Delegate = ({
  vault,
  isVisible,
  onClose
}: {
  vault: Vault;
  isVisible: boolean;
  onClose: () => void;
}) => {
  const [step, setStep] = useState<'intro' | 'fee'>('intro');
  const { t } = useTranslation();
  const context = useContext<WalletContextType | null>(WalletContext);
  if (context === null) throw new Error('Context was not set');

  const handleDelegateVault = useCallback(() => {
    const readmeText = t('walletHome.delegateReadme');
    const readme = readmeText.split('\n');

    delegateVault({ readme, vault });
  }, [t, vault]);

  return (
    isVisible && (
      <Modal
        headerMini={true}
        isVisible={true}
        title={t('wallet.vault.delegateButton')}
        icon={{
          family: 'MaterialCommunityIcons',
          name: 'alarm-light'
        }}
        onClose={onClose}
        customButtons={
          step === 'intro' ? (
            <View className="items-center gap-6 flex-row justify-center pb-4">
              <Button onPress={onClose}>{t('cancelButton')}</Button>
              <Button mode="primary-alert" onPress={() => setStep('fee')}>
                {t('continueButton')}
              </Button>
            </View>
          ) : step === 'fee' ? (
            <View className="items-center gap-6 flex-row justify-center pb-4">
              <Button onPress={onClose}>{t('cancelButton')}</Button>
              <Button mode="primary-alert" onPress={handleDelegateVault}>
                {t('wallet.vault.delegateButton')}
              </Button>
            </View>
          ) : undefined
        }
      >
        {step === 'intro' ? (
          <View>
            <Text className="text-slate-600 pb-2 px-2">
              {t('wallet.vault.delegate.intro', {
                panicAddress: vault.coldAddress
              })}
            </Text>
          </View>
        ) : step === 'fee' ? (
          <View>
            <Text className="text-slate-600 pb-4 px-2">
              {t('wallet.vault.delegate.feeSelectorExplanation')}
            </Text>
            <Text className="text-slate-600 pt-4 px-2">
              {t('wallet.vault.delegate.additionalExplanation', {
                timeLockTime: 0
              })}
            </Text>
          </View>
        ) : null}
      </Modal>
    )
  );
};

export default Delegate;
