/**
 * The `EditableSlider` combines a slider with a text input for precise value
 * entry. It supports value snapping based on a specified step and handles
 * `null` values, indicating an indeterminate state. Key behaviors and
 * internal implementation details include:
 *
 * - Snapping Behavior: Values are snapped to the nearest increment defined
 *   by the 'step' size. For example, if the step is 0.01 and a value of 0.213
 *   is passed, it adjusts to 0.21.
 *   This component will call onValueChange with a value not snapped if the user
 *   enters a valid number (but not snapped) in the TextInput (within range)
 * - Initial Value:
 *   This component calls onValueChange with exactly the initialValue passed
 *   (if in range) or null (if not in range).
 *   This initial call is done so that upper components get notified about the
 *   current value when this component is inadvertedly re-mounted in some part
 *   of the rendering tree (for example AmountInput resets this component by
 *   changing the key everytime min/max/type change).
 *   From then on, onValueChange is only called on user interactions.
 *   To differentiate between user events and mount events, the
 *   type is 'RESET' when the first initialValue is passed to onValueChange and
 *   type is 'USER' when onValueChange is called after user interaction.
 *   This component snaps the initialValue. But the 'RESET' type value passed to
 *   onChangeValue on mount is `initialValue` (not the snapped version).
 *
 * - Minimum and Maximum Values: The 'minimumValue' and 'maximumValue' can
 *   be any number, allowing users to select these exact values regardless of
 *   the step setting mentioned above.
 *
 * - The slider's position must always forced to be put within range but marked
 *   in red if invalid. If the initialValue passed is not within range,
 *   it will shown as minimumValue in the in the slider.
 *
 * - Emitting Null Values: The component may emit `null` via 'onValueChange'
 *   on invalid number entered in the TextInput.
 *
 * - Internal Implementation:
 *     - 'numericInputControlledValue' represents the text input's value.
 *       It can be imprecise and is not constrained by range.
 *       Updated when the slider is used
 *       or during TextInput interaction, even if invalid.
 *       Triggers 'onValueChange' with the value if within range.
 *     - 'onValueChange' is called with valid values or `null` in case of
 *       user input errors in the NumericInput text box. The type 'USER' is
 *       used for these calls.
 */

const INPUT_MAX_LENGTH = 18;
import React, {
  useState,
  useCallback,
  ReactNode,
  useMemo,
  useEffect,
  useRef
} from 'react';
import { useTranslation } from 'react-i18next';

import { View, Text, StyleSheet, Platform } from 'react-native';
import NumberInput from './NumberInput';
import Slider from '@react-native-community/slider';
import { useFonts } from 'expo-font';
import { RobotoMono_400Regular } from '@expo-google-fonts/roboto-mono';
import { useTheme, Theme } from '../theme';
import {
  localizedStrToNumber,
  numberToFormattedFixed,
  numberToFixed,
  snapWithinRange,
  countDecimalDigits
} from '../../common/lib/numbers';

const DEFAULT_STEP = 0.01;

/**
 * Given a value number we return the string.
 * Here step is used just to find out the number of decimal places used.
 * If step is 0.02 then here we only care about the 2 decimal positions.
 */
function toFixed({
  value,
  locale,
  numberFormatting,
  step
}: {
  value: number;
  locale: string;
  numberFormatting: boolean;
  step: number;
}): string {
  const digits = countDecimalDigits(step);
  return numberFormatting
    ? numberToFormattedFixed(value, digits, locale)
    : numberToFixed(value, digits, locale);
}

const EditableSlider = ({
  initialValue,
  minimumValue,
  maximumValue,
  maxLabel,
  unit,
  numberFormatting = true,
  step = DEFAULT_STEP,
  locale,
  formatError,
  onValueChange,
  formatValue = value => `${value}`
}: {
  locale: string;
  initialValue: number;
  minimumValue: number;
  maxLabel?: string;
  unit?: ReactNode;
  numberFormatting?: boolean;
  maximumValue: number;
  step?: number;
  formatError?: (invalidValue: number) => string | undefined;
  onValueChange: (value: number | null, type: 'USER' | 'RESET') => void;
  formatValue: (value: number) => string;
}) => {
  const theme = useTheme();
  const styles = useMemo(() => getStyles(theme), [theme]);

  const { t } = useTranslation();

  const [fontsLoaded] = useFonts({ RobotoMono_400Regular });

  const lastNotifiedValue = useRef<number | null | undefined>(undefined);
  const lastNotifiedType = useRef<'USER' | 'RESET' | undefined>(undefined);
  const onValueChangeCached = useCallback(
    (value: number | null, type: 'USER' | 'RESET') => {
      if (
        value !== lastNotifiedValue.current ||
        type !== lastNotifiedType.current
      ) {
        onValueChange(value, type);
        lastNotifiedValue.current = value;
        lastNotifiedType.current = type;
      }
    },
    [onValueChange]
  );

  const onSliderValueChange = useCallback(
    (value: number) => {
      //The react-native slider is buggy and may return slightly off values
      if (value < minimumValue) value = minimumValue;
      if (value > maximumValue) value = maximumValue;
      const snappedWithinRange = snapWithinRange({
        value,
        minimumValue,
        maximumValue,
        step
      });
      if (snappedWithinRange === null)
        throw new Error(
          `Slider returned off-limits value: ${minimumValue} >= ${value} >= ${maximumValue}, step: ${step}, snappedWithinRange: ${snappedWithinRange}`
        );
      setNumericInputControlledValue(
        toFixed({
          value: snappedWithinRange,
          locale,
          numberFormatting,
          step
        })
      );
      onValueChangeCached(snappedWithinRange, 'USER');
    },
    [
      minimumValue,
      maximumValue,
      step,
      locale,
      numberFormatting,
      onValueChangeCached
    ]
  );

  const onNumberInputChangeValue = useCallback(
    (strValue: string) => {
      setNumericInputControlledValue(strValue);
      const value = localizedStrToNumber(strValue, locale);
      const isValidValue =
        !Number.isNaN(value) && value >= minimumValue && value <= maximumValue;
      if (isValidValue) {
        const snappedWithinRange = snapWithinRange({
          value,
          minimumValue,
          maximumValue,
          step
        });
        if (snappedWithinRange === null)
          throw new Error('snappedWithinRange should be valid');
        setSliderUncontrolledValue(snappedWithinRange);
        onValueChangeCached(value, 'USER');
      } else {
        onValueChangeCached(null, 'USER');
      }
    },
    [minimumValue, maximumValue, step, onValueChangeCached, locale]
  );

  //Slider is NOT a controlled component. State resides in Slider.
  //We only pass initial values here. Changing this value does not
  //trigger any event in the Slider
  //Initialize to the minimumValue if the user passed a value not within range:
  const [sliderUncontrolledValue, setSliderUncontrolledValue] =
    useState<number>(
      initialValue > maximumValue || initialValue < minimumValue
        ? minimumValue
        : initialValue
    );

  //NumericInput is a controlled component. State resides in EditableSlider
  //We initialize it to whatever value (don't care about not being in range).
  //We will display an error to the user so that he can handle it.
  const [numericInputControlledValue, setNumericInputControlledValue] =
    useState<string>(
      toFixed({ value: initialValue, locale, numberFormatting, step })
    );

  const value = localizedStrToNumber(numericInputControlledValue, locale);
  const isValidValue =
    !Number.isNaN(value) && value >= minimumValue && value <= maximumValue;

  let statusText;
  if (isValidValue) {
    statusText = formatValue(value);
  } else {
    const errorFormatted = formatError && formatError(value);
    if (errorFormatted) {
      statusText = errorFormatted;
    } else if (value > maximumValue) {
      statusText = t('editableSlider.maxValueError', { maximumValue });
    } else if (value < minimumValue) {
      statusText = t('editableSlider.minValueError', { minimumValue });
    } else {
      statusText = t('editableSlider.invalidValue');
    }
  }

  const thumbTintColor = useMemo(() => {
    return isValidValue
      ? Platform.OS === 'ios'
        ? {}
        : { thumbTintColor: theme.colors.primary }
      : { thumbTintColor: theme.colors.red };
  }, [isValidValue, theme.colors.primary, theme.colors.red]);

  const numberInputStyle = useMemo(() => {
    return {
      ...styles.input,
      ...(isValidValue ? {} : { color: theme.colors.red })
    };
  }, [isValidValue, styles.input, theme.colors.red]);
  const statusStyle = useMemo(() => {
    return [
      fontsLoaded ? { fontFamily: 'RobotoMono_400Regular' } : {},
      styles.status,
      isValidValue ? {} : { color: theme.colors.red },
      { letterSpacing: -0.5 }
    ];
  }, [fontsLoaded, isValidValue, styles.status, theme.colors.red]);

  const firstNotificationDone = useRef<boolean>(false);
  useEffect(() => {
    if (firstNotificationDone.current === false) {
      onValueChangeCached(
        initialValue >= minimumValue && initialValue <= maximumValue
          ? initialValue
          : null,
        'RESET'
      );
      firstNotificationDone.current = true;
    }
  }, [initialValue, onValueChangeCached, minimumValue, maximumValue]);

  /* Read TAG-android-does-not-propagate-slider-events
   * in src/common/lib/Modal.tsx for a solution if the Slider does not propagate
   * drag events in Android. F.ex. Modal.tsx solves the problem for a a
   * PanGestureHandler that captures events in Android and does not propagate them.
   * Basically, it is possible to fix the isse by setting some props in
   * the Children or in the parent. It has been solved by setting some props
   * in the parent. The 2 lines below could be used to fix the issue in the
   * Slider:
   *
   * const onResponderGrant = useCallback(() => true, []);
   * <Slider onResponderGrant={onResponderGrant} />
   *
   * Applying both solutions is even smoother (on android)
   * But both onResponderGrant in iOS does not work and the Slider is not
   * operative, so only apply to android.
   */

  const onResponderGrant = useCallback(() => true, []);
  return (
    <View style={styles.container}>
      <View style={styles.statusAndUnit}>
        <Text style={statusStyle}>{statusText}</Text>
        {unit || null}
      </View>
      <View className="flex-row items-center w-full mt-4 bg-yellow-100">
        <View className="flex-1 mr-2">
          <Slider
            {...(Platform.OS === 'android'
              ? { onResponderGrant: onResponderGrant }
              : {})}
            style={styles.slider}
            minimumTrackTintColor={theme.colors.primary}
            minimumValue={minimumValue}
            maximumValue={maximumValue}
            onValueChange={onSliderValueChange}
            {...thumbTintColor}
            value={sliderUncontrolledValue}
          />
        </View>
        <NumberInput
          locale={locale}
          maxLength={INPUT_MAX_LENGTH}
          style={numberInputStyle}
          strValue={numericInputControlledValue}
          onChangeValue={onNumberInputChangeValue}
        />
        {maxLabel && value === maximumValue && (
          <View className="absolute right-0 top-1/2 -mt-[0.375rem] bg-green-200">
            <Text style={styles.maxLabel}>{maxLabel}</Text>
          </View>
        )}
      </View>
    </View>
  );
};

export default React.memo(EditableSlider);

const getStyles = (theme: Theme) =>
  StyleSheet.create({
    container: {
      alignItems: 'center',
      justifyContent: 'space-between',
      width: '100%'
    },
    statusAndUnit: {
      flexDirection: 'row',
      alignItems: 'center', //vertically
      justifyContent: 'space-between',
      width: '100%'
    },
    status: {
      textAlign: 'left',
      flex: 1,
      paddingLeft: 4,
      fontSize: 14,
      color: theme.colors.cardSecondary
    },
    slider: {
      //Note that using className does not work with Slider

      //Applying padding is very important in android real device or the thumb is very
      //difficult to be grabbed by the thumb finger since it is so thin.
      //However, on web dont apply padding since it adds offset to the thumb button!
      ...(Platform.OS === 'android'
        ? {
            width: '50%' as const,
            marginLeft: '25%' as const,
            transform: [{ scaleX: 2 }, { scaleY: 2 }],
            paddingVertical: 8
          }
        : Platform.OS === 'ios'
          ? { paddingVertical: 16, paddingHorizontal: 8 }
          : {})
    },
    maxLabel: {
      fontSize: 12,
      lineHeight: 12,
      //fontStyle: 'italic',
      //color: theme.colors.cardSecondary
      color: 'green'
    },
    input: {
      fontSize: 16,
      paddingVertical: 5,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.primary
    }
  });
