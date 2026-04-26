// Copyright (C) 2026 Jose-Luis Landabaso - https://rewindbitcoin.com
// Licensed under the GNU GPL v3 or later. See the LICENSE file for details.

import React from 'react';
import { Text, View } from 'react-native';
import * as Icons from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { Button, type IconType } from '../../../../common/ui';

const VaultStatusLine: React.FC<{
  danger?: boolean;
  icon?: IconType;
  children: React.ReactNode;
  onAccelerate?: () => void;
  accelerateLoading?: boolean;
}> = ({
  danger = false,
  icon,
  children,
  onAccelerate,
  accelerateLoading = false
}) => {
  const { t } = useTranslation();
  const Icon =
    icon && icon.family && Icons[icon.family] ? Icons[icon.family] : null;
  return (
    <View className="flex-row items-center">
      {icon && (
        <View className="flex-row items-center self-start">
          <Text className="!leading-5 native:text-sm native:mobmed:text-base inline-block w-0">
            {' '}
          </Text>
          <Icon
            className={`!leading-5 pr-3 ${danger ? 'text-red-300' : 'text-primary'} native:text-base native:mobmed:text-lg`}
            name={icon.name}
          />
        </View>
      )}
      <View className="flex-1">
        <Text className="!leading-5 text-slate-600 native:text-sm native:mobmed:text-base">
          {children}
        </Text>
        {(onAccelerate !== undefined || accelerateLoading) && (
          <Button
            mode="text"
            onPress={onAccelerate}
            disabled={accelerateLoading || onAccelerate === undefined}
            loading={accelerateLoading}
            containerClassName="self-start -ml-1"
          >
            {' ' + t('accelerateButton') + (accelerateLoading ? '' : ' ➤')}
          </Button>
        )}
      </View>
    </View>
  );
};

export default VaultStatusLine;
