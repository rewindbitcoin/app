import React, { useCallback, useMemo } from 'react';
import { View, Text } from 'react-native';
import { Modal, VerticalChoice, useTheme } from '../../common/ui';
import { useTranslation } from 'react-i18next';
import { subUnits, SubUnit } from '../lib/settings';
import { fromSats } from '../lib/btcRates';
import { numberToLocalizedString } from '../../common/lib/numbers';

export default function UnitsModal({
  isVisible,
  mode,
  currency,
  btcFiat,
  locale,
  onSelect,
  onClose
}: {
  isVisible: boolean;
  mode?: SubUnit | 'Fiat';
  currency: string;
  btcFiat: number | undefined;
  locale: string;
  onSelect: (unit: SubUnit | 'Fiat') => void;
  onClose?: () => void;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  //Don't let the user pick Fiat mode if btcFiat is still not set...
  const modes: Array<SubUnit | 'Fiat'> = useMemo(
    () => (typeof btcFiat !== 'number' ? [...subUnits] : ['Fiat', ...subUnits]),
    [btcFiat]
  );
  const choices = modes.map(mode => {
    const modeAmount = fromSats(1e8, mode, btcFiat);
    const presentedUnit = mode === 'Fiat' ? currency : mode;
    //return presentedUnit;
    return (
      <View key={mode} className="flex-row justify-between flex-1 items-center">
        <Text className="text-base">{presentedUnit}</Text>
        <Text className="text-cardSecondary">
          {numberToLocalizedString(modeAmount, locale)} {presentedUnit}
          {' = 1 btc'}
        </Text>
      </View>
    );
  });
  const handleSelect = useCallback(
    (index: number) => {
      if (index === 0) onSelect('Fiat');
      else onSelect(subUnits[index - 1]!);
    },
    [onSelect]
  );
  return (
    <Modal
      title={t('units.preferredUnitTitle')}
      closeButtonText={t('cancelButton')}
      icon={{ family: 'FontAwesome5', name: 'coins' }}
      isVisible={isVisible}
      {...(onClose ? { onClose } : {})}
    >
      <View className="px-2">
        <VerticalChoice
          {...(mode === undefined ? {} : { index: modes.indexOf(mode) })}
          choices={choices}
          onSelect={handleSelect}
        />
      </View>
    </Modal>
  );
}
