//This component must work both for SendBitcoin and SetUpVault
//When the mode, min or max is changed, then the CardEditableSlider is renewed.
//That means the parent component must reset the last value set by onValueChange
//to initialValue
import React, { useState, useCallback, useRef, useMemo } from 'react';
import { CardEditableSlider } from '../../common/ui';
import { useTranslation } from 'react-i18next';
import type { SubUnit } from '../lib/settings';
import {
  formatBtc,
  fromSats,
  toSats,
  getAmountModeStep
} from '../lib/btcRates';
import UnitsModal from './UnitsModal';
import { useSettings } from '../hooks/useSettings';

function AmountInput({
  initialValue,
  min,
  max,
  isMaxAmount,
  label,
  btcFiat,
  onValueChange
}: {
  initialValue: number;
  min: number;
  max: number;
  /** flag indicating wheter to initialize CardEditableSlider with the last
   * valid value or with max*/
  isMaxAmount: boolean;
  btcFiat: number | undefined;
  label: string;
  onValueChange: (value: number | null, type: 'USER' | 'RESET') => void;
}) {
  const { t } = useTranslation();
  const { settings, setSettings } = useSettings();
  if (!settings)
    throw new Error(
      'This component should only be started after settings has been retrieved from storage'
    );
  const mode =
    settings.FIAT_MODE && typeof btcFiat === 'number'
      ? 'Fiat'
      : settings.SUB_UNIT;

  const [showUnitsModal, setShowUnitsModal] = useState<boolean>(false);

  const modeMin = fromSats(min, mode, btcFiat);
  const modeMax = fromSats(max, mode, btcFiat);
  const knownSatsValueMap = useMemo(
    () => ({ [modeMin]: min, [modeMax]: max }),
    [modeMin, modeMax, min, max]
  );
  //We will change the key in CardEditableSlider creating new components
  //when min, max or mode change. When this happens we will initialize the
  //components with the last know correct amount. So keep track of it:
  const nextInitialValueRef = useRef<number>(isMaxAmount ? max : initialValue);
  const modeInitialValue = isMaxAmount
    ? modeMax
    : fromSats(nextInitialValueRef.current, mode, btcFiat);

  const onUnitPress = useCallback(() => {
    setShowUnitsModal(true);
  }, []);

  const onModeSelect = useCallback(
    (mode: SubUnit | 'Fiat') => {
      setShowUnitsModal(false);
      if (mode === 'Fiat') setSettings({ ...settings, FIAT_MODE: true });
      else setSettings({ ...settings, SUB_UNIT: mode, FIAT_MODE: false });
    },
    [settings, setSettings]
  );

  const formatValue = useCallback(
    (modeValue: number) => {
      return formatBtc({
        amount: toSats(modeValue, mode, btcFiat, knownSatsValueMap),
        subUnit: settings.SUB_UNIT,
        btcFiat,
        locale: settings.LOCALE,
        currency: settings.CURRENCY
      });
    },
    [
      knownSatsValueMap,
      mode,
      btcFiat,
      settings.SUB_UNIT,
      settings.LOCALE,
      settings.CURRENCY
    ]
  );

  const onModeValueChange = useCallback(
    (newModeValue: number | null, type: 'USER' | 'RESET') => {
      let newValue: number | null;
      if (newModeValue === null) newValue = null;
      else newValue = toSats(newModeValue, mode, btcFiat, knownSatsValueMap);
      if (newValue !== null) nextInitialValueRef.current = newValue;
      onValueChange(newValue, type);
    },
    [knownSatsValueMap, mode, btcFiat, onValueChange]
  );

  return (
    <>
      <CardEditableSlider
        locale={settings.LOCALE}
        label={label}
        key={`${mode}-${min}-${max}`}
        maxLabel={t('amount.maxLabel').toUpperCase()}
        minimumValue={modeMin}
        maximumValue={modeMax}
        initialValue={modeInitialValue}
        onValueChange={onModeValueChange}
        step={getAmountModeStep(mode)}
        formatValue={formatValue}
        unit={mode === 'Fiat' ? settings.CURRENCY : mode}
        onUnitPress={onUnitPress}
      />
      <UnitsModal
        isVisible={showUnitsModal}
        mode={mode}
        locale={settings.LOCALE}
        currency={settings.CURRENCY}
        btcFiat={btcFiat}
        onSelect={onModeSelect}
        onClose={() => setShowUnitsModal(false)}
      />
    </>
  );
}

export default React.memo(AmountInput);
