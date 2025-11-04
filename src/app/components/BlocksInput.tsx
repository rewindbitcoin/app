// Copyright (C) 2025 Jose-Luis Landabaso - https://rewindbitcoin.com
// Licensed under the GNU GPL v3 or later. See the LICENSE file for details.

//This component must work both for SendBitcoin and SetUpVault
import React, { useState, useCallback, useRef, useMemo } from 'react';
import { Text } from 'react-native';
import { CardEditableSlider, InfoButton, Modal } from '../../common/ui';
import { useTranslation } from 'react-i18next';
import { fromBlocks, toBlocks, getBlocksModeStep } from '../lib/timeUtils';
import { formatBlocks } from '../lib/format';
import { useLocalization } from '../hooks/useLocalization';

function BlocksInput({
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
  onValueChange: (value: number | null, type: 'USER' | 'RESET') => void;
}) {
  const { t } = useTranslation();
  const { locale } = useLocalization();
  const [mode, setMode] = useState<'days' | 'blocks'>('days');
  const [coldAddressHelp, setColdAddressHelp] = useState<boolean>(false);
  const showColdAddressHelp = useCallback(() => setColdAddressHelp(true), []);
  const hideColdAddressHelp = useCallback(() => setColdAddressHelp(false), []);

  const modeMin = fromBlocks(min, mode);
  const modeMax = fromBlocks(max, mode);
  const knownBlocksValueMap = useMemo(
    () => ({ [modeMin]: min, [modeMax]: max }),
    [modeMin, modeMax, min, max]
  );
  //We will change the key in CardEditableSlider creating new components
  //when min, max or mode change. When this happens we will initialize the
  //components with the last know correct amount. So keep track of it:
  const nextInitialValueRef = useRef<number>(initialValue);
  const modeInitialValue = fromBlocks(nextInitialValueRef.current, mode);
  const onUnitPress = useCallback(() => {
    setMode(mode === 'days' ? 'blocks' : 'days');
  }, [mode]);

  const formatValue = useCallback(
    (modeValue: number) => {
      const blocks = toBlocks(modeValue, mode, knownBlocksValueMap);
      return t('vaultSetup.securityLockTimeDescription', {
        blocks: formatBlocks(blocks, t, locale)
      });
    },
    [t, knownBlocksValueMap, mode, locale]
  );

  const onModeValueChange = useCallback(
    (newModeValue: number | null, type: 'USER' | 'RESET') => {
      let newValue: number | null;
      if (newModeValue === null) newValue = null;
      else newValue = toBlocks(newModeValue, mode, knownBlocksValueMap);
      if (newValue !== null) nextInitialValueRef.current = newValue;
      onValueChange(newValue, type);
    },
    [knownBlocksValueMap, mode, onValueChange]
  );

  const headerIcon = useMemo(
    () => <InfoButton onPress={showColdAddressHelp} />,
    [showColdAddressHelp]
  );

  return (
    <>
      <CardEditableSlider
        locale={locale}
        label={label}
        headerIcon={headerIcon}
        key={`${mode}-${min}-${max}`}
        minimumValue={modeMin}
        maximumValue={modeMax}
        initialValue={modeInitialValue}
        onValueChange={onModeValueChange}
        step={getBlocksModeStep(mode)}
        formatValue={formatValue}
        unit={
          mode === 'blocks' ? t('blocksInput.blocks') : t('blocksInput.days')
        }
        onUnitPress={onUnitPress}
      />
      <Modal
        title={t('blocksInput.coldAddress.helpTitle')}
        icon={{ family: 'FontAwesome6', name: 'shield-halved' }}
        isVisible={coldAddressHelp}
        onClose={hideColdAddressHelp}
        closeButtonText={t('understoodButton')}
      >
        <Text className="text-base pl-2 pr-2 text-slate-600">
          {t('blocksInput.coldAddress.helpText')}
        </Text>
      </Modal>
    </>
  );
}

export default React.memo(BlocksInput);
