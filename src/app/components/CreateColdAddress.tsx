import React, { useState, useCallback, useEffect } from 'react';
import { Modal, Button, useToast } from '../../common/ui';
import { useTranslation } from 'react-i18next';
import Bip39 from './Bip39';
import ConfirmBip39 from '../components/ConfirmBip39';
import { networkMapping, type NetworkId } from '../lib/network';
import { generateMnemonic } from 'bip39';
import { View, Text } from 'react-native';
import { createColdAddress } from '../lib/vaultDescriptors';

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
  const toast = useToast();
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
      //reset it
      setWords(generateMnemonic().split(' '));
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
    const coldAddress = await createColdAddress(words.join(' '), network);
    onAddress(coldAddress);
    toast.show(
      t('addressInput.coldAddress.newColdAddressSuccessfullyCreated'),
      {
        type: 'success'
      }
    );
  }, [onAddress, network, words, toast, t]);
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
            onClose={onClose}
            customButtons={
              step === 'intro' ? (
                <View className="items-center gap-6 flex-row justify-center pb-4">
                  <Button onPress={onClose}>{t('cancelButton')}</Button>
                  <Button onPress={() => setStep('bip39')}>
                    {t('continueButton')}
                  </Button>
                </View>
              ) : step === 'bip39' ? (
                <View className="items-center gap-6 flex-row justify-center pb-4">
                  <Button onPress={onClose}>{t('cancelButton')}</Button>
                  <Button onPress={onBip39ConfirmationIsRequested}>
                    {t('addressInput.coldAddress.confirmBip39ProposalButton')}
                  </Button>
                </View>
              ) : undefined
            }
          >
            {step === 'intro' ? (
              <View>
                <Text className="text-slate-600 pb-2">
                  {t('addressInput.coldAddress.intro')}
                </Text>
              </View>
            ) : (
              <View>
                <Text className="native:text-sm web:text-xs text-slate-600 pb-4">
                  {t('addressInput.coldAddress.bip39Proposal')}
                </Text>
                <Bip39 readonly onWords={onWords} words={words} />
                <Text className="native:text-sm web:text-xs text-slate-600 pt-4">
                  {t('addressInput.coldAddress.bip39ProposalPart2')}
                </Text>
              </View>
            )}
          </Modal>
        )}
      </>
    )
  );
};

export default CreateColdAddress;
