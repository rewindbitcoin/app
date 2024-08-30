import React, { useState, useCallback, useEffect } from 'react';
import { View } from 'react-native';
import { Modal, Text, Button } from '../../common/ui';
import Bip39, { validateMnemonic } from './Bip39';
import { useTranslation } from 'react-i18next';
import { networks, type Network } from 'bitcoinjs-lib';

interface ConfirmBip39Props {
  network?: Network;
  words: Array<string>; // The correct mnemonic words to verify against
  onConfirmed: () => Promise<void>; // Callback when the mnemonic is correctly verified
  onCancel: () => void; // Callback when the user cancels verification
}

const ConfirmBip39: React.FC<ConfirmBip39Props> = ({
  network,
  words: correctWords,
  onConfirmed,
  onCancel
}) => {
  const { t } = useTranslation();
  const [validWordsThatDontMatch, setValidWordsThatDontMatch] = useState(false);
  const [userWords, setUserWords] = useState<Array<string>>(
    Array(correctWords.length).fill('')
  );
  const [isSkipping, setIsSkipping] = useState<boolean>(false);
  const [isConfirming, setIsConfirming] = useState<boolean>(false);

  const handleConfirm = useCallback(() => setIsConfirming(true), []);
  // Effect to execute `onConfirmed` after `isConfirming` is true
  // This ensures `onConfirmed` is called on the next render cycle
  // after the loading spinner on the Button is rendered
  useEffect(() => {
    // Use setTimeout to defer the `onConfirmed` call to the next event loop cycle
    // Otherwise the spinner is shown but does not move... (it's stuck)
    if (isConfirming) setTimeout(onConfirmed, 0);
  }, [isConfirming, onConfirmed]);
  //Same considerations as handleConfirm
  const handleSkip = useCallback(() => setIsSkipping(true), []);
  useEffect(() => {
    if (isSkipping) setTimeout(onConfirmed, 0);
  }, [isSkipping, onConfirmed]);

  const onWords = useCallback(
    (words: string[]) => {
      if (JSON.stringify(words) === JSON.stringify(correctWords)) {
        handleConfirm();
      } else if (validateMnemonic(words.join(' '))) {
        //words do not match but are valid!?!?!
        setValidWordsThatDontMatch(true);
      }
      setUserWords(words);
    },
    [correctWords, handleConfirm]
  );

  const canSkip =
    network && (network === networks.testnet || network === networks.regtest);

  return (
    <Modal
      icon={{ family: 'MaterialIcons', name: 'playlist-add-check-circle' }}
      isVisible={true}
      title={t('bip39.confirmTitle')}
      headerMini
      {...(isConfirming || isSkipping ? {} : { onClose: onCancel })}
      customButtons={
        <>
          <View className="items-center gap-6 flex-row justify-center">
            <Button disabled={isConfirming || isSkipping} onPress={onCancel}>
              {t('cancelButton')}
            </Button>
            {canSkip && (
              <Button
                loading={isSkipping}
                disabled={isConfirming}
                onPress={handleSkip}
              >
                {t('skipButton')}
              </Button>
            )}
            <Button disabled loading={isConfirming}>
              {t('verifyButton')}
            </Button>
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
        <Text className="text-center text-orange-600 native:text-sm web:text-xs pt-2">
          {t('bip39.validWordsThatDontMatch')}
        </Text>
      )}
    </Modal>
  );
};

export default ConfirmBip39;
