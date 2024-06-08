import React from 'react';
import FreezeIcon from './FreezeIcon';
import { Svg } from 'react-native-svg';
import { Text } from 'react-native';
const VaultIcon = ({
  remainingBlocks
}: {
  remainingBlocks:
    | 'LOADING'
    | 'NOT_PUSHED'
    | 'SPENT_AS_PANIC'
    | 'SPENT_AS_HOT'
    | number /*means it has been triggered*/;
}) => {
  return remainingBlocks === 'LOADING' ? (
    <Text>TODO ActivityIndicato</Text>
  ) : remainingBlocks === 'NOT_PUSHED' ? (
    <Svg
      className="native:text-base web:text-xs web:sm:text-base fill-none stroke-white stroke-2 w-6 h-6 bg-primary rounded-full p-0.5"
      viewBox="0 0 24 24"
    >
      <FreezeIcon />
    </Svg>
  ) : remainingBlocks === 'SPENT_AS_PANIC' ? (
    <Text>TODO Flotador Icon</Text>
  ) : remainingBlocks === 'SPENT_AS_HOT' ? (
    <Text>TODO Sun -heat Icon</Text>
  ) : (
    <Text>{`melting ${remainingBlocks} remaining blocks`}</Text>
  );
};

export default React.memo(VaultIcon);
