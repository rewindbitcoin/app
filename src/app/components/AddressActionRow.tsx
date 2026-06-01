// Copyright (C) 2026 Jose-Luis Landabaso - https://rewindbitcoin.com
// Licensed under the GNU GPL v3 or later. See the LICENSE file for details.

import React, { useCallback } from 'react';
import { Linking, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useTranslation } from 'react-i18next';
import { Button, useToast } from '../../common/ui';
import { getShortAddress } from '../lib/format';

const RawAddressActionRow = ({
  address,
  blockExplorerURL,
  className = '',
  textClassName = 'text-sm text-slate-600'
}: {
  address: string;
  blockExplorerURL?: string | undefined;
  className?: string | undefined;
  textClassName?: string | undefined;
}) => {
  const { t } = useTranslation();
  const toast = useToast();

  const handleCopyAddress = useCallback(() => {
    Clipboard.setStringAsync(address);
    toast.show(t('receive.clipboard'), { type: 'success', duration: 2000 });
  }, [address, t, toast]);

  return (
    <View
      className={`flex-row flex-wrap items-center justify-between gap-x-3 gap-y-1 ${className}`}
    >
      <Text className={`shrink ${textClassName}`} selectable={true}>
        {getShortAddress(address)}
      </Text>
      <View className="flex-row flex-wrap items-center justify-end gap-x-4 gap-y-1">
        {blockExplorerURL ? (
          <Button
            mode="text"
            containerClassName="!min-w-0"
            textClassName="!text-xs"
            iconRight={{ family: 'FontAwesome5', name: 'external-link-alt' }}
            onPress={() => Linking.openURL(`${blockExplorerURL}/${address}`)}
          >
            {t('viewButton')}
          </Button>
        ) : null}
        <Button
          mode="text"
          containerClassName="!min-w-0"
          textClassName="!text-xs"
          iconRight={{ family: 'FontAwesome6', name: 'copy' }}
          onPress={handleCopyAddress}
        >
          {t('copyButton')}
        </Button>
      </View>
    </View>
  );
};

export default React.memo(RawAddressActionRow);
