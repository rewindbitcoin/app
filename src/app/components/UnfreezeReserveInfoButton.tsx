import React, { useCallback, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { InfoButton, Modal, type IconType } from '../../common/ui';

export default function UnfreezeReserveInfoButton() {
  const [isVisible, setIsVisible] = useState(false);
  const show = useCallback(() => setIsVisible(true), []);
  const hide = useCallback(() => setIsVisible(false), []);
  const { t } = useTranslation();
  const icon = useMemo<IconType>(
    () => ({ family: 'FontAwesome5', name: 'coins' }),
    []
  );

  return (
    <>
      <View className="mt-0.5">
        <InfoButton onPress={show} />
      </View>
      <Modal
        title={t('vaultSetup.unfreezeReserveHelpTitle')}
        icon={icon}
        isVisible={isVisible}
        onClose={hide}
        closeButtonText={t('understoodButton')}
      >
        <Text className="pl-2 pr-2 text-base text-slate-600">
          {t('vaultSetup.unfreezeReserveHelp')}
        </Text>
      </Modal>
    </>
  );
}
