import React, { useState, useCallback } from 'react';
import { View, Text, Pressable, Linking } from 'react-native';
import { Modal, Button } from '../../common/ui';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { batchedUpdates } from '~/common/lib/batchedUpdates';

interface TermsModalProps {
  isVisible: boolean;
  onAccept: () => void;
  onClose: () => void;
  onModalHide?: () => void;
}

const TermsModal: React.FC<TermsModalProps> = ({
  isVisible,
  onAccept,
  onClose,
  onModalHide
}) => {
  const { t } = useTranslation();
  const [checkboxStates, setCheckboxStates] = useState([
    false,
    false,
    false,
    false,
    false
  ]);

  const handleCheckboxToggle = useCallback((index: number) => {
    setCheckboxStates(prevStates => {
      const newStates = [...prevStates];
      newStates[index] = !newStates[index];
      return newStates;
    });
  }, []);

  const allCheckboxesChecked = checkboxStates.every(Boolean);

  const handleClose = useCallback(() => {
    batchedUpdates(() => {
      setCheckboxStates([false, false, false, false, false]);
      onClose();
    });
  }, [onClose]);

  return (
    <Modal
      title={t('termsModal.title')}
      subTitle={t('termsModal.intro')}
      icon={{
        family: 'MaterialCommunityIcons',
        name: 'file-document-outline'
      }}
      isVisible={isVisible}
      {...(onModalHide && { onModalHide })}
      onClose={handleClose}
      customButtons={
        <View className="items-center w-full pb-4 px-4">
          <Button
            mode="primary"
            disabled={!allCheckboxesChecked}
            onPress={onAccept}
          >
            {t('termsModal.continueButton')}
          </Button>
        </View>
      }
    >
      <View className="gap-y-3">
        {[
          t('termsModal.checkbox1'),
          t('termsModal.checkbox2'),
          t('termsModal.checkbox3'),
          t('termsModal.checkbox4')
        ].map((label, index) => (
          <Pressable
            key={index}
            onPress={() => handleCheckboxToggle(index)}
            className="flex-row items-start py-1"
          >
            <MaterialCommunityIcons
              name={
                checkboxStates[index]
                  ? 'checkbox-marked-outline'
                  : 'checkbox-blank-outline'
              }
              size={24}
              className="text-primary mr-3 mt-0.5"
            />
            <Text className="flex-1 text-sm">{label}</Text>
          </Pressable>
        ))}
        <Pressable
          onPress={() => handleCheckboxToggle(4)}
          className="flex-row items-start py-1"
        >
          <MaterialCommunityIcons
            name={
              checkboxStates[4]
                ? 'checkbox-marked-outline'
                : 'checkbox-blank-outline'
            }
            size={24}
            className="text-primary mr-3 mt-0.5"
          />
          <Text className="flex-1 text-sm">
            {t('termsModal.checkbox5_part1')}{' '}
            <Text
              className="text-primary underline"
              onPress={() => Linking.openURL('https://rewindbitcoin.com/terms')}
            >
              {t('termsModal.termsLink')}
            </Text>{' '}
            {t('termsModal.checkbox5_part2')}{' '}
            <Text
              className="text-primary underline"
              onPress={() =>
                Linking.openURL('https://rewindbitcoin.com/privacy')
              }
            >
              {t('termsModal.privacyLink')}
            </Text>
            {t('termsModal.checkbox5_part3')}
          </Text>
        </Pressable>
        <Text className="text-center text-xs text-slate-600 mt-2">
          {t('termsModal.agreementNotice')}
        </Text>
      </View>
    </Modal>
  );
};

export default React.memo(TermsModal);
