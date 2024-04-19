//This component must work both for SendBitcoin and SetUpVault
import React, {
  useState,
  useCallback,
  useContext,
  useRef,
  useMemo
} from 'react';
import { CardEditableSlider } from '../../common/ui';
import { useTranslation } from 'react-i18next';
import { WalletContext, WalletContextType } from '../contexts/WalletContext';
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
  onUserSelectedAmountChange
}: {
  initialValue: number;
  min: number;
  max: number;
  /** flag indicating wheter to initialize CardEditableSlider with the last
   * valid value or with max*/
  isMaxAmount: boolean;
  label: string;
  onUserSelectedAmountChange: (value: number | null) => void;
}) {
  const { t } = useTranslation();
  const context = useContext<WalletContextType | null>(WalletContext);
  if (context === null) throw new Error('Context was not set');
  const { btcFiat } = context;
  const { settings } = useSettings();
  if (!settings)
    throw new Error(
      'This component should only be started after settings has been retrieved from storage'
    );
  const [mode, setMode] = useState<SubUnit | 'Fiat'>(
    btcFiat !== null ? 'Fiat' : settings.SUB_UNIT
  );

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

  const onUnitSelect = useCallback((unit: SubUnit | 'Fiat') => {
    setShowUnitsModal(false);
    setMode(unit);
  }, []);

  const formatValue = useCallback(
    (modeValue: number) => {
      return formatBtc(
        {
          amount: toSats(modeValue, mode, btcFiat, knownSatsValueMap),
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
      knownSatsValueMap,
      mode,
      btcFiat,
      settings.SUB_UNIT,
      settings.LOCALE,
      settings.CURRENCY
    ]
  );

  const onModeValueChange = useCallback(
    (newModeValue: number | null) => {
      let newValue: number | null;
      if (newModeValue === null) newValue = null;
      else newValue = toSats(newModeValue, mode, btcFiat, knownSatsValueMap);
      if (newValue !== null) nextInitialValueRef.current = newValue;
      onUserSelectedAmountChange(newValue);
    },
    [knownSatsValueMap, mode, btcFiat, onUserSelectedAmountChange]
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

export default React.memo(AmountInput);
