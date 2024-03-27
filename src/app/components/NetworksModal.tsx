import React, { useCallback } from 'react';
import { type NetworkId, networkMapping } from '../../app/lib/network';
import { View } from 'react-native';
import { Modal, VerticalChoice, Text, useTheme } from '../../common/ui';
import { useTranslation } from 'react-i18next';
import { subUnits, SubUnit } from '../lib/settings';
import { fromSats } from '../lib/btcRates';
import { numberToLocalizedString } from '../../common/lib/numbers';

const modes = ['Fiat', ...subUnits] as Array<SubUnit | 'Fiat'>;
export default function NetworksModal({
  isVisible,
  networkId,
  onSelect,
  onClose
}: {
  isVisible: boolean;
  networkId?: NetworkId;
  onSelect: (networkId: NetworkId) => void;
  onClose?: () => void;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const choices = modes.map(mode => {
    return (
      <View
        key={mode}
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          flex: 1
        }}
      >
        <Text>{presentedUnit}</Text>
        <Text style={{ color: theme.colors.cardSecondary }}>
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
      <VerticalChoice
        {...(unit === undefined ? {} : { index: modes.indexOf(unit) })}
        choices={choices}
        onSelect={handleSelect}
      />
    </Modal>
  );
}
