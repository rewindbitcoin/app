import React from 'react';
import * as RN from 'react-native';
export { ActivityIndicator } from 'react-native';

// Extend the TextProps with the variant
interface TextProps extends RN.TextProps {
  variant?: 'headlineSmall' | 'headlineLarge' | 'body' | 'caption';
}

// Define styles for each variant
const textStyles = RN.StyleSheet.create({
  headlineSmall: {
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
  mode?: 'native' | 'contained' | 'outlined' | 'elevated' | 'contained-tonal';
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
            ...buttonModeStyles[mode],
            ...(pressed && mode !== 'outlined'
              ? { backgroundColor: 'darkblue' }
              : {}),
            style
          }
        ]}
        {...props}
      >
        {children}
      </RN.Pressable>
    );
  } else throw new Error('native mode should receive text');
};

const buttonStyles = RN.StyleSheet.create({
  button: {
    // Define your button styles here
    padding: 10,
    borderRadius: 5
  },
  text: {
    // Define your text styles here
    color: 'white',
    textAlign: 'center'
  }
});

const buttonModeStyles = RN.StyleSheet.create({
  contained: {
    backgroundColor: 'blue'
  },
  outlined: {
    borderWidth: 1,
    borderColor: 'blue',
    backgroundColor: 'transparent'
  },
  elevated: {
    backgroundColor: 'blue',
    elevation: 4
  },
  'contained-tonal': {
    backgroundColor: 'lightblue' // Or any other color for tonal variation
  }
});

export { Button };
