import React from 'react';
import * as RN from 'react-native';
export { Switch, ActivityIndicator } from 'react-native';
import { theme } from './ui/theme';
export { theme };
export { Button } from './ui/Button';
export { Text } from './ui/Text';
export { Modal } from './ui/Modal';

export const HorLineSep = ({ style }: { style?: RN.ViewStyle }) => (
  <RN.View
    style={[
      style,
      {
        height: 1,
        width: '100%',
        marginVertical: 10,
        backgroundColor: theme.colors.listsSeparator
      }
    ]}
  />
);
