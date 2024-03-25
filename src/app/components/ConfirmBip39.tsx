import React, { useState, useEffect } from 'react';
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
  ); // Initialize based on the length of correctWords

  useEffect(() => {
    // Perform the verification check whenever userWords changes
    if (JSON.stringify(userWords) === JSON.stringify(correctWords)) {
      onConfirmed(); // Invoke the callback when verification is successful
      setIsVisible(false); // Close the modal
    }
  }, [userWords, correctWords, onConfirmed]);

  const handleCancel = () => {
    onCancel(); // Invoke the cancel callback
    setIsVisible(false); // Close the modal
  };

  return (
    <Modal
      icon={{ family: 'MaterialIcons', name: 'format-list-numbered' }}
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
            <Pressable className="min-w-20 items-center py-3 px-5 rounded-lg bg-primary hover:opacity-90 active:opacity-90 active:scale-95">
              <Text className="text-sm font-semibold text-white">
                {t('skipButton')}
              </Text>
            </Pressable>
            <Pressable className="min-w-20 items-center py-3 px-5 rounded-lg bg-primary opacity-50">
              <Text className="text-sm font-semibold text-white">
                {t('verifyButton')}
              </Text>
            </Pressable>
          </View>
          {network &&
          (network === networks.testnet || network === networks.regtest) ? (
            <View className="h-4" />
          ) : (
            <Text className="text-sm self-center text-slate-500 mt-2 mb-2">
              {t('bip39.testingWalletsCanSkip')}
            </Text>
          )}
        </>
      }
    >
      <Bip39
        disableLengthChange
        words={userWords}
        onWords={setUserWords}
        readonly={false}
      />
    </Modal>
  );
};

export default ConfirmBip39;
