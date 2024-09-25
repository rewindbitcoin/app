import React, { useCallback } from 'react';
import type { NetworkId } from '../../app/lib/network';
import { View, Text } from 'react-native';
import { Modal, VerticalChoice } from '../../common/ui';
import { useTranslation } from 'react-i18next';
const networkIds = [
  'TAPE',
  'TESTNET',
  'BITCOIN',
  'REGTEST'
] as Array<NetworkId>;

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
        <Text className="capitalize w-20">{id.toLowerCase()}</Text>
        <Text className="text-slate-500 flex-1">
          {id === 'BITCOIN'
            ? t('network.help.bitcoinNetworkBrief')
            : id === 'TAPE'
              ? t('network.help.tapeNetworkBrief')
              : id === 'TESTNET'
                ? t('network.help.testnetNetworkBrief')
                : id === 'REGTEST'
                  ? t('network.help.regtestNetworkBrief')
                  : id}
        </Text>
      </View>
    );
  });
  const handleSelect = useCallback(
    (index: number) => {
      onSelect(networkIds[index] as NetworkId);
    },
    [onSelect]
  );
  return (
    <Modal
      title={t('network.testOrRealTitle')}
      subTitle={t('network.testOrRealSubTitle')}
      closeButtonText={t('cancelButton')}
      icon={{ family: 'FontAwesome5', name: 'bitcoin' }}
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
