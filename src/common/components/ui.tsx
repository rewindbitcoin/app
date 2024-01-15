import React from 'react';
import * as RN from 'react-native';
export { Switch, ActivityIndicator } from 'react-native';
import { theme } from './ui/theme';
export { theme };
export { Button } from './ui/Button';

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
