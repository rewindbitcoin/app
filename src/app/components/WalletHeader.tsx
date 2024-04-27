import React, { useState, useCallback } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { utxosDataBalance, type UtxosData } from '../lib/vaults';
import type { Wallet } from '../lib/wallets';
import UnitsModal from './UnitsModal';
import type { SubUnit } from '../lib/settings';
import { useSettings } from '../hooks/useSettings';
import { Button } from '../../common/ui';
import { fromSats } from '../lib/btcRates';

const WalletHeader = ({
  utxosData,
  btcFiat,
  wallet
}: {
  utxosData: UtxosData | undefined;
  btcFiat: number | undefined;
  wallet: Wallet | undefined;
}) => {
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
  return !utxosData || !wallet ? (
    <ActivityIndicator />
  ) : (
    <View className="bg-white">
      <Text>Balance: {fromSats(balance, mode, btcFiat)}</Text>
      <Button mode="text" onPress={onUnitPress}>
        {mode === 'Fiat' ? settings.CURRENCY : mode}
      </Button>
      <UnitsModal
        isVisible={showUnitsModal}
        unit={mode}
        locale={settings.LOCALE}
        currency={settings.CURRENCY}
        btcFiat={btcFiat}
        onSelect={onUnitSelect}
        onClose={() => setShowUnitsModal(false)}
      />
      <Text>{`Wallet ${JSON.stringify(wallet, null, 2)}`}</Text>
    </View>
  );
};

export default React.memo(WalletHeader);
