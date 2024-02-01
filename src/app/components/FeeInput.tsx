const FEE_RATE_STEP = 0.01;

//This component must work both for SendBitcoin and SetUpVault
import React, { useContext, useCallback, useRef, useMemo } from 'react';
import { CardEditableSlider } from '../../common/ui';
import { useGlobalStateStorage } from '../../common/contexts/StorageContext';
import { SERIALIZABLE } from '../../common/lib/storage';
import {
  defaultSettings,
  Settings,
  SETTINGS_GLOBAL_STORAGE
} from '../lib/settings';
import { WalletContext, WalletContextType } from '../contexts/WalletContext';
import { snapWithinRange } from '../../common/lib/numbers';
import { formatFeeRate } from '../lib/fees';
import { useTranslation } from 'react-i18next';

export default function FeeInput({
  label,
  initialValue,
  txSize,
  onValueChange
}: {
  label: string;
  initialValue: number;
  txSize: number | null;
  onValueChange: (value: number | null) => void;
}) {
  const context = useContext<WalletContextType | null>(WalletContext);
  if (context === null) throw new Error('Context was not set');
  const { feeEstimates, btcFiat: btcFiatOriginal } = context;
  if (!feeEstimates)
    throw new Error('FeeInput cannot be called with unset feeEstimates');
  const btcFiat = btcFiatOriginal === undefined ? null : btcFiatOriginal;
  const [settings] = useGlobalStateStorage<Settings>(
    SETTINGS_GLOBAL_STORAGE,
    SERIALIZABLE,
    defaultSettings
  );
  if (!settings)
    throw new Error(
      'This component should only be started after settings has been retrieved from storage'
    );
  const { t } = useTranslation();

  //We need a LUT from-to presented slider values (which are snapped)
  const snappedFeeEstimates = useMemo(() => {
    return Object.fromEntries(
      Object.entries(feeEstimates).map(([targetTime, feeRate]) => {
        const snappedWithinRange = snapWithinRange({
          minimumValue: Number.MIN_VALUE,
          maximumValue: Number.MAX_VALUE,
          step: FEE_RATE_STEP,
          value: feeRate
        });

        if (typeof snappedWithinRange !== 'number') {
          throw new Error('snap function did not return a number');
        }

        return [targetTime, snappedWithinRange];
      })
    );
  }, [feeEstimates]);

  const formatValue = useCallback(
    (value: number) =>
      formatFeeRate(
        {
          feeRate: value,
          locale: settings.LOCALE,
          currency: settings.CURRENCY,
          txSize,
          btcFiat,
          feeEstimates: snappedFeeEstimates
        },
        t
      ),
    [
      btcFiat,
      settings.LOCALE,
      settings.CURRENCY,
      snappedFeeEstimates,
      t,
      txSize
    ]
  );

  //We will change the key in CardEditableSlider creating new components
  //when min, max or mode change. When this happens we will initialize the
  //components with the last know correct amount. So keep track of it:
  const nextInitialValueRef = useRef<number>(initialValue);
  const snappedInitialValue = snapWithinRange({
    minimumValue: Number.MIN_VALUE,
    maximumValue: Number.MAX_VALUE,
    step: FEE_RATE_STEP,
    value: nextInitialValueRef.current
  });
  if (snappedInitialValue === null)
    throw new Error('snappedInitialValue should be defined');

  const snappedMin = Math.min(...Object.values(snappedFeeEstimates));
  const snappedMax = Math.max(...Object.values(snappedFeeEstimates));
  const min = Math.min(...Object.values(feeEstimates));
  const max = Math.max(...Object.values(feeEstimates));

  const onSnappedValueChange = useCallback(
    (newSnappedValue: number | null) => {
      let newValue: number | null;
      if (newSnappedValue === null) newValue = null;
      //Don't loose precission if we know oroginal values:
      else if (newSnappedValue === snappedMin) newValue = min;
      else if (newSnappedValue === snappedMax) newValue = max;
      else newValue = newSnappedValue;
      if (newValue !== null) nextInitialValueRef.current = newValue;
      onValueChange(newValue);
    },
    [min, max, snappedMin, snappedMax, onValueChange]
  );

  return (
    <CardEditableSlider
      locale={settings.LOCALE}
      label={label}
      key={`${min}-${max}`}
      minimumValue={snappedMin}
      maximumValue={snappedMax}
      initialValue={snappedInitialValue}
      onValueChange={onSnappedValueChange}
      step={FEE_RATE_STEP}
      formatValue={formatValue}
      unit={'sats/vB'}
    />
  );
}
