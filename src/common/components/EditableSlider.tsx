/**
 * The `EditableSlider` combines a slider with a text input for precise value
 * entry. It supports value snapping based on a specified step and handles
 * `null` values, indicating an indeterminate state. Key behaviors and
 * internal implementation details include:
 *
 * - Snapping Behavior: Values are snapped to the nearest increment defined
 *   by the 'step' size. For example, if the step is 0.01 and a value of 0.213
 *   is passed, it adjusts to 0.21 and immediatelly calls parent using
 *   onValueChange with the newly stepped value. The default step size is 0.01.
 *
 * - Minimum and Maximum Values: The 'minimumValue' and 'maximumValue' can
 *   be any number, allowing users to select these exact values regardless of
 *   the step setting mentioned above.
 *
 * - Handling Null Values: When a `null` value is passed, indicating an
 *   indeterminate state, the slider's position depends on the last valid value:
 *     - Initially `null`, the slider defaults to 'minimumValue'.
 *     - Last valid value greater than 'maximumValue' sets the slider to
 *       'maximumValue'.
 *     - Last valid value less than 'minimumValue' sets the slider to
 *       'minimumValue'.
 *     - The slider is always positioned within the min-max range, even when
 *       the value is undetermined.
 *     - Note that in indeterminate state the slider position does not
 *       represent a value. However, the slider must still be set.
 *
 * - Emitting Null Values: The component may emit `null` via 'onValueChange'
 *   in two scenarios:
 *     - Invalid number entered in the TextInput.
 *     - Changes in min, max, or step values result in an invalid current value.
 *
 * - Internal Implementation:
 *     - 'strValue' represents the text input's value. It can be imprecise and
 *       is not constrained by the snap range. Updated when the slider is used
 *       or during TextInput interaction, even if invalid. May be updated when
 *       min, max, or step values change. Triggers 'onValueChange' with the
 *       correct snapped value if valid and within range.
 *     - The component is controlled: 'value' is managed by the parent,
 *       meaning the state for the value is also maintained by the parent.
 *     - 'onValueChange' is called with valid values or `null` in case of
 *       user input errors.
 */

const INPUT_MAX_LENGTH = 18;
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { Locale } from '../../i18n/i18n';

import { View, Text, StyleSheet, Platform } from 'react-native';
import NumberInput from './NumberInput';
import Slider from '@react-native-community/slider';
import {
  useFonts,
  RobotoMono_400Regular
} from '@expo-google-fonts/roboto-mono';
import { useTheme, Theme } from './ui/theme';
import {
  numberToFormattedFixed,
  numberToFixed,
  countDecimalDigits
} from '../../common/lib/numbers';

interface EditableSliderProps {
  locale: Locale;
  value: number | null;
  minimumValue: number;
  maxLabel?: string;
  numberFormatting?: boolean;
  maximumValue: number;
  step?: number;
  formatError?: ({
    lastValidSnappedValue,
    strValue
  }: {
    lastValidSnappedValue: number;
    strValue: string;
  }) => string | undefined;
  onValueChange?: (value: number | null) => void;
  formatValue: (value: number) => string;
}

const DEFAULT_STEP = 0.01;

/** This function returns a number which correspondes to the snap of value into step.
 * The function will return minimumValue or maximumValue if the snapped
 * value is not within the range. It will return null if the snapped value
 * and the value are not within range
 */
export function snap({
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
 * Given a snappedValue number we return the string.
 * This function assumes that snappedValue has already been snapped.
 * Here step is used just to find out the number of decimal places used.
 * If step is 0.02 then here we only care about the 2 decimal positions.
 * We already assume that snappedValue wont be 10.01.
 */
function snap2Str({
  snappedValue,
  locale,
  numberFormatting,
  step = DEFAULT_STEP
}: {
  snappedValue: number;
  locale: Locale;
  numberFormatting: boolean;
  step: number;
}): string {
  const digits = countDecimalDigits(step);
  return numberFormatting
    ? numberToFormattedFixed(snappedValue, digits, locale)
    : numberToFixed(snappedValue, digits, locale);
}

function isInRange({
  value,
  minimumValue,
  maximumValue
}: {
  value: number | null;
  minimumValue: number;
  maximumValue: number;
}) {
  return value !== null && value >= minimumValue && value <= maximumValue;
}

const EditableSlider = ({
  value,
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

  const snappedValue = snap({ value, minimumValue, maximumValue, step });

  // Keep track of prevSnappedValue:
  const prevSnappedValue = useRef<number | null>();
  useEffect(() => {
    prevSnappedValue.current = snappedValue;
  }, [snappedValue]);

  // lastValidSnappedValue will be updated onNumberInputChangeValue,
  // onSliderValueChange or onEffect([min,max,step]), below:
  const lastValidSnappedValue = useRef<number | null>(null);

  //Set initial InputText and Slider values.
  const [sliderManagedValue, setSliderManagedValue] = useState<number>(
    snappedValue === null ? minimumValue : snappedValue
  );

  const [strValue, setStrValue] = useState<string>(
    snappedValue === null
      ? snap2Str({ snappedValue: minimumValue, locale, numberFormatting, step })
      : snap2Str({ snappedValue, locale, numberFormatting, step })
  );
  // Parent may change min, max or step. Previously good values
  // may not be ok anymore or previously old values may be again
  useEffect(() => {
    const snappedValue = snap({ value, minimumValue, maximumValue, step });
    const newSnappedValue =
      snappedValue !== null
        ? snappedValue
        : isInRange({
              value: lastValidSnappedValue.current,
              minimumValue,
              maximumValue
            })
          ? lastValidSnappedValue.current
          : null;
    if (newSnappedValue !== null) {
      lastValidSnappedValue.current = newSnappedValue;
      //When min, max or step change, make sure the Slider is in correct
      //position and TextInput shows the correct value again
      setSliderManagedValue(newSnappedValue);
      const newStrValue = snap2Str({
        snappedValue: newSnappedValue,
        locale,
        numberFormatting,
        step
      });
      setStrValue(newStrValue);
    } else {
      // Even if the component does not have a a correct value,
      // the slider must be set to some position within min and max...
      const newSliderManagedValue =
        lastValidSnappedValue.current === null
          ? minimumValue
          : lastValidSnappedValue.current > maximumValue
            ? maximumValue
            : lastValidSnappedValue.current < minimumValue
              ? minimumValue
              : lastValidSnappedValue.current;
      setSliderManagedValue(newSliderManagedValue);
    }
    if (onValueChange && newSnappedValue !== value) {
      onValueChange(newSnappedValue);
    }
  }, [
    //This breaks this hook. DONT ADD IT:
    //value,

    //Parent may change these:
    minimumValue,
    maximumValue,
    step,

    locale,
    numberFormatting,
    onValueChange
  ]);

  const { t } = useTranslation();

  //https://lefkowitz.me/visual-guide-to-react-native-textinput-keyboardtype-options/
  const [fontsLoaded] = useFonts({ RobotoMono_400Regular });

  const onSliderValueChange = useCallback(
    (value: number) => {
      //The react-native slider is buggy and may return slightly off values
      if (value < minimumValue) value = minimumValue;
      if (value > maximumValue) value = maximumValue;
      const snappedValue = snap({ value, minimumValue, maximumValue, step });
      if (snappedValue === null)
        throw new Error(
          `Slider returned off-limits value: ${minimumValue} >= ${value} >= ${maximumValue}, step: ${step}, snappedValue: ${snappedValue}`
        );
      else lastValidSnappedValue.current = snappedValue;
      const strValue = snap2Str({
        snappedValue,
        locale,
        numberFormatting,
        step
      });
      setStrValue(strValue);
      if (snappedValue !== prevSnappedValue.current && onValueChange) {
        onValueChange(snappedValue);
      }
    },
    [minimumValue, maximumValue, step, locale, numberFormatting, onValueChange]
  );

  //TODO: When using Bitcoin, then its not valid to pass more than 8 decimals
  //TODO: print "Invalid Number"
  //
  //IMPORTANT:
  //onNumberInputChangeValue is called before selection (setSelection) has been
  //set: https://github.com/facebook/react-native/pull/35603
  //In this component which will be the next cursor position using setSelection
  //Then we discard all onSelectionChange which ara called as a reaction for
  //changing text (if the are called within a few milliseconds after we have
  //setSelection here). Cursor position is 100% controlled in onNumberInputChangeValue.
  //This prevents missbehaviour in iOS. We still allow the user selecting
  //text when onSelectionChange is called not as a reaction of changing text.
  const onNumberInputChangeValue = useCallback(
    (value: number | null) => {
      const isValidValue =
        value !== null &&
        !Number.isNaN(value) &&
        value >= minimumValue &&
        value <= maximumValue;
      if (isValidValue) {
        const snappedValue = snap({
          value,
          minimumValue,
          maximumValue,
          step
        });
        if (snappedValue === null)
          throw new Error('strNumberInRange not valid');
        setSliderManagedValue(snappedValue);
        if (value !== prevSnappedValue.current && onValueChange)
          onValueChange(value);
        lastValidSnappedValue.current = snappedValue;
      } else {
        if (null !== prevSnappedValue.current && onValueChange)
          onValueChange(null);
      }
    },
    [minimumValue, maximumValue, step, onValueChange]
  );

  let statusText: string;
  if (snappedValue === null) {
    const last = lastValidSnappedValue.current;
    if (last === null)
      throw new Error(
        'Cannot format error because there are not previous valid values'
      );
    // get formatError(). If formatError does not exist or returns undefined,
    // then build standard error messages:
    statusText =
      formatError?.({
        lastValidSnappedValue: last,
        strValue
      }) ||
      (last !== null && last > maximumValue
        ? t('editableSlider.maxValueError', { maximumValue })
        : last !== null && last < minimumValue
          ? t('editableSlider.maxValueError', { maximumValue })
          : t('editableSlider.invalidValue'));
  } else statusText = formatValue(snappedValue);

  const thumbTintColor =
    snappedValue === null
      ? { thumbTintColor: theme.colors.red }
      : Platform.OS === 'ios'
        ? {}
        : { thumbTintColor: theme.colors.primary };

  //console.log('render', selection, strValue);
  return (
    <View style={styles.container}>
      <Text
        style={[
          fontsLoaded ? { fontFamily: 'RobotoMono_400Regular' } : {},
          styles.status,
          snappedValue === null ? { color: theme.colors.red } : {}
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
          value={sliderManagedValue}
        />
        <NumberInput
          locale={locale}
          maxLength={INPUT_MAX_LENGTH}
          style={{
            ...styles.input,
            ...(snappedValue === null ? { color: theme.colors.red } : {})
          }}
          value={strValue}
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
