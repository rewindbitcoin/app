import React from 'react';
import { View } from 'react-native';

import HotIcon from './HotIcon';
import FreezeIcon from './FreezeIcon';
import { Svg } from 'react-native-svg';
import type { getRemainingBlocks } from '../lib/vaults';
import { ActivityIndicator } from '../../common/ui';
import UnfreezeIcon from './UnfreezeIcon';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

const VaultIcon = ({
  remainingBlocks
}: {
  remainingBlocks: ReturnType<typeof getRemainingBlocks> | undefined;
}) => {
  return remainingBlocks === undefined ? (
    <ActivityIndicator />
  ) : remainingBlocks === 'VAULT_NOT_FOUND' ? (
    <MaterialCommunityIcons name="snowflake-off" size={24} color="red" />
  ) : remainingBlocks === 'TRIGGER_NOT_PUSHED' ? (
    //bg-[#4286E7]
    <View className="rounded-full w-6 h-6 p-0.5 overflow-hidden bg-primary">
      <Svg className="fill-white" viewBox="0 0 24 24">
        <FreezeIcon />
      </Svg>
    </View>
  ) : remainingBlocks === 'SPENT_AS_PANIC' ? (
    <MaterialCommunityIcons name="alarm-light" size={24} color="red" />
  ) : remainingBlocks === 'SPENT_AS_HOT' || remainingBlocks === 0 ? (
    <Svg className="fill-yellow-400 w-8 h-8" viewBox="0 0 24 24">
      <HotIcon />
    </Svg>
  ) : (
    <View className="flex-row items-center rounded-full w-6 h-6 p-0.5 overflow-hidden bg-[#800080]">
      <Svg className="fill-white" viewBox="0 0 24 24">
        <UnfreezeIcon />
      </Svg>
    </View>
  );
};
export default React.memo(VaultIcon);
