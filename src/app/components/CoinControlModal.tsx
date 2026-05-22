// Copyright (C) 2026 Jose-Luis Landabaso - https://rewindbitcoin.com
// Licensed under the GNU GPL v3 or later. See the LICENSE file for details.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Button, IconType, Modal } from '../../common/ui';

type CoinControlModalProps = {
  isVisible: boolean;
  onClose: () => void;
  onModalHide?: () => void;
};

const CoinControlModal = ({
  isVisible,
  onClose,
  onModalHide
}: CoinControlModalProps) => {
  const { t } = useTranslation();
  const [step, setStep] = useState<'intro' | 'coinselect'>('intro');

  useEffect(() => {
    if (!isVisible) setStep('intro');
  }, [isVisible]);

  const icon = useMemo<IconType>(
    () => ({ family: 'FontAwesome5', name: 'coins' }),
    []
  );
  const handleContinue = useCallback(() => setStep('coinselect'), []);

  return (
    <Modal
      headerMini={true}
      isVisible={isVisible}
      title={t('coinControl.title')}
      icon={icon}
      onClose={onClose}
      {...(onModalHide ? { onModalHide } : {})}
      customButtons={
        step === 'intro' ? (
          <View className="items-center gap-6 gap-y-4 flex-row flex-wrap justify-center pb-4">
            <Button mode="secondary" onPress={onClose}>
              {t('cancelButton')}
            </Button>
            <Button onPress={handleContinue}>{t('continueButton')}</Button>
          </View>
        ) : (
          <View className="items-center gap-6 gap-y-4 flex-row flex-wrap justify-center pb-4">
            <Button mode="secondary" onPress={onClose}>
              {t('cancelButton')}
            </Button>
          </View>
        )
      }
    >
      {step === 'intro' ? (
        <Text className="text-base text-slate-600 px-2 pb-4">
          {t('coinControl.intro')}
        </Text>
      ) : (
        <Text className="text-base text-slate-600 px-2 pb-4">
          {t('coinControl.coinselectPlaceholder')}
        </Text>
      )}
    </Modal>
  );
};

export default React.memo(CoinControlModal);
