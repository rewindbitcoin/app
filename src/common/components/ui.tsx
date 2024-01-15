import React from 'react';
import * as RN from 'react-native';
export { Switch, ActivityIndicator } from 'react-native';
import { DefaultTheme } from '@react-navigation/native';

export const theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    listsSecondary: 'gray',
    white: 'white',
    listsSeparator: '#D0D0D0'
  }
};

// Extend the TextProps with the variant
interface TextProps extends RN.TextProps {
  variant?: 'headlineSmall' | 'headlineLarge' | 'body' | 'caption';
}

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

// Define styles for each variant
const textStyles = RN.StyleSheet.create({
  headlineSmall: {
    fontWeight: '600',
    fontSize: 18
    /* styles for headlineSmall */
  },
  headlineLarge: {
    /* styles for headlineLarge */
  },
  body: {
    /* styles for body text */
  },
  caption: {
    /* styles for caption */
  }
  // Add more styles for other variants
});

// The Text component
export const Text: React.FC<TextProps> = ({ variant, style, ...props }) => {
  const textStyle = variant ? textStyles[variant] : {};
  return <RN.Text style={[textStyle, style]} {...props} />;
};

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
            ...buttonStyles.button,
            ...buttonStylesPerMode[mode],
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

const buttonStyles = RN.StyleSheet.create({
  button: {
    padding: 10,
    borderRadius: 5,
    color: theme.colors.primary
  }
});

const buttonStylesPerMode = RN.StyleSheet.create({
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
