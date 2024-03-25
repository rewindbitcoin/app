import React, { useState, useEffect } from 'react';
import { View } from 'react-native';
import { Modal, Text } from '../../common/ui';
import Bip39 from './Bip39';
import { useTranslation } from 'react-i18next';

interface ConfirmBip39Props {
  words: Array<string>; // The correct mnemonic words to verify against
  onConfirmed: () => void; // Callback when the mnemonic is correctly verified
  onCancel: () => void; // Callback when the user cancels verification
}

const ConfirmBip39: React.FC<ConfirmBip39Props> = ({
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
      hideCloseButton
    >
      <View>
        <Bip39
          disableLengthChange
          words={userWords}
          onWords={setUserWords}
          readonly={false}
        />
      </View>
    </Modal>
  );
};

export default ConfirmBip39;
