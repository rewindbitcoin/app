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
  const [isBip39ConfirmationRequested, setIsBip39ConfirmationRequested] =
    useState<boolean>(false);
  const [words, setWords] = useState<string[]>(generateMnemonic().split(' '));

  const [step, setStep] = useState<'intro' | 'bip39'>('intro');
  const onWords = useCallback((words: Array<string>) => {
    setWords(words);
  }, []);

  useEffect(() => {
    if (!isVisible) {
      setStep('intro');
      setIsBip39ConfirmationRequested(false);
    }
  }, [isVisible]);

  const onBip39ConfirmationIsRequested = useCallback(() => {
    setIsBip39ConfirmationRequested(true);
  }, []);
  const onBip39Cancel = useCallback(() => {
    onClose();
  }, [onClose]);
  const onBip39Confirmed = useCallback(async () => {
    onAddress('TODO: COMPUTE ONE from WORDS');
  }, [onAddress]);
  console.log({ step });
  return (
    isVisible && (
      <>
        {isBip39ConfirmationRequested ? (
          <ConfirmBip39
            network={network}
            words={words}
            onConfirmed={onBip39Confirmed}
            onCancel={onBip39Cancel}
          />
        ) : (
          <Modal
            headerMini={true}
            isVisible={true}
            title={t('addressInput.coldAddress.createNewModalTitle')}
            icon={{
              family: 'Ionicons',
              name: 'wallet'
            }}
          >
            {step === 'intro' ? (
              <View>
                <Text>TODO: Intro</Text>
                <Button onPress={() => setStep('bip39')}>
                  {t('continueButton')}
                </Button>
              </View>
            ) : (
              <View>
                <Bip39 readonly onWords={onWords} words={words} />
                <Button onPress={onBip39ConfirmationIsRequested}>
                  {t('continueButton')}
                </Button>
              </View>
            )}
          </Modal>
        )}
      </>
    )
  );
};

export default CreateColdAddress;
