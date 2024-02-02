import React from 'react';
import type { ViewStyle } from 'react-native';
import IconButton from './IconButton';
function InfoButton({
  size = 16,
  style,
  onPress
}: {
  size?: number;
  style?: ViewStyle;
  onPress?: () => void;
}) {
  return (
    <IconButton
      mode="no-text"
      {...(size === undefined ? {} : { size })}
      {...(style === undefined ? {} : { style })}
      {...(onPress === undefined ? {} : { onPress })}
      iconFamily="AntDesign"
      iconName="infocirlceo"
    />
  );
}
export default React.memo(InfoButton);
