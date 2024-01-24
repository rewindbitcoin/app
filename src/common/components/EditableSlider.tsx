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

import { View, Text, TextInput, StyleSheet, Platform } from 'react-native';
import Slider from '@react-native-community/slider';
import {
  useFonts,
  RobotoMono_400Regular
} from '@expo-google-fonts/roboto-mono';
import { useTheme, Theme } from './ui/theme';
import {
  numberToLocalizedFixed,
  numberToFixed,
  localizedStrToNumber,
  countDecimalDigits,
  localizeInputNumericString,
  unlocalizedKeyboardFix,
  getNewCursor
} from '../../common/lib/numbers';

interface EditableSliderProps {
  locale: Locale;
  value: number | null;
  minimumValue: number;
  maxLabel?: string;
  localizeNumbers?: boolean;
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
function snap2Str({
  snappedValue,
  locale,
  localizeNumbers,
  step = DEFAULT_STEP
}: {
  snappedValue: number;
  locale: Locale;
  localizeNumbers: boolean;
  step: number;
}): string {
  const digits = countDecimalDigits(step);
  return localizeNumbers
    ? numberToLocalizedFixed(snappedValue, digits, locale)
    : numberToFixed(snappedValue, digits, locale);
}

function inRange({
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
  localizeNumbers = true,
  step = DEFAULT_STEP,
  locale,
  formatError,
  onValueChange,
  formatValue = value => `${value}`
}: EditableSliderProps) => {
  const theme = useTheme();
  const styles = getStyles(theme);
  const snappedValue = snap({ value, minimumValue, maximumValue, step });
  const [selection, setSelection] = useState<{
    start: number;
    end: number;
  } | null>(null);

  // Keep track of prevSnappedValue:
  const prevSnappedValue = useRef<number | null>();
  useEffect(() => {
    prevSnappedValue.current = snappedValue;
  }, [snappedValue]);

  // lastValidSnappedValue will be updated onTextInputValueChange,
  // onSliderValueChange or onEffect([min,max,step]), below:
  const lastValidSnappedValue = useRef<number | null>(null);

  //Set initial InputText and Slider values.
  const [sliderManagedValue, setSliderManagedValue] = useState<number>(
    snappedValue === null ? minimumValue : snappedValue
  );

  const [strValue, setStrValue] = useState<string>(
    snappedValue === null
      ? snap2Str({ snappedValue: minimumValue, locale, localizeNumbers, step })
      : snap2Str({ snappedValue, locale, localizeNumbers, step })
  );
  // Parent may change min, max or step. Previously good values
  // may not be ok anymore or previously old values may be again
  useEffect(() => {
    const snappedValue = snap({ value, minimumValue, maximumValue, step });
    const newSnappedValue =
      snappedValue !== null
        ? snappedValue
        : inRange({
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
        localizeNumbers,
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
    //Parent may change these:
    minimumValue,
    maximumValue,
    step,

    locale,
    localizeNumbers,
    onValueChange

    //This breaks this hook. DONT ADD IT:
    //value,
  ]);

  const { t } = useTranslation();

  //https://lefkowitz.me/visual-guide-to-react-native-textinput-keyboardtype-options/
  const keyboardType = step === 1 ? 'number-pad' : 'numeric';
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
        localizeNumbers,
        step
      });
      setStrValue(strValue);
      setSelection({ start: strValue.length, end: strValue.length });
      if (snappedValue !== prevSnappedValue.current && onValueChange) {
        onValueChange(snappedValue);
      }
    },
    [minimumValue, maximumValue, step, locale, localizeNumbers, onValueChange]
  );

  const lastProgramaticalSetSelectionEpochRef = useRef<number>(0);

  //TODO: When using Bitcoin, then its not valid to pass more than 8 decimals
  //TODO: print "Invalid Number"
  //
  //IMPORTANT:
  //onTextInputValueChange is called before selection (setSelection) has been
  //set: https://github.com/facebook/react-native/pull/35603
  //In this component which will be the next cursor position using setSelection
  //Then we discard all onSelectionChange which ara called as a reaction for
  //changing text (if the are called within a few milliseconds after we have
  //setSelection here). Cursor position is 100% controlled in onTextInputValueChange.
  //This prevents missbehaviour in iOS. We still allow the user selecting
  //text when onSelectionChange is called not as a reaction of changing text.
  const onTextInputValueChange = useCallback(
    (newStrTextInputValue: string) => {
      //Cursor position for strValue (old input text value):
      //We will set the next cursor position for the returned newStrValue
      const cursor = selection ? selection.end : strValue.length;
      let newStrValue = newStrTextInputValue;
      if (newStrTextInputValue.length > INPUT_MAX_LENGTH) {
        //Don't do anything. Dont' change cursor, don't add text
        //We have a limit of 20 chars for localized number operations
        ///(see number.ts) and being at 18 means that adding a number can
        //also add a decimal separator so that would be 2 letters. Just
        //don't allow more than that
        //setSelection({ start: cursor, end: cursor });
        //lastProgramaticalSetSelectionEpochRef.current = new Date().getTime();
        return;
      }
      if (
        keyboardType === 'numeric' &&
        (Platform.OS === 'ios' || Platform.OS === 'android')
      )
        newStrValue = unlocalizedKeyboardFix(newStrValue, strValue, locale);
      if (localizeNumbers)
        newStrValue = localizeInputNumericString(newStrValue, locale);

      //console.log('onTextInputValueChange', {
      //  newStrTextInputValue,
      //  strValue,
      //  cursor,
      //  newStrValue
      //});
      if (!Number.isNaN(localizedStrToNumber(newStrValue, locale))) {
        const isBackSpaceOnDelimiter =
          newStrValue === strValue &&
          newStrTextInputValue.length === strValue.length - 1;
        const newCursor = getNewCursor(newStrValue, strValue, cursor, locale);
        if (isBackSpaceOnDelimiter) {
          setSelection({ start: cursor - 1, end: cursor - 1 });
          lastProgramaticalSetSelectionEpochRef.current = new Date().getTime();
        } else {
          setSelection({ start: newCursor, end: newCursor });
          lastProgramaticalSetSelectionEpochRef.current = new Date().getTime();
        }
      }

      setStrValue(newStrValue);
      const isValidStrValue =
        !Number.isNaN(localizedStrToNumber(newStrValue, locale)) &&
        localizedStrToNumber(newStrValue, locale) >= minimumValue &&
        localizedStrToNumber(newStrValue, locale) <= maximumValue;
      if (isValidStrValue) {
        const value = localizedStrToNumber(newStrValue, locale);
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
    [
      selection?.end,
      keyboardType,
      strValue,
      minimumValue,
      maximumValue,
      step,
      locale,
      localizeNumbers,
      onValueChange
    ]
  );

  let formattedValue;
  if (snappedValue === null) {
    const last = lastValidSnappedValue.current;
    if (last === null)
      throw new Error(
        'Cannot format error because there are not previous valid values'
      );
    // get formatError(). If formatError does not exist or returns undefined,
    // then build standard error messages:
    formattedValue =
      formatError?.({
        lastValidSnappedValue: last,
        strValue
      }) ||
      (last !== null && last > maximumValue
        ? t('editableSlider.maxValueError', { maximumValue })
        : last !== null && last < minimumValue
          ? t('editableSlider.maxValueError', { maximumValue })
          : t('editableSlider.invalidValue'));
  } else formattedValue = formatValue(snappedValue);

  const [maxLengthWidth, setMaxLengthWidth] = useState<number | null>(null);

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
        {formattedValue}
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
        <Text
          onLayout={({ nativeEvent }) => {
            //This <Text> Component is a fake component which will be not visible
            //It is used to compute the width of the font (for INPUT_MAX_LENGTH
            //zeros)
            //Since we use a fixed-width font-family (Roboto) then we can
            //compute the TextInput width later
            if (fontsLoaded) {
              const { width } = nativeEvent.layout;
              setMaxLengthWidth(width);
            }
          }}
          style={[
            {
              fontSize: styles.input.fontSize,
              position: 'absolute',
              opacity: 0,
              zIndex: -1000
            },
            fontsLoaded && { fontFamily: 'RobotoMono_400Regular' }
          ]}
        >
          {'0'.repeat(INPUT_MAX_LENGTH)}
        </Text>
        <TextInput
          maxLength={INPUT_MAX_LENGTH}
          {...(selection ? { selection } : {})}
          keyboardType={keyboardType}
          style={[
            maxLengthWidth !== null && {
              width:
                (maxLengthWidth * Math.max(1, strValue.length)) /
                INPUT_MAX_LENGTH
            },
            styles.input,
            fontsLoaded && { fontFamily: 'RobotoMono_400Regular' },
            snappedValue === null && { color: theme.colors.red }
          ]}
          value={strValue}
          onChangeText={onTextInputValueChange}
          onSelectionChange={({ nativeEvent }) => {
            const currentEpoch = new Date().getTime();
            if (
              currentEpoch - lastProgramaticalSetSelectionEpochRef.current >
              100
            ) {
              setSelection(nativeEvent.selection);
            }
          }}
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
      padding: 0,
      borderWidth: 0,
      ...Platform.select({ web: { outlineWidth: 0 }, default: {} }),
      paddingVertical: 5,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.primary
    }
  });
