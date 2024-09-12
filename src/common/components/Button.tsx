import React from 'react';
import * as RN from 'react-native';
import type { IconType } from './types';
import { useTheme } from '../theme';
import * as Icons from '@expo/vector-icons';
import Spin from './Spin';

interface ButtonProps extends RN.PressableProps {
  mode?:
    | 'primary'
    | 'primary-alert'
    | 'native'
    | 'secondary'
    | 'secondary-alert'
    | 'text';
  iconLeft?: IconType;
  iconRight?: IconType;
  onPress?: ((event: RN.GestureResponderEvent) => void) | undefined;
  disabled?: boolean;
  /**
   * loading is similar to disabled but in addition it shows a Spin element
   * on secondary and primary buttons. Setting loading, automatically sets
   * disabled
   */
  loading?: boolean;
  /**
   * note: this is experimental and does not work very well when trying to
   * override classes already set
   */
  containerClassName?: string;
  textClassName?: string;
}

const Button: React.FC<ButtonProps> = ({
  iconLeft,
  iconRight,
  disabled = false,
  loading = false,
  mode = 'primary',
  containerClassName = '',
  textClassName = '',
  children,
  ...props
}) => {
  const theme = useTheme();
  if (loading) disabled = loading;

  const IconLeft =
    iconLeft && iconLeft.family && Icons[iconLeft.family]
      ? Icons[iconLeft.family]
      : null;
  const IconRight =
    iconRight && iconRight.family && Icons[iconRight.family]
      ? Icons[iconRight.family]
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
        className={`flex-row min-w-20 items-center ${disabled ? 'pointer-events-none opacity-50' : 'hover:opacity-90 active:opacity-90 active:scale-95'} ${containerClassName}`}
        {...props}
      >
        {iconLeft && (
          <IconLeft
            name={iconLeft.name}
            color={theme.colors.primary}
            className="pr-2 font-semibold text-primary native:text-sm web:text-xs web:sm:text-sm select-none"
          />
        )}
        {typeof children === 'string' ? (
          <RN.Text
            className={`text text-center text-primary native:text-base web:text-sm web:sm:text-base select-none ${textClassName}`}
          >
            {children}
          </RN.Text>
        ) : React.isValidElement(children) ? (
          children
        ) : null}
        {iconRight && (
          <IconRight
            name={iconRight.name}
            color={theme.colors.primary}
            className="pl-2 font-semibold text-primary native:text-sm web:text-xs web:sm:text-sm select-none"
          />
        )}
        {loading && <Spin className="text-primary ml-2" />}
      </RN.Pressable>
    );
  } else if (mode === 'primary' || mode === 'primary-alert') {
    return (
      <RN.Pressable
        key={String(disabled)}
        className={`flex-row min-w-20 justify-center items-center py-3 px-5 rounded-lg ${mode === 'primary-alert' ? 'bg-red-600' : 'bg-primary'} ${disabled ? 'pointer-events-none opacity-50' : 'hover:opacity-90 active:opacity-90 active:scale-95'} ${containerClassName}`}
        {...props}
      >
        {iconLeft && (
          <IconLeft
            name={iconLeft.name}
            className="pr-2 font-semibold text-white native:text-sm web:text-xs web:sm:text-sm select-none"
          />
        )}
        {typeof children === 'string' ? (
          <RN.Text
            className={`text-center font-semibold text-white native:text-sm web:text-xs web:sm:text-sm select-none ${textClassName}`}
          >
            {children}
          </RN.Text>
        ) : React.isValidElement(children) ? (
          children
        ) : null}
        {iconRight && (
          <IconRight
            name={iconRight.name}
            className="pl-2 font-semibold text-white native:text-sm web:text-xs web:sm:text-sm select-none"
          />
        )}
        {loading && <Spin className="text-white ml-2" />}
      </RN.Pressable>
    );
  } else if (mode === 'secondary' || mode === 'secondary-alert') {
    return (
      <RN.Pressable
        key={String(disabled)}
        className={`flex-row min-w-20 justify-center items-center py-3 px-5 rounded-lg ${mode === 'secondary-alert' ? 'bg-red-200' : 'bg-primary-light'} ${disabled ? 'pointer-events-none opacity-50' : `active:scale-95 ${mode === 'secondary-alert' ? 'hover:bg-red-300 active:bg-red-300' : 'hover:bg-primary-light-hover active:bg-primary-light-hover'}`} ${containerClassName}`}
        {...props}
      >
        {iconLeft && (
          <IconLeft
            name={iconLeft.name}
            className={`pr-2 font-semibold native:text-sm web:text-xs web:sm:text-sm select-none ${
              mode === 'secondary-alert' ? 'text-red-800' : 'text-primary-dark'
            }`}
          />
        )}
        {typeof children === 'string' ? (
          <RN.Text
            className={`text-center font-semibold native:text-sm web:text-xs web:sm:text-sm select-none ${
              mode === 'secondary-alert' ? 'text-red-800' : 'text-primary-dark'
            } ${textClassName}`}
          >
            {children}
          </RN.Text>
        ) : React.isValidElement(children) ? (
          children
        ) : null}
        {iconRight && (
          <IconRight
            name={iconRight.name}
            className={`pl-2 font-semibold native:text-sm web:text-xs web:sm:text-sm select-none ${
              mode === 'secondary-alert' ? 'text-red-800' : 'text-primary-dark'
            }`}
          />
        )}
        {loading && (
          <Spin
            className={`ml-2 ${
              mode === 'secondary-alert' ? 'text-red-800' : 'text-primary-dark'
            }`}
          />
        )}
      </RN.Pressable>
    );
  } else throw new Error(`Unsupported button mode ${mode}`);
};

export { Button };
