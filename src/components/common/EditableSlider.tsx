import React, { useState } from 'react';
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
  initialValue?: number;
  minimumValue?: number;
  maximumValue?: number;
  step?: number;
  initialMessage?: string;
  errorMessage?: string;
  onValueChange?: (value: number | null) => void;
  formatValue: (value: number) => string;
}

/**
 * Similar to javascript toFixed. however, when the keyboardType is number-pad
 * (no decimals) it then returns toFixed(0).
 * It the keyboardType is in decimal mode then it returns toFixed(2) for
 * 2 decimals. However, due to the roundings it does, we do some extra work
 * to make sure the result is within bounds*/
function toFixed({
  value,
  keyboardType,
  minimumValue,
  maximumValue
}: {
  value: number;
  keyboardType: string;
  minimumValue: number;
  maximumValue: number;
}) {
  if (keyboardType === 'number-pad') return value.toFixed(0);
  else {
    while (Number(value.toFixed(2)) > maximumValue) value -= 0.01;
    while (Number(value.toFixed(2)) < minimumValue) value += 0.01;
    return value.toFixed(keyboardType === 'number-pad' ? 0 : 2);
  }
}

const EditableSlider = ({
  initialValue,
  minimumValue = 1,
  maximumValue = 1,
  step,
  initialMessage = `Pick a value...`,
  errorMessage,
  onValueChange,
  formatValue
}: EditableSliderProps) => {
  const keyboardType =
    step !== undefined &&
    Number.isInteger(step) &&
    Number.isInteger(minimumValue) &&
    Number.isInteger(maximumValue)
      ? 'number-pad'
      : 'numeric';
  if (
    initialValue !== undefined &&
    (initialValue < minimumValue ||
      initialValue > maximumValue ||
      (keyboardType === 'number-pad' &&
        step !== undefined &&
        (initialValue - minimumValue) % step !== 0))
  ) {
    throw new Error(`Invalid initialValue`);
  }
  if (initialValue === undefined) initialValue = minimumValue;
  errorMessage =
    errorMessage ||
    `Pick a number between ${minimumValue} and ${maximumValue}.`;
  const [fontsLoaded] = useFonts({ RobotoMono_400Regular });
  const handlePressOutside = () => Keyboard.dismiss();
  const strValidation = (strValue: string) =>
    !isNaN(Number(strValue)) &&
    Number(strValue) >= minimumValue &&
    Number(strValue) <= maximumValue;
  const [strValue, setStrValue] = useState<string>(
    toFixed({ value: initialValue, keyboardType, minimumValue, maximumValue })
  );
  const [formattedValue, setFormattedValue] = useState<string>(initialMessage);
  return (
    <TouchableWithoutFeedback onPress={handlePressOutside}>
      <View style={styles.container}>
        <View style={styles.control}>
          <Slider
            {...(step !== undefined && { step: step })}
            style={styles.slider}
            minimumValue={minimumValue}
            maximumValue={maximumValue}
            onValueChange={value => {
              setStrValue(
                toFixed({ value, keyboardType, minimumValue, maximumValue })
              );
              setFormattedValue(formatValue(value));
              if (onValueChange) onValueChange(value);
            }}
            value={strValidation(strValue) ? Number(strValue) : initialValue}
            onSlidingStart={handlePressOutside}
          />
          <TextInput
            keyboardType={keyboardType}
            style={[
              styles.input,
              fontsLoaded && { fontFamily: 'RobotoMono_400Regular' }
            ]}
            value={strValue}
            onChangeText={strValue => {
              setStrValue(strValue);
              if (strValidation(strValue)) {
                const value = Number(strValue);
                setFormattedValue(formatValue(value));
                if (onValueChange) onValueChange(value);
              } else {
                if (!errorMessage) throw new Error(`Set an errorMessage`);
                setFormattedValue(errorMessage);
                if (onValueChange) onValueChange(null);
              }
            }}
          />
        </View>
        <Text
          style={[
            fontsLoaded ? { fontFamily: 'RobotoMono_400Regular' } : {},
            !strValidation(strValue) ? { color: 'red' } : {}
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
