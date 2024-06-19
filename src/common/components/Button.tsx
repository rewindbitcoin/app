import React from 'react';
import * as RN from 'react-native';
import type { IconType } from './types';
import { useTheme } from '../theme';
import * as Icons from '@expo/vector-icons';
import Spin from './Spin';

interface ButtonProps extends RN.PressableProps {
  mode?: 'primary' | 'native' | 'secondary' | 'text';
  iconLeft?: IconType;
  onPress?: ((event: RN.GestureResponderEvent) => void) | undefined;
  disabled?: boolean;
  /**
   * loading is similar to disabled but in addition it shows a Spin element
   * on secondary and primary buttons. Setting loading, automatically sets
   * disabled
   */
  loading?: boolean;
}

const Button: React.FC<ButtonProps> = ({
  iconLeft,
  disabled = false,
  loading = false,
  mode = 'primary',
  children,
  ...props
}) => {
  const theme = useTheme();
  if (loading) disabled = loading;

  const IconLeft =
    iconLeft && iconLeft.family && Icons[iconLeft.family]
      ? Icons[iconLeft.family]
      : null;

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
        hitSlop={10}
        className={`min-w-20 items-center ${disabled ? 'pointer-events-none opacity-50' : 'hover:opacity-90 active:opacity-90 active:scale-95'}`}
        {...props}
      >
        {typeof children === 'string' ? (
          <RN.Text className="text-center native:text-base text-primary web:text-sm web:sm:text-base select-none">
            {children}
          </RN.Text>
        ) : React.isValidElement(children) ? (
          children
        ) : null}
      </RN.Pressable>
    );
  } else if (mode === 'primary') {
    return (
      <RN.Pressable
        key={String(disabled)}
        className={`flex-row min-w-20 justify-center items-center py-3 px-5 rounded-lg bg-primary ${disabled ? 'pointer-events-none opacity-50' : 'hover:opacity-90 active:opacity-90 active:scale-95'}`}
        {...props}
      >
        {iconLeft && (
          <IconLeft
            name={iconLeft.name}
            className="pr-2 font-semibold text-white native:text-sm web:text-xs web:sm:text-sm select-none"
          />
        )}
        {typeof children === 'string' ? (
          <RN.Text className="text-center font-semibold text-white native:text-sm web:text-xs web:sm:text-sm select-none">
            {children}
          </RN.Text>
        ) : React.isValidElement(children) ? (
          children
        ) : null}
        {loading && <Spin className="text-white ml-2" />}
      </RN.Pressable>
    );
  } else if (mode === 'secondary') {
    return (
      <RN.Pressable
        key={String(disabled)}
        className={`flex-row min-w-20 items-center py-3 px-5 rounded-lg bg-primary-light ${disabled ? 'pointer-events-none opacity-50' : 'hover:bg-primary-light-hover active:bg-primary-light-hover active:scale-95'}`}
        {...props}
      >
        {iconLeft && (
          <IconLeft
            name={iconLeft.name}
            className="pr-2 font-semibold text-primary-dark native:text-sm web:text-xs web:sm:text-sm select-none"
          />
        )}
        {typeof children === 'string' ? (
          <RN.Text className="text-center font-semibold text-primary-dark native:text-sm web:text-xs web:sm:text-sm select-none">
            {children}
          </RN.Text>
        ) : React.isValidElement(children) ? (
          children
        ) : null}
        {loading && <Spin className="text-primary-dark ml-2" />}
      </RN.Pressable>
    );
  } else throw new Error(`Unsupported button mode ${mode}`);
};

export { Button };
