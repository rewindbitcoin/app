import React from 'react';
import * as RN from 'react-native';
import { theme } from './theme';
interface ButtonProps extends RN.PressableProps {
  mode?: 'native' | 'text' | 'contained' | 'outlined' | 'elevated';
  onPress: (event: RN.GestureResponderEvent) => void;
  disabled?: boolean;
}

const Button: React.FC<ButtonProps> = ({
  mode = 'native',
  style,
  children,
  ...props
}) => {
  if (mode === 'native' && typeof children === 'string') {
    return <RN.Button title={children} {...props} />;
  } else if (mode !== 'native') {
    return (
      <RN.Pressable
        style={({ pressed }) => [
          {
            ...styles.buttonContainer,
            ...modeStyles[mode],
            ...(pressed && mode !== 'outlined'
              ? { backgroundColor: theme.colors.primary }
              : {}),
            style
          }
        ]}
        {...props}
      >
        {typeof children === 'string' ? (
          <RN.Text>{children}</RN.Text>
        ) : (
          children
        )}
      </RN.Pressable>
    );
  } else throw new Error('native mode should receive text');
};

const styles = RN.StyleSheet.create({
  buttonContainer: {
    padding: 10,
    borderRadius: 5,
    color: theme.colors.primary
  }
});

const modeStyles = RN.StyleSheet.create({
  text: {
    backgroundColor: 'transparent',
    color: theme.colors.primary
  },
  contained: {
    backgroundColor: theme.colors.primary,
    color: theme.colors.white
  },
  outlined: {
    borderWidth: 1,
    borderColor: theme.colors.primary,
    backgroundColor: 'transparent'
  },
  elevated: {
    backgroundColor: theme.colors.primary,
    color: theme.colors.white,
    elevation: 4
  }
});

export { Button };
