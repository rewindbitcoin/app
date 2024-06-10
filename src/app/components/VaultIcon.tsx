import React from 'react';
import FreezeIcon from './FreezeIcon';
import UnfreezeIcon from './UnfreezeIcon';
import { Svg } from 'react-native-svg';
import { Text } from 'react-native';
import SaveBuoy from '../../../assets/SaveBuoy.svg';
import type { getRemainingBlocks } from '../lib/vaults';

const VaultIcon = ({
  remainingBlocks
}: {
  remainingBlocks: ReturnType<typeof getRemainingBlocks> | undefined;
}) => {
  return remainingBlocks === undefined ? (
    <Text>TODO ActivityIndicator Loading</Text>
  ) : remainingBlocks === 'NOT_PUSHED' ? (
    <Svg
      className="fill-white w-6 h-6 bg-primary p-0.5 rounded-full bg-[#4286E7]"
      viewBox="0 0 24 24"
    >
      <FreezeIcon />
    </Svg>
  ) : remainingBlocks === 'SPENT_AS_PANIC' ? (
    <SaveBuoy className="w-6 h-6" />
  ) : remainingBlocks === 'SPENT_AS_HOT' || remainingBlocks === 0 ? (
    <Text>TODO Sun -heat Icon</Text>
  ) : (
    <Svg
      className="fill-white w-6 h-6 p-0.5 rounded-full bg-[#00BFFF]"
      viewBox="0 0 24 24"
    >
      <UnfreezeIcon />
    </Svg>
  );
};

export default React.memo(VaultIcon);
