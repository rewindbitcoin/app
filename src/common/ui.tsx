import React from 'react';
import * as RN from 'react-native';
export { ActivityIndicator, TextInput } from 'react-native';
import { useTheme, Theme } from './theme';
import EditableSlider from './components/EditableSlider';
export { EditableSlider };
import CardEditableSlider from './components/CardEditableSlider';
export { CardEditableSlider };
export { useTheme, Theme };
export { Button } from './components/Button';
export { Text } from './components/Text';
export * from './components/Toast';
export { Modal } from './components/Modal';
export { Switch } from './components/Switch';
export { KeyboardAwareScrollView } from './components/KeyboardAwareScrollView';
import NumberInput from './components/NumberInput';
export { NumberInput };
import SegmentedControl from './components/SegmentedControl';
export { SegmentedControl };

//TODO: convert it to "Divider" and move it to components
export const HorLineSep = ({ style }: { style?: RN.ViewStyle }) => {
  const theme = useTheme();
  return (
    <RN.View
      style={[
        style,
        {
          height: 1,
          width: '100%',
          marginVertical: 10,
          backgroundColor: theme.colors.listsSeparator
        }
      ]}
    />
  );
};
