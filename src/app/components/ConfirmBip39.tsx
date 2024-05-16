import React, { useState, useCallback } from 'react';
import { View } from 'react-native';
import { Modal, Text, Button } from '../../common/ui';
import Bip39, { validateMnemonic } from './Bip39';
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
  const [validWordsThatDontMatch, setValidWordsThatDontMatch] = useState(false);
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
      } else if (validateMnemonic(words.join(' '))) {
        //words do not match but are valid!?!?!
        setValidWordsThatDontMatch(true);
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
      headerMini
      onClose={handleCancel}
      customButtons={
        <>
          <View className="items-center gap-6 flex-row justify-center">
            <Button onPress={handleCancel}>{t('cancelButton')}</Button>
            {canSkip && (
              <Button onPress={onConfirmed}>{t('skipButton')}</Button>
            )}
            <Button disabled>{t('verifyButton')}</Button>
          </View>
          {canSkip ? (
            <Text className="native:text-sm web:text-xs self-center text-slate-600 mt-2 mb-2">
              {t('bip39.testingWalletsCanSkip')}
            </Text>
          ) : (
            <View className="h-4" />
          )}
        </>
      }
    >
      <Text className="px-2 pb-4 native:text-sm web:text-xs text-slate-600">
        {t('bip39.confirmText')}
      </Text>
      <Bip39
        disableLengthChange
        words={userWords}
        onWords={onWords}
        readonly={false}
        autoFocus={
          //turn it off, so that the user gets the change to read the subtitle -
          //not hidden by the keyboard
          false
        }
      />
      {validWordsThatDontMatch && (
        <Text className="text-center text-amber-600 native:text-sm web:text-xs pt-2">
          {t('bip39.validWordsThatDontMatch')}
        </Text>
      )}
    </Modal>
  );
};

export default ConfirmBip39;
