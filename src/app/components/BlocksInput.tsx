//This component must work both for SendBitcoin and SetUpVault
import React, { useState, useCallback, useRef, useMemo } from 'react';
import { CardEditableSlider } from '../../common/ui';
import { useTranslation } from 'react-i18next';
import { useGlobalStateStorage } from '../../common/contexts/StorageContext';
import { SERIALIZABLE } from '../../common/lib/storage';
import {
  defaultSettings,
  Settings,
  SETTINGS_GLOBAL_STORAGE
} from '../lib/settings';
import { fromBlocks, toBlocks, getBlocksModeStep } from '../lib/timeUtils';
import { formatLockTime } from '../lib/fees';

export default function BlocksInput({
  initialValue,
  min,
  max,
  label,
  onValueChange
}: {
  initialValue: number;
  min: number;
  max: number;
  label: string;
  onValueChange: (value: number | null) => void;
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

  const modeMin = fromBlocks(min, mode);
  const modeMax = fromBlocks(max, mode);
  const knownBlocksValueMap = useMemo(
    () => ({ [modeMin]: min, [modeMax]: max }),
    [modeMin, modeMax, min, max]
  );
  console.log({ knownBlocksValueMap });
  //We will change the key in CardEditableSlider creating new components
  //when min, max or mode change. When this happens we will initialize the
  //components with the last know correct amount. So keep track of it:
  const nextInitialValueRef = useRef<number>(initialValue);
  const modeInitialValue = fromBlocks(nextInitialValueRef.current, mode);
  const onUnitPress = useCallback(() => {
    setMode(mode === 'days' ? 'blocks' : 'days');
  }, [mode]);

  const formatValue = useCallback(
    (modeValue: number) =>
      formatLockTime(toBlocks(modeValue, mode, knownBlocksValueMap), t),
    [t, knownBlocksValueMap, mode]
  );

  const onModeValueChange = useCallback(
    (newModeValue: number | null) => {
      let newValue: number | null;
      if (newModeValue === null) newValue = null;
      else newValue = toBlocks(newModeValue, mode, knownBlocksValueMap);
      if (newValue !== null) nextInitialValueRef.current = newValue;
      onValueChange(newValue);
    },
    [knownBlocksValueMap, mode, onValueChange]
  );

  return (
    <CardEditableSlider
      locale={settings.LOCALE}
      label={label}
      key={`${mode}-${min}-${max}`}
      minimumValue={modeMin}
      maximumValue={modeMax}
      initialValue={modeInitialValue}
      onValueChange={onModeValueChange}
      step={getBlocksModeStep(mode)}
      formatValue={formatValue}
      unit={mode}
      onUnitPress={onUnitPress}
    />
  );
}
