//This is a HOC of EditableSlider formatted for Data Input
import React from 'react';
import {
  View,
  StyleSheet,
  GestureResponderEvent,
  Pressable
} from 'react-native';
import { useTheme, Theme } from '../theme';
import { Text } from './Text';
import EditableSlider from './EditableSlider';
import type { Locale } from '../../i18n/i18n';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

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
  formatValue = value => `${value}`,
  locale
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
  locale: Locale;
}) {
  const theme = useTheme();
  const styles = getStyles(theme);
  const Unit = (
    <View>
      {onUnitPress ? (
        <Pressable onPress={onUnitPress}>
          <View style={styles.cardModeContainer}>
            <Text style={styles.cardModeAction}>{unit}</Text>
            <MaterialCommunityIcons
              name="menu-swap-outline"
              style={styles.cardModeAction}
            />
          </View>
        </Pressable>
      ) : (
        <Text style={{ fontSize: 12, color: theme.colors.cardSecondary }}>
          {unit}
        </Text>
      )}
    </View>
  );
  return (
    <>
      <View style={styles.cardHeader}>
        <Text variant="cardTitle" style={styles.cardTitle}>
          {label}
        </Text>
      </View>
      <View style={styles.card}>
        <EditableSlider
          unit={Unit}
          {...(maxLabel ? { maxLabel: maxLabel.toUpperCase() } : {})}
          locale={locale}
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
    cardModeContainer: { flexDirection: 'row', alignItems: 'center' },
    cardModeAction: {
      color: theme.colors.primary,
      fontSize: 12,
      paddingVertical: 5,
      marginVertical: -5
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
    }
  });
