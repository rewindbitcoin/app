// Copyright (C) 2025 Jose-Luis Landabaso - https://rewindbitcoin.com
// Licensed under the GNU GPL v3 or later. See the LICENSE file for details.

//This is a HOC of EditableSlider formatted for Data Input
import React, { useMemo } from 'react';
import { Text, View, StyleSheet } from 'react-native';
import { useTheme, Theme } from '../theme';
import EditableSlider from './EditableSlider';
import IconButton from './IconButton';

function CardEditableSlider({
  initialValue,
  minimumValue,
  maximumValue,
  label,
  headerIcon,
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
  headerIcon?: React.ReactNode;
  unit: string;
  onUnitPress?: () => void;
  maxLabel?: string;
  step: number;
  formatError?: (invalidValue: number) => string | undefined;
  onValueChange: (value: number | null, type: 'USER' | 'RESET') => void;
  formatValue: (value: number) => string;
  locale: string;
}) {
  const theme = useTheme();
  const styles = useMemo(() => getStyles(theme), [theme]);
  const Unit = (
    <View style={styles.unitContainer}>
      {onUnitPress ? (
        <IconButton
          size={14}
          separationRatio={0}
          mode="icon-left"
          iconFamily="MaterialCommunityIcons"
          iconName="menu-swap-outline"
          text={unit}
          onPress={onUnitPress}
        />
      ) : (
        <Text style={styles.unitText}>{unit}</Text>
      )}
    </View>
  );
  return (
    <>
      <View className="pb-2 flex-row items-center">
        <Text className="px-2 text-left font-medium text-card-secondary text-sm uppercase">
          {label}
        </Text>
        {headerIcon}
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

export default React.memo(CardEditableSlider);

const getStyles = (theme: Theme) => {
  return StyleSheet.create({
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.colors.card,
      borderRadius: 5,
      borderWidth: 0,
      paddingHorizontal: 8,
      paddingVertical: 12
    },
    unitContainer: { marginLeft: 8 },
    unitText: { fontSize: 14, color: theme.colors.text }
  });
};
