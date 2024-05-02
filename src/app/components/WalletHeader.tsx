import React, { useState, useCallback } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import {
  utxosDataBalance,
  type UtxosData,
  VaultsStatuses,
  Vaults,
  getVaultsBalance
} from '../lib/vaults';
import type { Wallet } from '../lib/wallets';
import UnitsModal from './UnitsModal';
import type { SubUnit } from '../lib/settings';
import { useSettings } from '../hooks/useSettings';
import { IconButton, useTheme } from '../../common/ui';
import { fromSats } from '../lib/btcRates';

const WalletHeader = ({
  utxosData,
  vaults,
  vaultsStatuses,
  btcFiat,
  wallet
}: {
  utxosData: UtxosData | undefined;
  vaults: Vaults | undefined;
  vaultsStatuses: VaultsStatuses | undefined;
  btcFiat: number | undefined;
  wallet: Wallet | undefined;
}) => {
  console.log(JSON.stringify({ vaults, vaultsStatuses }, null, 2));
  const [showUnitsModal, setShowUnitsModal] = useState<boolean>(false);
  const { settings } = useSettings();
  if (!settings)
    throw new Error(
      'This component should only be started after settings has been retrieved from storage'
    );
  const [mode, setMode] = useState<SubUnit | 'Fiat'>(
    typeof btcFiat !== 'number' ? 'Fiat' : settings.SUB_UNIT
  );
  const onUnitPress = useCallback(() => {
    setShowUnitsModal(true);
  }, []);
  const onUnitSelect = useCallback((unit: SubUnit | 'Fiat') => {
    setShowUnitsModal(false);
    setMode(unit);
  }, []);
  const balance = utxosData ? utxosDataBalance(utxosData) : 0;
  const theme = useTheme();
  return (
    <View className="bg-white">
      {!utxosData || !wallet ? (
        <ActivityIndicator color={theme.colors.primary} />
      ) : (
        <>
          <Text className="text-xl">Hot Balance</Text>
          <View className="flex-row items-center justify-center">
            <Text className="font-bold text-2xl pr-3">
              {fromSats(balance, mode, btcFiat)}
            </Text>
            <IconButton
              size={16}
              separationRatio={0}
              mode="icon-left"
              iconFamily="MaterialCommunityIcons"
              iconName="menu-swap-outline"
              text={mode === 'Fiat' ? settings.CURRENCY : mode}
              onPress={onUnitPress}
            />
          </View>
          <UnitsModal
            isVisible={showUnitsModal}
            unit={mode}
            locale={settings.LOCALE}
            currency={settings.CURRENCY}
            btcFiat={btcFiat}
            onSelect={onUnitSelect}
            onClose={() => setShowUnitsModal(false)}
          />
          {vaults && vaultsStatuses && (
            <Text className="text-xl">
              Frozen funds {getVaultsBalance(vaults, vaultsStatuses).frozen}
            </Text>
          )}
          <Text className="text-xl">Funds being defrozen</Text>
          <Text className="text-xl">Rescued Funds</Text>
          <Text>{`Wallet ${JSON.stringify(wallet, null, 2)}`}</Text>
        </>
      )}
    </View>
  );
};

export default React.memo(WalletHeader);
