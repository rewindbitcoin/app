//This component must work both for SendBitcoin and SetUpVault
//When the mode, min or max is changed, then the CardEditableSlider is renewed.
//That means the parent component must reset the last value set by onValueChange
//to initialValue

const FEE_RATE_STEP = 0.01;

import React, { useCallback, useRef, useMemo, useState } from 'react';
import {
  CardEditableSlider,
  IconType,
  InfoButton,
  Modal
} from '../../common/ui';
import { snapWithinRange } from '../../common/lib/numbers';
import { formatFeeRate } from '../lib/format';
import { computeMaxAllowedFeeRate, FeeEstimates } from '../lib/fees';
import { useTranslation } from 'react-i18next';
import { useSettings } from '../hooks/useSettings';
import { useLocalization } from '../hooks/useLocalization';
import { Text } from 'react-native';

function FeeInput({
  label,
  initialValue,
  fee,
  feeEstimates,
  btcFiat,
  onValueChange,
  helpIconAvailable = true
}: {
  label: string;
  initialValue: number;
  fee: number | null;
  feeEstimates: FeeEstimates;
  btcFiat: number | undefined;
  onValueChange: (value: number | null, type: 'USER' | 'RESET') => void;
  helpIconAvailable?: boolean;
}) {
  const { settings } = useSettings();
  if (!settings)
    throw new Error(
      'This component should only be started after settings has been retrieved from storage'
    );
  const { locale, currency } = useLocalization();
  const subUnit = settings.SUB_UNIT;
  const { t } = useTranslation();

  const [feeHelp, setFeeHelp] = useState<boolean>(false);
  const showFeeHelp = useCallback(() => setFeeHelp(true), []);
  const hideFeeHelp = useCallback(() => setFeeHelp(false), []);

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
    (feeRate: number) =>
      formatFeeRate(
        {
          fee: fee === null ? undefined : fee,
          feeRate,
          locale,
          currency,
          subUnit,
          btcFiat,
          feeEstimates: snappedFeeEstimates
        },
        t
      ),
    [fee, btcFiat, currency, locale, snappedFeeEstimates, t, subUnit]
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

  const snappedMin = 1;
  const snappedMax = computeMaxAllowedFeeRate(snappedFeeEstimates);
  const min = 1;
  const max = computeMaxAllowedFeeRate(feeEstimates);

  const onSnappedValueChange = useCallback(
    (newSnappedValue: number | null, type: 'USER' | 'RESET') => {
      let newValue: number | null;
      if (newSnappedValue === null) newValue = null;
      //Don't loose precission if we know original values:
      else if (newSnappedValue === snappedMin) newValue = min;
      else if (newSnappedValue === snappedMax) newValue = max;
      else newValue = newSnappedValue;
      if (newValue !== null) nextInitialValueRef.current = newValue;
      onValueChange(newValue, type);
    },
    [min, max, snappedMin, snappedMax, onValueChange]
  );

  const headerIcon = useMemo(
    () => <InfoButton onPress={showFeeHelp} />,
    [showFeeHelp]
  );

  const helpIcon = useMemo<IconType>(
    () => ({ family: 'MaterialCommunityIcons', name: 'pickaxe' }),
    []
  );

  return (
    <>
      <CardEditableSlider
        locale={locale}
        label={label}
        {...(helpIconAvailable ? { headerIcon } : {})}
        key={`${min}-${max}`}
        minimumValue={snappedMin}
        maximumValue={snappedMax}
        initialValue={snappedInitialValue}
        onValueChange={onSnappedValueChange}
        step={FEE_RATE_STEP}
        formatValue={formatValue}
        unit={'sats/vB'}
      />
      {helpIconAvailable && (
        <Modal
          title={t('feeInput.helpTitle')}
          icon={helpIcon}
          isVisible={feeHelp}
          onClose={hideFeeHelp}
          closeButtonText={t('understoodButton')}
        >
          <Text className="text-base pl-2 pr-2 text-slate-600">
            {t('feeInput.helpText')}
          </Text>
        </Modal>
      )}
    </>
  );
}

export default React.memo(FeeInput);
