import React from 'react';
import * as RN from 'react-native';
export { ActivityIndicator, TextInput } from 'react-native';
import { useTheme, Theme } from './ui/theme';
export { useTheme, Theme };
export { Button } from './ui/Button';
export { Text } from './ui/Text';
export { Modal } from './ui/Modal';
export { Switch } from './ui/Switch';

export const HorLineSep = ({ style }: { style?: RN.ViewStyle }) => {
  const theme = useTheme();
  return (
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
};
