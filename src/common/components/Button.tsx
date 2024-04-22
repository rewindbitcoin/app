import React from 'react';
import * as RN from 'react-native';
import { useTheme } from '../theme';

interface ButtonProps extends RN.PressableProps {
  mode?: 'default' | 'native' | 'text';
  onPress?: ((event: RN.GestureResponderEvent) => void) | undefined;
  disabled?: boolean;
}

const Button: React.FC<ButtonProps> = ({
  disabled = false,
  mode = 'default',
  children,
  ...props
}) => {
  const theme = useTheme();
  if (mode === 'native' && typeof children !== 'string')
    throw new Error('native mode should receive text');
  if (mode === 'native' && typeof children === 'string') {
    return (
      <RN.Button color={theme.colors.primary} title={children} {...props} />
    );
  } else if (mode === 'text') {
    return (
      <RN.Pressable
        key={String(disabled)}
        className={`min-w-20 items-center py-3 px-5 ${disabled ? 'pointer-events-none opacity-50' : 'hover:opacity-90 active:opacity-90 active:scale-95'}`}
        {...props}
      >
        {typeof children === 'string' ? (
          <RN.Text className="text-center native:text-base text-primary web:text-sm web:sm:text-base">
            {children}
          </RN.Text>
        ) : React.isValidElement(children) ? (
          children
        ) : null}
      </RN.Pressable>
    );
  } else if (mode === 'default') {
    return (
      <RN.Pressable
        key={String(disabled)}
        className={`min-w-20 items-center py-3 px-5 rounded-lg bg-primary ${disabled ? 'pointer-events-none opacity-50' : 'hover:opacity-90 active:opacity-90 active:scale-95'}`}
        {...props}
      >
        {typeof children === 'string' ? (
          <RN.Text className="text-center native:text-sm font-semibold text-white web:text-xs web:sm:text-sm">
            {children}
          </RN.Text>
        ) : React.isValidElement(children) ? (
          children
        ) : null}
      </RN.Pressable>
    );
  } else throw new Error(`Unsupported button mode ${mode}`);
};

export { Button };
