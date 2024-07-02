import React, { useContext, useCallback } from 'react';
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
          family: 'FontAwesome5',
          name: 'hands-helping'
        }}
        onClose={onClose}
        customButtons={
          <View className="items-center gap-6 flex-row justify-center pb-4">
            <Button onPress={onClose}>{t('cancelButton')}</Button>
            <Button mode="primary" onPress={handleDelegateVault}>
              {t('wallet.vault.delegateButton')}
            </Button>
          </View>
        }
      >
        <View>
          <Text className="text-slate-600 pb-2 px-2">
            {t('wallet.vault.delegate.intro', {
              panicAddress: vault.coldAddress
            })}
          </Text>
        </View>
      </Modal>
    )
  );
};

export default Delegate;
