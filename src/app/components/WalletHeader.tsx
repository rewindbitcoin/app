import React, { useState, useCallback } from 'react';
import { Text, View } from 'react-native';
import { Svg } from 'react-native-svg';
import {
  utxosDataBalance,
  type UtxosData,
  VaultsStatuses,
  Vaults,
  getVaultsVaultedBalance
} from '../lib/vaults';
import type { Wallet } from '../lib/wallets';
import UnitsModal from './UnitsModal';
import type { SubUnit } from '../lib/settings';
import { useSettings } from '../hooks/useSettings';
import { IconButton } from '../../common/ui';
import { fromSats } from '../lib/btcRates';
import FreezeIcon from './FreezeIcon';
import { numberToLocalizedString } from '../../common/lib/numbers';

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
  return (
    <View className="bg-white">
      {!utxosData || !wallet ? null : (
        <>
          <View className="pl-5">
            <View className="flex-row">
              <Text className="font-bold text-3xl pr-2">
                {numberToLocalizedString(
                  fromSats(balance, mode, btcFiat),
                  settings.LOCALE
                )}
              </Text>
              <IconButton
                size={16}
                color={'black'}
                separationRatio={0}
                mode="icon-right"
                iconFamily="Entypo"
                iconName="chevron-small-down"
                text={mode === 'Fiat' ? settings.CURRENCY : mode}
                onPress={onUnitPress}
              />
            </View>
            <Text className="text-sm text-slate-600">
              Current hot balance that can be spent
            </Text>
            {vaults && vaultsStatuses && (
              <>
                <View className="flex-row pt-2 items-center">
                  <Svg className="native:text-base web:text-xs web:sm:text-base fill-none stroke-black stroke-2 w-5 h-5 mr-2">
                    <FreezeIcon />
                  </Svg>
                  <Text className="font-bold text-3xl pr-2">
                    {numberToLocalizedString(
                      fromSats(
                        getVaultsVaultedBalance(vaults, vaultsStatuses),
                        mode,
                        btcFiat
                      ),
                      settings.LOCALE
                    )}
                  </Text>
                  <IconButton
                    size={16}
                    color={'black'}
                    separationRatio={0}
                    mode="icon-right"
                    iconFamily="Entypo"
                    iconName="chevron-small-down"
                    text={mode === 'Fiat' ? settings.CURRENCY : mode}
                    onPress={onUnitPress}
                  />
                </View>
                <Text className="text-sm text-slate-600">
                  Frozen balance protected in vaults
                </Text>
              </>
            )}
          </View>
          <Text className="pt-5 p-4 color-orange-600 text-xs">
            This is a Test Wallet. Prices are shown in USD for realism but hold no real value. Fees
            assume real bitcoin network fees too (but this only on regtest nets)
          </Text>
        </>
      )}
      <UnitsModal
        isVisible={showUnitsModal}
        unit={mode}
        locale={settings.LOCALE}
        currency={settings.CURRENCY}
        btcFiat={btcFiat}
        onSelect={onUnitSelect}
        onClose={() => setShowUnitsModal(false)}
      />
    </View>
  );
};

export default React.memo(WalletHeader);
