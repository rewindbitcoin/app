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

import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Keyboard,
  Platform,
  DimensionValue
} from 'react-native';
import Slider from '@react-native-community/slider';
import {
  useFonts,
  RobotoMono_400Regular
} from '@expo-google-fonts/roboto-mono';

interface EditableSliderProps {
  value: number | null;
  minimumValue: number;
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

function countDecimalDigits(number: number): number {
  const numberAsString = number.toString();
  // Check if the number has a fractional part
  if (numberAsString.includes('.')) {
    const fractionalPart = numberAsString.split('.')[1];
    return fractionalPart!.length;
  }
  return 0; // No fractional part means 0 digits after the decimal point
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
  step = DEFAULT_STEP
}: {
  snappedValue: number;
  step?: number;
}): string {
  const digits = countDecimalDigits(step);
  return snappedValue.toFixed(digits);
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
  step = DEFAULT_STEP,
  formatError,
  onValueChange,
  formatValue = value => `${value}`
}: EditableSliderProps) => {
  const snappedValue = snap({ value, minimumValue, maximumValue, step });

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
  // Parent may change min, max or step. Previously good values
  // may not be ok anymore or previously old values may be again
  useEffect(() => {
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
      if (newSnappedValue !== sliderManagedValue)
        setSliderManagedValue(newSnappedValue);
      const newStrValue = snap2Str({ snappedValue: newSnappedValue, step });
      if (strValue !== newStrValue) setStrValue(newStrValue);
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
      if (newSliderManagedValue !== sliderManagedValue)
        setSliderManagedValue(newSliderManagedValue);
    }
    if (onValueChange && newSnappedValue !== value) {
      onValueChange(newSnappedValue);
    }
  }, [minimumValue, maximumValue, step]);

  const [strValue, setStrValue] = useState<string>(
    snappedValue === null
      ? snap2Str({ snappedValue: minimumValue, step })
      : snap2Str({ snappedValue, step })
  );

  const { t } = useTranslation();

  const keyboardType = step === 1 ? 'number-pad' : 'numeric';
  const [fontsLoaded] = useFonts({ RobotoMono_400Regular });

  const onSliderValueChange = (value: number) => {
    //The react-native slider is buggy and may return slightly off values
    if (value < minimumValue) value = minimumValue;
    if (value > maximumValue) value = maximumValue;
    const snappedValue = snap({ value, minimumValue, maximumValue, step });
    if (snappedValue === null)
      throw new Error(
        `Slider returned off-limits value: ${minimumValue} >= ${value} >= ${maximumValue}, step: ${step}, snappedValue: ${snappedValue}`
      );
    else lastValidSnappedValue.current = snappedValue;
    const strValue = snap2Str({ snappedValue, step });
    setStrValue(strValue);
    if (snappedValue !== prevSnappedValue.current && onValueChange) {
      onValueChange(snappedValue);
    }
  };
  const onTextInputValueChange = (strValue: string) => {
    setStrValue(strValue);
    const isValidStrValue =
      !isNaN(Number(strValue)) &&
      Number(strValue) >= minimumValue &&
      Number(strValue) <= maximumValue;
    if (isValidStrValue) {
      const value = Number(strValue);
      const snappedValue = snap({ value, minimumValue, maximumValue, step });
      if (snappedValue === null) throw new Error('strNumberInRange not valid');
      setSliderManagedValue(snappedValue);
      if (value !== prevSnappedValue.current && onValueChange)
        onValueChange(value);
      lastValidSnappedValue.current = snappedValue;
    } else {
      if (null !== prevSnappedValue.current && onValueChange)
        onValueChange(null);
    }
  };
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

  // These useState and useEffect below arew necessary for adjusting the
  // TextInput width on web platforms.
  // React Native, when used with React Native for Web, does not automatically resize
  // the TextInput to fit its content. This behavior differs from react native
  // for iOs and Android.
  // To address this, the width is dynamically calculated based on the text length
  // and the additional space for padding and border, ensuring the TextInput
  // appears consistent with typical web input behavior.
  const [webTextInputWidth, setWebTextInputWidth] = useState<string | null>(
    null
  );
  useEffect(() => {
    if (Platform.OS === 'web') {
      // Calculating dynamic padding and border values from the styles
      const paddingAndBorder =
        StyleSheet.flatten(styles.input).padding * 2 +
        StyleSheet.flatten(styles.input).borderWidth * 2;
      setWebTextInputWidth(
        `calc(${strValue.length}ch + ${paddingAndBorder}px)`
      );
    }
  }, [strValue]);

  //TODO: thumbTintColor is only Android

  return (
    <View style={styles.container}>
      <Text
        style={[
          fontsLoaded ? { fontFamily: 'RobotoMono_400Regular' } : {},
          snappedValue === null ? { color: 'red' } : {},
          styles.status
        ]}
      >
        {formattedValue}
      </Text>
      <View style={styles.control}>
        <Slider
          style={styles.slider}
          minimumValue={minimumValue}
          maximumValue={maximumValue}
          onValueChange={onSliderValueChange}
          onSlidingStart={Keyboard.dismiss}
          value={sliderManagedValue}
          {...(snappedValue === null ? { thumbTintColor: 'red' } : {})}
        />
        <TextInput
          keyboardType={keyboardType}
          style={[
            webTextInputWidth !== null && {
              width: webTextInputWidth as DimensionValue
            },
            styles.input,
            fontsLoaded && { fontFamily: 'RobotoMono_400Regular' },
            snappedValue === null && { color: 'red' }
          ]}
          value={strValue}
          onChangeText={onTextInputValueChange}
        />
      </View>
    </View>
  );
};

export default EditableSlider;

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%'
  },
  status: {
    textAlign: 'left',
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
    padding: 10,
    borderWidth: 1,
    borderColor: 'gray',
    borderRadius: 5
  }
});
