import React, { useState, useMemo, useCallback } from 'react';
import { StyleSheet, Pressable } from 'react-native';
import { rgba } from 'polished';
import * as Icons from '@expo/vector-icons';
import { useTheme, Theme } from '../theme';
import { Text } from './Text';

function IconButton({
  mode = 'icon-left',
  text,
  iconName,
  iconFamily,
  onPress,
  size = 14
}: {
  mode?: 'icon-right' | 'icon-left' | 'no-text';
  text?: string;
  iconName: string;
  iconFamily: keyof typeof Icons;
  onPress?: () => void;
  size?: number;
}) {
  const theme = useTheme();
  const [pressed, setPressed] = useState<boolean>(false);
  const styles = useMemo(
    () => getIconButtonStyles(theme, pressed, size, mode),
    [theme, pressed, size, mode]
  );
  const Icon = Icons[iconFamily];
  const onPressIn = useCallback(() => setPressed(true), []);
  const onPressOut = useCallback(() => setPressed(false), []);
  return (
    <Pressable
      className="flex-row items-center"
      hitSlop={10}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      onPress={onPress}
    >
      {mode === 'icon-left' ? (
        <>
          <Icon name={iconName} style={styles.actionIcon} />
          <Text style={styles.actionText}>{text}</Text>
        </>
      ) : mode === 'icon-right' ? (
        <>
          <Text style={styles.actionText}>{text}</Text>
          <Icon name={iconName} style={styles.actionIcon} />
        </>
      ) : (
        <Icon name={iconName} style={styles.actionIcon} />
      )}
    </Pressable>
  );
}
const getIconButtonStyles = (
  theme: Theme,
  pressed: boolean,
  size: number,
  mode: 'icon-right' | 'icon-left' | 'no-text'
) =>
  StyleSheet.create({
    actionIcon: {
      paddingRight: mode === 'icon-left' ? (4 * size) / 16 : 0,
      paddingLeft: mode === 'icon-right' ? (4 * size) / 16 : 0,
      fontSize: size,
      color: rgba(theme.colors.primary, pressed ? 0.2 : 1)
    },
    actionText: {
      fontSize: size,
      color: rgba(theme.colors.primary, pressed ? 0.2 : 1)
    }
  });

export default React.memo(IconButton);
