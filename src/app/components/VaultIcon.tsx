import React from 'react';
import { View } from 'react-native';

import HotIcon from './HotIcon';
import FreezeIcon from './FreezeIcon';
import { Svg } from 'react-native-svg';
import SaveBuoy from '../../../assets/SaveBuoy.svg';
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
  ) : remainingBlocks === 'TRIGGER_NOT_PUSHED' ? (
    <Svg
      className="fill-white w-6 h-6 bg-primary p-0.5 rounded-full bg-[#4286E7]"
      viewBox="0 0 24 24"
    >
      <FreezeIcon />
    </Svg>
  ) : remainingBlocks === 'SPENT_AS_PANIC' ? (
    <MaterialCommunityIcons name="alarm-light" size={24} color="red" />
  ) : remainingBlocks === 'SPENT_AS_HOT' || remainingBlocks === 0 ? (
    <Svg className="fill-yellow-400 w-8 h-8" viewBox="0 0 24 24">
      <HotIcon />
    </Svg>
  ) : (
    <View className="flex-row items-center">
      <Svg
        className="fill-white w-6 h-6 p-0.5 rounded-full bg-primary opacity-70"
        viewBox="0 0 24 24"
      >
        <UnfreezeIcon />
      </Svg>
    </View>
  );
};

/*
 *
 * old rescue save buoy:
 *     <SaveBuoy className="w-6 h-6" />
 */

/* old unfreeze icon:
import UnfreezeIcon from './UnfreezeIcon';
    <Svg
      className="fill-white w-6 h-6 p-0.5 rounded-full bg-[#6baff9]"
      viewBox="0 0 24 24"
    >
      <UnfreezeIcon />
    </Svg>
    */
/*
 * unfreeze sequence:
  *
      <Svg
        className="mr-1.5 fill-white w-6 h-6 bg-primary p-0.5 rounded-full bg-[#4286E7]"
        viewBox="0 0 24 24"
      >
        <FreezeIcon />
      </Svg>
      <FontAwesome name="long-arrow-right" size={10} color="black" />
      <Svg className="ml-1 fill-yellow-400 w-8 h-8" viewBox="0 0 24 24">
        <HotIcon />
      </Svg>
      */

export default React.memo(VaultIcon);
