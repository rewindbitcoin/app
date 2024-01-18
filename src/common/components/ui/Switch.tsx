import React from 'react';
import { useTheme } from './theme';
import { rgba } from 'polished';
import { Switch as RNSwitch, SwitchProps, Platform } from 'react-native';

const ThemedSwitch: React.FC<SwitchProps> = ({ value, ...props }) => {
  const theme = useTheme();

  const trackColor = Platform.select({
    default: { false: undefined, true: rgba(theme.colors.primary, 0.3) },
    ios: { false: undefined, true: theme.colors.primary }
  });
  const thumbColor = Platform.select({
    default: theme.colors.primary,
    ios: undefined
  });
  //https://github.com/necolas/react-native-web/issues/1848#issuecomment-962250467
  const activeThumbColor = Platform.select({
    web: theme.colors.primary
  });

  const valueProps = value
    ? { value, trackColor, thumbColor, activeThumbColor }
    : {};
  return <RNSwitch {...props} {...valueProps} />;
};

export { ThemedSwitch as Switch };
