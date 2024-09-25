import React, { useState, useCallback } from 'react';
import { Text } from 'react-native';
import { Modal, Button } from '../../common/ui';
import { useTranslation } from 'react-i18next';

const LearnMoreAboutVaults = () => {
  const { t } = useTranslation();
  const [isVisible, setIsVisible] = useState(false);

  const openModal = useCallback(() => setIsVisible(true), []);
  const closeModal = useCallback(() => setIsVisible(false), []);

  return (
    <>
      <Button mode="text" onPress={openModal}>
        {t('learnMoreAboutVaults.link')}
      </Button>
      <Modal
        title={t('learnMoreAboutVaults.title')}
        icon={{ family: 'FontAwesome6', name: 'shield-halved' }}
        isVisible={isVisible}
        onClose={closeModal}
        closeButtonText={t('understoodButton')}
      >
        <Text className="text-base pl-2 pr-2 text-slate-600">
          {t('learnMoreAboutVaults.body')}
        </Text>
      </Modal>
    </>
  );
};

export default LearnMoreAboutVaults;
