//This component must work both for SendBitcoin and SetUpVault
import React, { useState, useCallback, useContext, useRef } from 'react';
import { CardEditableSlider } from '../../common/ui';
import { useTranslation } from 'react-i18next';
import { useGlobalStateStorage } from '../../common/contexts/StorageContext';
import { SERIALIZABLE } from '../../common/lib/storage';
import { WalletContext, WalletContextType } from '../contexts/WalletContext';
import {
  SubUnit,
  defaultSettings,
  Settings,
  SETTINGS_GLOBAL_STORAGE
} from '../lib/settings';
import {
  formatBtc,
  fromSats,
  toSats,
  getAmountModeStep
} from '../lib/btcRates';
import UnitsModal from './UnitsModal';

export default function AmountInput({
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
  const context = useContext<WalletContextType | null>(WalletContext);
  if (context === null) throw new Error('Context was not set');
  const { btcFiat } = context;
  const [settings] = useGlobalStateStorage<Settings>(
    SETTINGS_GLOBAL_STORAGE,
    SERIALIZABLE,
    defaultSettings
  );
  if (!settings)
    throw new Error(
      'This component should only be started after settings has been retrieved from storage'
    );
  const [mode, setMode] = useState<SubUnit | 'Fiat'>(
    btcFiat !== null ? 'Fiat' : settings.SUB_UNIT
  );

  const [isMaxFunds, setIsMaxFunds] = useState<boolean>(initialValue === max);
  const [showUnitsModal, setShowUnitsModal] = useState<boolean>(false);

  const modeMin = fromSats(min, min, max, mode, btcFiat);
  const modeMax = fromSats(max, min, max, mode, btcFiat);
  //We will change the key in CardEditableSlider creating new components
  //when min, max or mode change. When this happens we will initialize the
  //components with the last know correct amount. So keep track of it:
  const nextInitialValueRef = useRef<number>(initialValue);
  const initialModeValue = isMaxFunds
    ? modeMax
    : fromSats(nextInitialValueRef.current, min, max, mode, btcFiat);

  const onUnitPress = useCallback(() => {
    setShowUnitsModal(true);
  }, []);

  const onUnitSelect = useCallback((unit: SubUnit | 'Fiat') => {
    setShowUnitsModal(false);
    setMode(unit);
  }, []);

  const formatValue = useCallback(
    (value: number) => {
      if (max === undefined) throw new Error(`formatValue needs a valid max`);
      return formatBtc(
        {
          amount: toSats(value, mode, btcFiat),
          subUnit: settings.SUB_UNIT,
          btcFiat,
          locale: settings.LOCALE,
          currency: settings.CURRENCY
        },
        t
      );
    },
    [
      t,
      max,
      mode,
      btcFiat,
      settings.SUB_UNIT,
      settings.LOCALE,
      settings.CURRENCY
    ]
  );

  const formatModeError = useCallback(
    (modeInvalidAmount: number) => {
      if (formatError) {
        return formatError(toSats(modeInvalidAmount, mode, btcFiat));
      }
      return;
    },
    [btcFiat, formatError, mode]
  );

  const onModeValueChange = useCallback(
    (newModeValue: number | null) => {
      let newValue: number | null;
      if (newModeValue === null) newValue = null;
      //If the received value newModeValue from CardEditableSlider is equal
      //to the one passed as value - see below: fromSats(value, min, max, mode, btcFiat)
      //Then pass the original value, not the toSats(fromSats(value)) which
      //would loose precision in the btcRate
      else if (newModeValue === initialModeValue) newValue = initialValue;
      else if (newModeValue === modeMin) newValue = min;
      else if (newModeValue === modeMax) newValue = max;
      else newValue = toSats(newModeValue, mode, btcFiat);
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
      btcFiat,
      onValueChange
    ]
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
        initialValue={initialModeValue}
        onValueChange={onModeValueChange}
        step={getAmountModeStep(mode)}
        formatValue={formatValue}
        {...(formatError ? { formatError: formatModeError } : {})}
        unit={mode === 'Fiat' ? settings.CURRENCY : mode}
        onUnitPress={onUnitPress}
      />
      <UnitsModal
        isVisible={showUnitsModal}
        unit={mode}
        locale={settings.LOCALE}
        currency={settings.CURRENCY}
        btcFiat={btcFiat}
        onSelect={onUnitSelect}
        onClose={() => setShowUnitsModal(false)}
      />
    </>
  );
}
