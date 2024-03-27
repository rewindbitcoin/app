import React, { useState, useCallback } from 'react';
import { Pressable, View } from 'react-native';
import { Modal, Text } from '../../common/ui';
import Bip39 from './Bip39';
import { useTranslation } from 'react-i18next';
import { networks, type Network } from 'bitcoinjs-lib';

interface ConfirmBip39Props {
  network?: Network;
  words: Array<string>; // The correct mnemonic words to verify against
  onConfirmed: () => void; // Callback when the mnemonic is correctly verified
  onCancel: () => void; // Callback when the user cancels verification
}

const ConfirmBip39: React.FC<ConfirmBip39Props> = ({
  network,
  words: correctWords,
  onConfirmed,
  onCancel
}) => {
  const { t } = useTranslation();
  const [isVisible, setIsVisible] = useState(true);
  const [userWords, setUserWords] = useState<Array<string>>(
    Array(correctWords.length).fill('')
  );

  const handleCancel = useCallback(() => {
    onCancel();
    setIsVisible(false);
  }, [onCancel]);

  const onWords = useCallback(
    (words: string[]) => {
      if (JSON.stringify(words) === JSON.stringify(correctWords)) {
        setIsVisible(false);
        onConfirmed();
      }
      setUserWords(words);
    },
    [correctWords, onConfirmed]
  );

  const canSkip =
    network && (network === networks.testnet || network === networks.regtest);

  return (
    <Modal
      icon={{ family: 'MaterialIcons', name: 'playlist-add-check-circle' }}
      isVisible={isVisible}
      title={t('bip39.confirmTitle')}
      subTitle={t('bip39.confirmText')}
      onClose={handleCancel}
      customButtons={
        <>
          <View className="items-center gap-6 flex-row justify-center">
            <Pressable
              className="min-w-20 items-center py-3 px-5 rounded-lg bg-primary hover:opacity-90 active:opacity-90 active:scale-95"
              onPress={handleCancel}
            >
              <Text className="text-sm font-semibold text-white">
                {t('cancelButton')}
              </Text>
            </Pressable>
            {canSkip && (
              <Pressable
                className="min-w-20 items-center py-3 px-5 rounded-lg bg-primary hover:opacity-90 active:opacity-90 active:scale-95"
                onPress={onConfirmed}
              >
                <Text className="text-sm font-semibold text-white">
                  {t('skipButton')}
                </Text>
              </Pressable>
            )}
            <Pressable className="min-w-20 items-center py-3 px-5 rounded-lg bg-primary opacity-50">
              <Text className="text-sm font-semibold text-white">
                {t('verifyButton')}
              </Text>
            </Pressable>
          </View>
          {canSkip ? (
            <Text className="text-sm self-center text-slate-500 mt-2 mb-2">
              {t('bip39.testingWalletsCanSkip')}
            </Text>
          ) : (
            <View className="h-4" />
          )}
        </>
      }
    >
      <Bip39
        disableLengthChange
        words={userWords}
        onWords={onWords}
        readonly={false}
      />
    </Modal>
  );
};

export default ConfirmBip39;
