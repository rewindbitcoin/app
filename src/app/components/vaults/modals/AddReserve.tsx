// Copyright (C) 2026 Jose-Luis Landabaso - https://rewindbitcoin.com
// Licensed under the GNU GPL v3 or later. See the LICENSE file for details.

import React, { useCallback } from 'react';
import { View, Text } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useTranslation } from 'react-i18next';
import { Button, Modal, useToast } from '../../../../common/ui';

const AddReserve = ({
  role,
  vaultMode,
  address,
  isVisible,
  onClose
}: {
  role: 'TRIGGER' | 'RESCUE';
  vaultMode: 'P2A_TRUC' | 'P2A_NON_TRUC';
  address: string;
  isVisible: boolean;
  onClose: () => void;
}) => {
  const { t } = useTranslation();
  const toast = useToast();
  const onClipboard = useCallback(() => {
    Clipboard.setStringAsync(address);
    toast.show(t('receive.clipboard'), { type: 'success', duration: 2000 });
  }, [address, t, toast]);

  const title =
    role === 'TRIGGER'
      ? t('wallet.vault.addReserve.triggerTitle')
      : t('wallet.vault.addReserve.rescueTitle');
  const intro =
    role === 'TRIGGER'
      ? t('wallet.vault.addReserve.triggerIntro')
      : t('wallet.vault.addReserve.rescueIntro');

  return (
    <Modal
      headerMini
      title={title}
      icon={{ family: 'FontAwesome5', name: 'coins' }}
      isVisible={isVisible}
      onClose={onClose}
      closeButtonText={t('closeButton')}
    >
      <View>
        <Text className="text-base text-slate-600 pb-4 px-2">{intro}</Text>
        {vaultMode === 'P2A_TRUC' && (
          <Text className="text-base text-slate-600 pb-4 px-2">
            {t('wallet.vault.addReserve.trucConfirmationNote')}
          </Text>
        )}
        <Text className="native:text-sm web:text-xs uppercase text-slate-500 pb-2 px-2 font-semibold">
          {t('wallet.vault.addReserve.addressLabel')}
        </Text>
        <Button
          mode="text"
          textClassName="break-words break-all"
          iconRight={{ family: 'FontAwesome6', name: 'copy' }}
          onPress={onClipboard}
        >
          {address}
        </Button>
        <View className="items-center pt-4">
          <Button mode="secondary" onPress={onClipboard}>
            {t('receive.copyAddress')}
          </Button>
        </View>
      </View>
    </Modal>
  );
};

export default AddReserve;
