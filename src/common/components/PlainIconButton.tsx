import React, { useState, useMemo, useCallback } from 'react';
import { StyleSheet, Pressable, ViewStyle } from 'react-native';
import { rgba } from 'polished';
import * as Icons from '@expo/vector-icons';
import { useTheme, Theme } from '../theme';
import { Text } from './Text';

const PlainIconButton = React.memo(function PlainIconButton({
  text,
  iconName,
  iconFamily,
  onPress,
  style
}: {
  text: string;
  iconName: string;
  iconFamily: keyof typeof Icons;
  onPress?: () => void;
  style?: ViewStyle;
}) {
  const theme = useTheme();
  const [pressed, setPressed] = useState<boolean>(false);
  const styles = useMemo(
    () => getPlainIconButtonStyles(theme, pressed),
    [theme, pressed]
  );
  const Icon = Icons[iconFamily];
  const onPressIn = useCallback(() => setPressed(true), []);
  const onPressOut = useCallback(() => setPressed(false), []);
  return (
    <Pressable
      style={[styles.actionButton, style]}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      onPress={onPress}
    >
      <Icon name={iconName} style={styles.actionIcon} />
      <Text style={styles.actionText}>{text}</Text>
    </Pressable>
  );
});
const getPlainIconButtonStyles = (theme: Theme, pressed: boolean) =>
  StyleSheet.create({
    actionButton: {
      flexDirection: 'row',
      alignItems: 'center'
    },
    actionIcon: {
      fontSize: 14,
      paddingRight: 4,
      color: rgba(theme.colors.primary, pressed ? 0.2 : 1)
    },
    actionText: {
      fontSize: 14,
      color: rgba(theme.colors.primary, pressed ? 0.2 : 1)
    }
  });

export default React.memo(PlainIconButton);
