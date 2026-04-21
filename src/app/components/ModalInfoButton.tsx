import React, { useCallback, useState } from 'react';
import { Text, View } from 'react-native';
import { InfoButton, Modal, type IconType } from '../../common/ui';
import { useTranslation } from 'react-i18next';

export default function ModalInfoButton({
  title,
  icon,
  text,
  children,
  buttonContainerClassName = 'mt-0.5',
  textClassName = 'text-base pl-2 pr-2 text-slate-600'
}: {
  title: string;
  icon: IconType;
  text?: string;
  children?: React.ReactNode;
  buttonContainerClassName?: string;
  textClassName?: string;
}) {
  const [isVisible, setIsVisible] = useState(false);
  const show = useCallback(() => setIsVisible(true), []);
  const hide = useCallback(() => setIsVisible(false), []);
  const { t } = useTranslation();

  return (
    <>
      <View className={buttonContainerClassName}>
        <InfoButton onPress={show} />
      </View>
      <Modal
        title={title}
        icon={icon}
        isVisible={isVisible}
        onClose={hide}
        closeButtonText={t('understoodButton')}
      >
        {text !== undefined ? (
          <Text className={textClassName}>{text}</Text>
        ) : (
          children
        )}
      </Modal>
    </>
  );
}
