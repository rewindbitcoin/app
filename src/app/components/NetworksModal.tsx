import React, { useCallback } from 'react';
import { type NetworkId, networkMapping } from '../../app/lib/network';
import { View } from 'react-native';
import { Modal, VerticalChoice, Text } from '../../common/ui';
import { useTranslation } from 'react-i18next';

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
  const networkIds = Object.keys(networkMapping) as Array<NetworkId>;
  const choices = networkIds.map((id: NetworkId) => {
    return (
      <View
        key={id}
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          flex: 1
        }}
      >
        <Text className="capitalize">{id}</Text>
        <Text className="text-slate-500 max-w-[70%] text-justify">
          {id === 'BITCOIN'
            ? t('help.bitcoinNetworkBrief')
            : id === 'STORM'
              ? t('help.stormNetworkBrief')
              : id === 'TESTNET'
                ? t('help.testnetNetworkBrief')
                : id === 'REGTEST'
                  ? t('help.regtestNetworkBrief')
                  : id}
        </Text>
      </View>
    );
  });
  const handleSelect = useCallback(
    (index: number) => {
      onSelect(networkIds[index] as NetworkId);
    },
    [onSelect, networkIds]
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
          index={networkIds.indexOf(networkId!)}
          choices={choices}
          onSelect={handleSelect}
        />
      </View>
    </Modal>
  );
}
