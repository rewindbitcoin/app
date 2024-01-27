import React from 'react';
import * as RN from 'react-native';
import { useTheme, Theme } from '../theme';
import { rgba } from 'polished';
interface ButtonProps extends RN.PressableProps {
  mode?: 'native' | 'text' | 'contained' | 'outlined';
  /** used then the children passed is a string */
  fontSize?: number;
  onPress?: (event: RN.GestureResponderEvent) => void;
  disabled?: boolean;
}

const Button: React.FC<ButtonProps> = ({
  mode = 'native',
  fontSize,
  children,
  ...props
}) => {
  const theme = useTheme();
  if (mode === 'native' && typeof children === 'string') {
    return (
      <RN.Button color={theme.colors.primary} title={children} {...props} />
    );
  } else if (mode !== 'native') {
    return (
      <RN.Pressable
        style={({ pressed }) => {
          return getStyles(theme, pressed).container[mode];
        }}
        {...props}
      >
        {({ pressed }) =>
          typeof children === 'string' ? (
            <RN.Text
              style={[
                fontSize ? { fontSize } : {},
                getStyles(theme, pressed).actionText[mode]
              ]}
            >
              {children}
            </RN.Text>
          ) : React.isValidElement(children) ? (
            children
          ) : null
        }
      </RN.Pressable>
    );
  } else throw new Error('native mode should receive text');
};

const getStyles = (theme: Theme, pressed: boolean) => {
  return {
    actionText: RN.StyleSheet.create({
      text: {
        color: rgba(theme.colors.primary, pressed ? 0.2 : 1)
      },
      contained: {
        color: theme.colors.white
      },
      outlined: {}
    }),
    container: RN.StyleSheet.create({
      text: {
        //    backgroundColor: 'transparent' no need for this
      },
      contained: {
        backgroundColor: theme.colors.primary,
        padding: 10,
        borderRadius: 5,
        color: theme.colors.primary
      },
      outlined: {
        borderWidth: 1,
        borderColor: theme.colors.primary,
        backgroundColor: 'transparent',
        padding: 10,
        borderRadius: 5
      }
    })
  };
};

export { Button };
