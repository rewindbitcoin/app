import React, { useState, useCallback } from 'react';
import { Text, View } from 'react-native';
import { Svg } from 'react-native-svg';
import {
  utxosDataBalance,
  type UtxosData,
  VaultsStatuses,
  Vaults,
  getVaultsFrozenBalance,
  areVaultsSynched
} from '../lib/vaults';
import UnitsModal from './UnitsModal';
import type { SubUnit } from '../lib/settings';
import { useSettings } from '../hooks/useSettings';
import { IconButton } from '../../common/ui';
import { formatBalance } from '../lib/format';
import FreezeIcon from './FreezeIcon';
import HotIcon from './HotIcon';
import { useTranslation } from 'react-i18next';
import type { NetworkId } from '../lib/network';

const Balance = ({
  type,
  formattedBalance,
  iconText,
  onUnitPress
}: {
  type: 'HOT' | 'FROZEN';
  formattedBalance: string | undefined;
  iconText: string;
  onUnitPress: () => void;
}) => {
  const { t } = useTranslation();
  return (
    <View>
      <View className="flex-row items-center justify-start">
        {type === 'HOT' ? (
          <Svg className="w-6 h-6 mr-2" viewBox="0 0 24 24">
            <HotIcon />
          </Svg>
        ) : (
          <Svg className="fill-black w-6 h-6 mr-2" viewBox="0 0 24 24">
            <FreezeIcon />
          </Svg>
        )}
        <Text
          className={
            `font-bold text-3xl pr-0 mr-2 ${formattedBalance === undefined ? 'animate-pulse bg-slate-200 rounded' : 'animate-none bg-transparent opacity-100'}`
            //after the animation it is important to set animate-none from the nativewind docs so that components are not re-rendered as new.
            //Also opacity must be reset to initial value
          }
        >
          {formattedBalance === undefined ? '     ' : formattedBalance}
        </Text>
        <IconButton
          size={16}
          color={'black'}
          separationRatio={0}
          mode="icon-right"
          iconFamily="Entypo"
          iconName="chevron-small-down"
          text={iconText}
          onPress={onUnitPress}
        />
      </View>
      <Text className="text-sm text-slate-600">
        {type === 'HOT'
          ? t('walletHome.header.hotSubTitle')
          : t('walletHome.header.frozenSubTitle')}
      </Text>
    </View>
  );
};

const WalletHeader = ({
  networkId,
  utxosData,
  vaults,
  vaultsStatuses,
  blockchainTip,
  btcFiat,
  faucetPending
}: {
  networkId: NetworkId;
  utxosData: UtxosData | undefined;
  vaults: Vaults | undefined;
  vaultsStatuses: VaultsStatuses | undefined;
  blockchainTip: number | undefined;
  btcFiat: number | undefined;
  faucetPending: boolean;
}) => {
  const { t } = useTranslation();
  const [showUnitsModal, setShowUnitsModal] = useState<boolean>(false);
  const { settings, setSettings } = useSettings();
  if (!settings)
    throw new Error(
      'This component should only be started after settings has been retrieved from storage'
    );
  const mode =
    settings.FIAT_MODE && typeof btcFiat === 'number'
      ? 'Fiat'
      : settings.SUB_UNIT;
  const onUnitPress = useCallback(() => {
    setShowUnitsModal(true);
  }, []);
  const onModeSelect = useCallback(
    (mode: SubUnit | 'Fiat') => {
      console.log('onModeSelect', { mode });
      setShowUnitsModal(false);
      if (mode === 'Fiat') setSettings({ ...settings, FIAT_MODE: true });
      else setSettings({ ...settings, SUB_UNIT: mode, FIAT_MODE: false });
    },
    [settings, setSettings]
  );
  const balance = utxosData ? utxosDataBalance(utxosData) : undefined;
  const frozenBalance =
    vaults &&
    vaultsStatuses &&
    blockchainTip !== undefined &&
    areVaultsSynched(vaults, vaultsStatuses)
      ? getVaultsFrozenBalance(vaults, vaultsStatuses, blockchainTip)
      : undefined;
  return (
    <View className="bg-white p-4 flex-col">
      <View className="pl-5 gap-4">
        <Balance
          type="HOT"
          formattedBalance={
            balance === undefined || faucetPending
              ? undefined
              : formatBalance({
                  satsBalance: balance,
                  btcFiat,
                  currency: settings.CURRENCY,
                  locale: settings.LOCALE,
                  mode
                })
          }
          iconText={mode === 'Fiat' ? settings.CURRENCY : mode}
          onUnitPress={onUnitPress}
        />
        <Balance
          type="FROZEN"
          formattedBalance={
            frozenBalance === undefined
              ? undefined
              : formatBalance({
                  satsBalance: frozenBalance,
                  btcFiat,
                  currency: settings.CURRENCY,
                  locale: settings.LOCALE,
                  mode
                })
          }
          iconText={mode === 'Fiat' ? settings.CURRENCY : mode}
          onUnitPress={onUnitPress}
        />
      </View>
      {networkId !== 'BITCOIN' && (
        <Text className="pt-5 p-4 color-orange-600 text-sm">
          {t('walletHome.header.testWalletWarning')}
          {networkId === 'STORM' || networkId === 'REGTEST'
            ? ' ' + t('walletHome.header.regtestWalletPlusWarning')
            : ''}
        </Text>
      )}
      <UnitsModal
        isVisible={showUnitsModal}
        mode={mode}
        locale={settings.LOCALE}
        currency={settings.CURRENCY}
        btcFiat={btcFiat}
        onSelect={onModeSelect}
        onClose={() => setShowUnitsModal(false)}
      />
    </View>
  );
};

export default React.memo(WalletHeader);
