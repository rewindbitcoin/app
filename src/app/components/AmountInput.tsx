// Copyright (C) 2025 Jose-Luis Landabaso - https://rewindbitcoin.com
// Licensed under the GNU GPL v3 or later. See the LICENSE file for details.

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
import { useLocalization } from '../hooks/useLocalization';

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
  const { locale, currency } = useLocalization();
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
        locale,
        currency
      });
    },
    [knownSatsValueMap, mode, btcFiat, settings.SUB_UNIT, locale, currency]
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
        locale={locale}
        label={label}
        key={`${mode}-${min}-${max}`}
        maxLabel={t('amount.maxLabel').toUpperCase()}
        minimumValue={modeMin}
        maximumValue={modeMax}
        initialValue={modeInitialValue}
        onValueChange={onModeValueChange}
        step={getAmountModeStep(mode)}
        formatValue={formatValue}
        unit={mode === 'Fiat' ? currency : mode}
        onUnitPress={onUnitPress}
      />
      <UnitsModal
        isVisible={showUnitsModal}
        mode={mode}
        locale={locale}
        currency={currency}
        btcFiat={btcFiat}
        onSelect={onModeSelect}
        onClose={() => setShowUnitsModal(false)}
      />
    </>
  );
}

export default React.memo(AmountInput);
