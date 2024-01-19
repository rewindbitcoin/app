import React from 'react';
import * as RN from 'react-native';
import { useTheme, Theme } from './theme';
// Extend the TextProps with the variant
interface TextProps extends RN.TextProps {
  variant?:
    | 'headlineSmall'
    | 'headlineLarge'
    | 'body'
    | 'caption'
    | 'cardTitle';
}
// The Text component
const Text: React.FC<TextProps> = ({ variant, style, children, ...props }) => {
  const styles = getStyles(useTheme());
  if (variant === 'cardTitle') {
    if (typeof children !== 'string')
      throw new Error('cardTitle variant expects a string as children');
    children = children.toUpperCase();
  }
  const textStyle = variant ? styles[variant] : {};
  return (
    <RN.Text style={[textStyle, style]} {...props}>
      {children}
    </RN.Text>
  );
};
// Define styles for each variant
const getStyles = (theme: Theme) =>
  RN.StyleSheet.create({
    cardTitle: {
      fontSize: 12,
      color: theme.colors.cardSecondary,
      fontWeight: '500'
    },
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
