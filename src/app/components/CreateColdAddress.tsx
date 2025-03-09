import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { Modal, Button, useToast, IconType } from '../../common/ui';
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
  const [words, setWords] = useState<string[]>(generateMnemonic().split(' '));

  const [step, setStep] = useState<'intro' | 'bip39' | 'bip39confirm'>('intro');
  const onWords = useCallback((words: Array<string>) => {
    setWords(words);
  }, []);

  //this is UX related not to show 2 Modals at the same time:
  //https://github.com/react-native-modal/react-native-modal?tab=readme-ov-file#i-cant-show-multiple-modals-one-after-another
  //There are 2 modals (one for Preview: 'intro' + 'bip39'; and <ConfirmBip39> is
  //another modal - which cannot be shown simultaneously)
  const [iIsPreviewModalHidden, setIsPreviewModalHidden] =
    useState<boolean>(true);
  const onPreviewModelHide = useCallback(() => {
    setIsPreviewModalHidden(true);
  }, []);

  useEffect(() => {
    if (!isVisible) {
      //reset it
      setWords(generateMnemonic().split(' '));
      setStep('intro');
      setIsPreviewModalHidden(true);
    } else setIsPreviewModalHidden(false);
  }, [isVisible]);

  const onBip39ConfirmationIsRequested = useCallback(() => {
    setStep('bip39confirm');
  }, []);
  const onBip39Cancel = useCallback(() => {
    onClose();
  }, [onClose]);
  const onBip39ConfirmedOrSkipped = useCallback(async () => {
    const coldAddress = await createColdAddress(words.join(' '), network);
    onAddress(coldAddress);
    toast.show(
      t('addressInput.coldAddress.newColdAddressSuccessfullyCreated'),
      { type: 'success', duration: 2000 }
    );
  }, [onAddress, network, words, toast, t]);

  const icon = useMemo<IconType>(
    () => ({ family: 'Ionicons', name: 'wallet' }),
    []
  );

  return (
    <>
      <Modal
        onModalHide={onPreviewModelHide}
        headerMini={true}
        isVisible={isVisible && step !== 'bip39confirm'}
        title={t('addressInput.coldAddress.createNewModalTitle')}
        icon={icon}
        onClose={onClose}
        customButtons={
          step === 'intro' ? (
            <View className="items-center gap-6 gap-y-4 flex-row flex-wrap justify-center pb-4">
              <Button mode="secondary" onPress={onClose}>
                {t('cancelButton')}
              </Button>
              <Button onPress={() => setStep('bip39')}>
                {t('continueButton')}
              </Button>
            </View>
          ) : step === 'bip39' ? (
            <View className="items-center gap-6 gap-y-4 flex-row flex-wrap justify-center pb-4">
              <Button mode="secondary" onPress={onClose}>
                {t('cancelButton')}
              </Button>
              <Button onPress={onBip39ConfirmationIsRequested}>
                {t('addressInput.coldAddress.confirmBip39ProposalButton')}
              </Button>
            </View>
          ) : undefined
        }
      >
        {step === 'intro' ? (
          <View>
            <Text className="text-base text-slate-600 pb-2 px-2">
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
      <ConfirmBip39
        network={network}
        isVisible={
          isVisible && step === 'bip39confirm' && iIsPreviewModalHidden
        }
        words={words}
        onConfirmedOrSkipped={onBip39ConfirmedOrSkipped}
        onCancel={onBip39Cancel}
      />
    </>
  );
};

export default CreateColdAddress;
