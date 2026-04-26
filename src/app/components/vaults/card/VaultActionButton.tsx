// Copyright (C) 2026 Jose-Luis Landabaso - https://rewindbitcoin.com
// Licensed under the GNU GPL v3 or later. See the LICENSE file for details.

import React from 'react';
import { View } from 'react-native';

import { Button } from '../../../../common/ui';

const VaultActionButton = ({
  mode,
  onPress,
  loading,
  disabled = false,
  msg,
  infoButton
}: {
  mode: 'secondary' | 'secondary-alert';
  onPress: () => void;
  loading: boolean;
  disabled?: boolean;
  msg: string;
  infoButton?: React.ReactNode;
}) => (
  <View className={`flex-row items-center gap-2 mobmed:gap-4`}>
    <Button mode={mode} onPress={onPress} loading={loading} disabled={disabled}>
      {msg}
    </Button>
    {infoButton}
  </View>
);

export default VaultActionButton;
