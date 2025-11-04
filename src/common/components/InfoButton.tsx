// Copyright (C) 2025 Jose-Luis Landabaso - https://rewindbitcoin.com
// Licensed under the GNU GPL v3 or later. See the LICENSE file for details.

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
