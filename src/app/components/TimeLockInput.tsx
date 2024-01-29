//This component must work both for SendBitcoin and SetUpVault
import React, { useState, useCallback, useRef } from 'react';
import { CardEditableSlider } from '../../common/ui';
import { useTranslation } from 'react-i18next';
import { useGlobalStateStorage } from '../../common/contexts/StorageContext';
import { SERIALIZABLE } from '../../common/lib/storage';
import {
  defaultSettings,
  Settings,
  SETTINGS_GLOBAL_STORAGE
} from '../lib/settings';
import { fromBlocks, toBlocks } from '../lib/timeUtils';
import { formatLockTime } from '../lib/fees';

export default function TimeLockInput({
  initialValue,
  min,
  max,
  label,
  onValueChange,
  formatError
}: {
  initialValue: number;
  min: number;
  max: number;
  label: string;
  onValueChange: (value: number | null) => void;
  formatError?: (invalidValue: number) => string | undefined;
}) {
  const { t } = useTranslation();
  const [settings] = useGlobalStateStorage<Settings>(
    SETTINGS_GLOBAL_STORAGE,
    SERIALIZABLE,
    defaultSettings
  );
  if (!settings)
    throw new Error(
      'This component should only be started after settings has been retrieved from storage'
    );
  const [mode, setMode] = useState<'days' | 'blocks'>('days');

  const [isMaxFunds, setIsMaxFunds] = useState<boolean>(initialValue === max);

  const modeMin = fromBlocks(min, min, max, mode);
  const modeMax = fromBlocks(max, min, max, mode);
  //We will change the key in CardEditableSlider creating new components
  //when min, max or mode change. When this happens we will initialize the
  //components with the last know correct amount. So keep track of it:
  const nextInitialValueRef = useRef<number>(initialValue);
  const initialModeValue = isMaxFunds
    ? modeMax
    : fromBlocks(nextInitialValueRef.current, min, max, mode);

  const onUnitPress = useCallback(() => {
    setMode(mode === 'days' ? 'blocks' : 'days');
  }, [mode]);

  const formatValue = useCallback(
    (value: number) => {
      if (max === undefined) throw new Error(`formatValue needs a valid max`);
      return formatLockTime(toBlocks(value, mode), t);
    },
    [t, max, mode]
  );

  const formatModeError = useCallback(
    (modeInvalidAmount: number) => {
      if (formatError) {
        return formatError(toBlocks(modeInvalidAmount, mode));
      }
      return;
    },
    [formatError, mode]
  );

  const onModeValueChange = useCallback(
    (newModeValue: number | null) => {
      let newValue: number | null;
      if (newModeValue === null) newValue = null;
      //If the received value newModeValue from CardEditableSlider is equal
      //to the one passed as value - see below: fromBlocks(value, min, max, mode, btcFiat)
      //Then pass the original value, not the toBlocks(fromBlocks(value)) which
      //would loose precision in the btcRate
      else if (newModeValue === initialModeValue) newValue = initialValue;
      else if (newModeValue === modeMin) newValue = min;
      else if (newModeValue === modeMax) newValue = max;
      else newValue = toBlocks(newModeValue, mode);
      setIsMaxFunds(newValue === max);
      if (newValue !== null) nextInitialValueRef.current = newValue;
      onValueChange(newValue);
    },
    [
      initialValue,
      min,
      max,
      initialModeValue,
      modeMin,
      modeMax,
      mode,
      onValueChange
    ]
  );

  return (
    <CardEditableSlider
      locale={settings.LOCALE}
      label={label}
      key={`${mode}-${min}-${max}`}
      minimumValue={modeMin}
      maximumValue={modeMax}
      initialValue={initialModeValue}
      onValueChange={onModeValueChange}
      step={1}
      formatValue={formatValue}
      {...(formatError ? { formatError: formatModeError } : {})}
      unit={mode}
      onUnitPress={onUnitPress}
    />
  );
}
