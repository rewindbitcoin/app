import React from 'react';
import { useTheme } from '../theme';
import { View, ViewStyle } from 'react-native';
export default function Divider({ style }: { style?: ViewStyle }) {
  const theme = useTheme();
  return (
    <View
      style={[
        style,
        {
          height: 1,
          width: '100%',
          //marginVertical: 10,
          backgroundColor: theme.colors.listsSeparator
        }
      ]}
    />
  );
}
