import React from 'react';
import * as RN from 'react-native';
// Extend the TextProps with the variant
interface TextProps extends RN.TextProps {
  variant?: 'headlineSmall' | 'headlineLarge' | 'body' | 'caption';
}
// The Text component
const Text: React.FC<TextProps> = ({ variant, style, ...props }) => {
  const textStyle = variant ? textStyles[variant] : {};
  return <RN.Text style={[textStyle, style]} {...props} />;
};
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

export { Text };
