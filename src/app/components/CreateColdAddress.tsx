import React, { useState, useCallback, useEffect } from 'react';
import { Modal, Button } from '../../common/ui';
import { useTranslation } from 'react-i18next';
import Bip39 from './Bip39';
import ConfirmBip39 from '../components/ConfirmBip39';
import { networkMapping, type NetworkId } from '../lib/network';
import { generateMnemonic } from 'bip39';
import { View, Text } from 'react-native';

const CreateColdAddress = ({
  networkId,
  isVisible,
  onAddress,
  onClose
}: {
  networkId: NetworkId;
  onAddress: (address: string) => void;
  isVisible: boolean;
  onClose: () => void;
}) => {
  const { t } = useTranslation();
  const network = networkMapping[networkId];
  const [isConfirmBip39, setIsConfirmBip39] = useState<boolean>(false);
  const [words, setWords] = useState<string[]>(generateMnemonic().split(' '));

  const [step, setStep] = useState<'intro' | 'bip39'>('intro');
  const onWords = useCallback((words: Array<string>) => {
    setWords(words);
  }, []);

  useEffect(() => {
    if (!isVisible) setStep('intro');
  }, [isVisible]);

  const onBip39ConfirmationIsRequested = useCallback(() => {
    setIsConfirmBip39(true);
  }, []);
  const onBip39Cancel = useCallback(() => {
    setIsConfirmBip39(false);
  }, []);

  const onBip39Confirmed = useCallback(async () => {
    setIsConfirmBip39(false);
  }, []);
  console.log({ step });
  return (
    <>
      <Modal
        headerMini={true}
        isVisible={isVisible}
        title={t('addressInput.coldAddress.createNewModalTitle')}
        icon={{
          family: 'Ionicons',
          name: 'wallet'
        }}
        {...(step !== 'intro' ? { onClose } : {})}
      >
        {step === 'intro' ? (
          <View>
            <Text>TODO: Intro</Text>
            <Button onPress={() => setStep('bip39')}>
              {t('continueButton')}
            </Button>
          </View>
        ) : (
          <Bip39
            readonly
            hideWords={isConfirmBip39}
            onWords={onWords}
            words={words}
          />
        )}
      </Modal>
      {isConfirmBip39 && (
        <ConfirmBip39
          network={network}
          words={words}
          onConfirmed={onBip39Confirmed}
          onCancel={onBip39Cancel}
        />
      )}
    </>
  );
};

export default CreateColdAddress;
