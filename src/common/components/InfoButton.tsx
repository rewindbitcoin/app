import React from 'react';
import IconButton from './IconButton';
function InfoButton({
  size = 16,
  onPress
}: {
  size?: number;
  onPress?: () => void;
}) {
  return (
    <IconButton
      mode="no-text"
      {...(size === undefined ? {} : { size })}
      {...(onPress === undefined ? {} : { onPress })}
      iconFamily="AntDesign"
      iconName="infocirlceo"
    />
  );
}
export default React.memo(InfoButton);
