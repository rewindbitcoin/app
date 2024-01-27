/**
 * The `EditableSlider` combines a slider with a text input for precise value
 * entry. It supports value snapping based on a specified step and handles
 * `null` values, indicating an indeterminate state. Key behaviors and
 * internal implementation details include:
 *
 * - Snapping Behavior: Values are snapped to the nearest increment defined
 *   by the 'step' size. For example, if the step is 0.01 and a value of 0.213
 *   is passed, it adjusts to 0.21.
 *
 * - Minimum and Maximum Values: The 'minimumValue' and 'maximumValue' can
 *   be any number, allowing users to select these exact values regardless of
 *   the step setting mentioned above.
 *
 * - The slider's position must always forced to be put within range but marked
 *   in red if invalid. If the initialValue passed is not within range,
 *   it will initialized to the minimumValue.
 *
 * - Emitting Null Values: The component may emit `null` via 'onValueChange'
 *   on invalid number entered in the TextInput.
 *
 * - Internal Implementation:
 *     - 'numericInputControlledValue' represents the text input's value. It can be imprecise and
 *       is not constrained by range. Updated when the slider is used
 *       or during TextInput interaction, even if invalid.
 *       Triggers 'onValueChange' with the
 *       correct snapped value if valid and within range.
 *     - 'onValueChange' is called with valid values or `null` in case of
 *       user input errors in the NumericInput text box.
 */

const INPUT_MAX_LENGTH = 18;
import React, { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { Locale } from '../../i18n/i18n';

import { View, Text, StyleSheet, Platform } from 'react-native';
import NumberInput from './NumberInput';
import Slider from '@react-native-community/slider';
import { useFonts } from 'expo-font';
import { RobotoMono_400Regular } from '@expo-google-fonts/roboto-mono';
import { useTheme, Theme } from './ui/theme';
import {
  localizedStrToNumber,
  numberToFormattedFixed,
  numberToFixed,
  countDecimalDigits
} from '../../common/lib/numbers';

interface EditableSliderProps {
  locale: Locale;
  initialValue: number;
  minimumValue: number;
  maxLabel?: string;
  numberFormatting?: boolean;
  maximumValue: number;
  step?: number;
  formatError?: (invalidValue: number) => string | undefined;
  onValueChange: (value: number | null) => void;
  formatValue: (value: number) => string;
}

const DEFAULT_STEP = 0.01;

/** This function returns a number which correspondes to the snap of value into step.
 * The function will return minimumValue or maximumValue if the snapped
 * value is not within the range. It will return null if the snapped value
 * and the value are not within range
 */
export function snapWithinRange({
  value,
  minimumValue,
  maximumValue,
  step = DEFAULT_STEP
}: {
  value: number | null;
  minimumValue: number;
  maximumValue: number;
  step?: number;
}): number | null {
  if (value === null) return null;
  const digits = countDecimalDigits(step);
  const snappedValue = Number(
    (step * Math.round(value / step)).toFixed(digits)
  );

  if (snappedValue > maximumValue && value <= maximumValue) return value;
  else if (snappedValue < minimumValue && value >= minimumValue) return value;
  else if (snappedValue >= minimumValue && snappedValue <= maximumValue)
    return snappedValue;
  else return null;
}

/**
 * Given a value number we return the string.
 * Here step is used just to find out the number of decimal places used.
 * If step is 0.02 then here we only care about the 2 decimal positions.
 */
function toFixed({
  value,
  locale,
  numberFormatting,
  step = DEFAULT_STEP
}: {
  value: number;
  locale: Locale;
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
  numberFormatting = true,
  step = DEFAULT_STEP,
  locale,
  formatError,
  onValueChange,
  formatValue = value => `${value}`
}: EditableSliderProps) => {
  const theme = useTheme();
  const styles = getStyles(theme);

  const { t } = useTranslation();

  const [fontsLoaded] = useFonts({ RobotoMono_400Regular });

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
      onValueChange(snappedWithinRange);
    },
    [minimumValue, maximumValue, step, locale, numberFormatting, onValueChange]
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
        onValueChange(value);
      } else {
        onValueChange(null);
      }
    },
    [minimumValue, maximumValue, step, onValueChange, locale]
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

  const thumbTintColor = isValidValue
    ? Platform.OS === 'ios'
      ? {}
      : { thumbTintColor: theme.colors.primary }
    : { thumbTintColor: theme.colors.red };

  return (
    <View style={styles.container}>
      <Text
        style={[
          fontsLoaded ? { fontFamily: 'RobotoMono_400Regular' } : {},
          styles.status,
          isValidValue ? {} : { color: theme.colors.red }
        ]}
      >
        {statusText}
      </Text>
      <View style={styles.control}>
        <Slider
          style={styles.slider}
          minimumTrackTintColor={theme.colors.primary}
          minimumValue={minimumValue}
          maximumValue={maximumValue}
          onValueChange={onSliderValueChange}
          {...thumbTintColor}
          value={sliderUncontrolledValue}
        />
        <NumberInput
          locale={locale}
          maxLength={INPUT_MAX_LENGTH}
          style={{
            ...styles.input,
            ...(isValidValue ? {} : { color: theme.colors.red })
          }}
          strValue={numericInputControlledValue}
          onChangeValue={onNumberInputChangeValue}
        />
        {maxLabel && value === maximumValue ? (
          <View style={{ position: 'absolute', top: -7, right: 2 }}>
            <Text style={{ fontSize: 10, color: theme.colors.cardSecondary }}>
              {maxLabel}
            </Text>
          </View>
        ) : null}
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
    status: {
      textAlign: 'left',
      paddingLeft: 10,
      fontSize: 13,
      color: theme.colors.cardSecondary,
      width: '100%'
    },
    control: {
      flexDirection: 'row',
      alignItems: 'center',
      width: '100%',
      marginTop: 15
    },
    slider: {
      flex: 1,
      //Applying padding is very important in android real device or the thumb is very
      //difficult to be grabbed by the thumb finger since it is so thin.
      //However, on web dont apply padding since it adds offset to the thumb button!
      ...(Platform.OS !== 'web' ? { padding: 15 } : {}),
      marginRight: 10
    },
    input: {
      fontSize: 15,
      paddingVertical: 5,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.primary
    }
  });
