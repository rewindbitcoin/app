/**
 * value can be null which means its undetermined (the user is editing the
 * input box and entered an invalid value, for example)
 * minimumValue and maximumValue are adapted so that they are within step
 * strValue is just a draft and imprecise, which dpes not need to br within snap
 *  - set strValue when the user uses the slider
 *  - keep the strValue when the user interacts with textinput, even if strValue is invalid
 *    - When invalid trigger onValueChange with incorrect value
 *  - when strValue is a valud number within range, then trigger an onValueChange (with the correct snapped value)
 *  stre
 * if value is passed and it's not within step, onValueChange is returned with
 * the corrected value
 * It's a managed component. value is set from what the parent passes
 * This component calls onValueChange with valid values or with null
 * when the user makes an error.
 * An internal strValue is kept, which may contain errors
 * strValue may contain values which are different than value:
 *  - They are wrong => value is null
 *  - They don't fall into a valid step -> value is null
 */
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableWithoutFeedback,
  Keyboard
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
  errorMessage?: string;
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

function snap({
  value,
  minimumValue,
  maximumValue,
  step
}: {
  value: number;
  minimumValue: number;
  maximumValue: number;
  step: number;
}): string {
  const digits = countDecimalDigits(step);
  minimumValue = Number(
    (step * Math.ceil(minimumValue / step)).toFixed(digits)
  );
  maximumValue = Number(
    (step * Math.floor(maximumValue / step)).toFixed(digits)
  );
  value = Number((step * Math.round(value / step)).toFixed(digits));
  value = Math.min(value, maximumValue);
  value = Math.max(value, minimumValue);
  return value.toFixed(digits);
}

const EditableSlider = ({
  value,
  minimumValue,
  maximumValue,
  step = 0.01,
  errorMessage,
  onValueChange,
  formatValue = value => `${value}`
}: EditableSliderProps) => {
  errorMessage =
    errorMessage ||
    `Pick a number between ${minimumValue} and ${maximumValue}.`;

  const snappedValue =
    value === null
      ? null
      : Number(snap({ value, minimumValue, maximumValue, step }));

  const prevSnappedValue = useRef<number | null>();
  //Parent may be passing values out of range and not step-valid
  //Instead of throwing, notify parent that the correct value is, in fact,
  //snappedValue
  useEffect(() => {
    if (snappedValue !== prevSnappedValue.current && onValueChange)
      onValueChange(snappedValue);
    prevSnappedValue.current = snappedValue;
  }, [snappedValue]);
  //If parent changes minimumValue, step or maximumValue, then
  //force update Slider and TextInput
  //This is done because snappedValue might have been adjusted to be within the
  //new range
  //However, do not notify parent about this. Parent is already notified through
  //the useEffect above and when the Slider or TextInput changes
  useEffect(() => {
    if (snappedValue !== null) {
      setSliderManagedValue(snappedValue);
      setStrValue(snappedValue.toString());
    }
  }, [minimumValue, maximumValue, step]);
  const mountStrValue = snap({
    value: value === null ? minimumValue : value,
    minimumValue,
    maximumValue,
    step
  });
  const [strValue, setStrValue] = useState<string>(mountStrValue);
  const [sliderManagedValue, setSliderManagedValue] = useState<number>(
    Number(mountStrValue)
  );

  //TODO: in android i dont get number-pad?
  const keyboardType = step === 1 ? 'number-pad' : 'numeric';
  const [fontsLoaded] = useFonts({ RobotoMono_400Regular });
  const handlePressOutside = () => Keyboard.dismiss();

  const strNumberInRange = (strValue: string | undefined) =>
    !isNaN(Number(strValue)) &&
    Number(strValue) >= minimumValue &&
    Number(strValue) <= maximumValue;

  const onSliderValueChange = (value: number) => {
    const strValue = snap({ value, minimumValue, maximumValue, step });
    value = Number(strValue);
    setStrValue(strValue);
    if (value !== prevSnappedValue.current && onValueChange)
      onValueChange(value);
  };
  const onTextInputValueChange = (strValue: string) => {
    setStrValue(strValue);
    if (strNumberInRange(strValue)) {
      const value = Number(strValue);
      setSliderManagedValue(
        Number(snap({ value, minimumValue, maximumValue, step }))
      );
      if (value !== prevSnappedValue.current && onValueChange)
        onValueChange(value);
    } else {
      if (null !== prevSnappedValue.current && onValueChange)
        onValueChange(null);
    }
  };
  const formattedValue =
    snappedValue === null ? errorMessage : formatValue(snappedValue);

  return (
    <TouchableWithoutFeedback onPress={handlePressOutside}>
      <View style={styles.container}>
        <View style={styles.control}>
          <Slider
            style={styles.slider}
            minimumValue={minimumValue}
            maximumValue={maximumValue}
            onValueChange={onSliderValueChange}
            value={sliderManagedValue}
            onSlidingStart={handlePressOutside}
          />
          <TextInput
            keyboardType={keyboardType}
            style={[
              styles.input,
              fontsLoaded && { fontFamily: 'RobotoMono_400Regular' }
            ]}
            value={strValue}
            onChangeText={onTextInputValueChange}
          />
        </View>
        <Text
          style={[
            fontsLoaded ? { fontFamily: 'RobotoMono_400Regular' } : {},
            !strNumberInRange(strValue) ? { color: 'red' } : {}
          ]}
        >
          {formattedValue}
        </Text>
      </View>
    </TouchableWithoutFeedback>
  );
};

export default EditableSlider;

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%'
  },
  control: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    marginBottom: 10
  },
  slider: {
    flex: 1,
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
