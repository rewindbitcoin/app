import React from 'react';
import { useTheme } from './theme';
import { rgba } from 'polished';
import { Switch as RNSwitch, SwitchProps, Platform } from 'react-native';

const ThemedSwitch: React.FC<SwitchProps> = ({ value, ...props }) => {
  const theme = useTheme();

  const trackColor = Platform.select({
    android: { false: undefined, true: rgba(theme.colors.primary, 0.3) },
    default: { false: undefined, true: theme.colors.primary }
  });
  const thumbColor = Platform.select({
    android: theme.colors.primary,
    default: undefined
  });

  const valueProps = value ? { value, trackColor, thumbColor } : {};
  return <RNSwitch {...props} {...valueProps} />;
};

export { ThemedSwitch as Switch };
