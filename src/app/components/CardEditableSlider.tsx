//This is a HOC of EditableSlider formatted for Data Input
import React from 'react';
import { View, StyleSheet, GestureResponderEvent } from 'react-native';
import { Text, Button, useTheme, Theme } from '../../common/components/ui';
import EditableSlider from '../../common/components/EditableSlider';
import {
  defaultSettings,
  Settings,
  SETTINGS_GLOBAL_STORAGE
} from '../lib/settings';
import { SERIALIZABLE } from '../../common/lib/storage';
import { useGlobalStateStorage } from '../../common/contexts/StorageContext';

export default function CardEditableSlider({
  initialValue,
  minimumValue,
  maximumValue,
  label,
  unit,
  onUnitPress,
  maxLabel,
  step,
  formatError,
  onValueChange,
  formatValue = value => `${value}`
}: {
  initialValue: number;
  minimumValue: number;
  maximumValue: number;
  label: string;
  unit: string;
  onUnitPress?: (event: GestureResponderEvent) => void;
  maxLabel?: string;
  step: number;
  formatError?: (invalidValue: number) => string | undefined;
  onValueChange: (value: number | null) => void;
  formatValue: (value: number) => string;
}) {
  const theme = useTheme();
  const styles = getStyles(theme);
  const [settings] = useGlobalStateStorage<Settings>(
    SETTINGS_GLOBAL_STORAGE,
    SERIALIZABLE,
    defaultSettings
  );
  if (!settings)
    throw new Error(
      'This component should only be started after settings has been retrieved from storage'
    );
  return (
    <>
      <View style={styles.cardHeader}>
        <Text variant="cardTitle" style={styles.cardTitle}>
          {label}
        </Text>
        <View style={styles.cardModeRotator}>
          {onUnitPress ? (
            <Button mode="text" fontSize={12} onPress={onUnitPress}>
              {`${unit} ⇅`}
            </Button>
          ) : (
            <Text style={{ fontSize: 12, color: theme.colors.cardSecondary }}>
              {unit}
            </Text>
          )}
        </View>
      </View>
      <View style={styles.card}>
        <EditableSlider
          {...(maxLabel ? { maxLabel: maxLabel.toUpperCase() } : {})}
          locale={settings.LOCALE}
          {...(formatError ? { formatError } : {})}
          minimumValue={minimumValue}
          maximumValue={maximumValue}
          initialValue={initialValue}
          onValueChange={onValueChange}
          step={step}
          formatValue={formatValue}
        />
      </View>
    </>
  );
}

const getStyles = (theme: Theme) =>
  StyleSheet.create({
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.colors.card,
      borderRadius: 5,
      borderWidth: 0,
      padding: 10
    },
    cardHeader: {
      alignItems: 'center', // Align items vertically in the center
      flex: 1,
      flexDirection: 'row'
    },
    cardTitle: {
      marginVertical: 10,
      marginLeft: 10,
      alignSelf: 'stretch', //To ensure that textAlign works with short texts too
      textAlign: 'left'
    },
    helpIcon: {
      marginLeft: 10,
      fontSize: 16,
      color: theme.colors.primary
    },
    cardModeRotator: {
      flex: 1,
      marginRight: 10,
      flexDirection: 'row',
      //flex: 1,
      justifyContent: 'flex-end'
    }
  });
