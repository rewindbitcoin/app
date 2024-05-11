import React, { useState, useCallback } from 'react';
import { Text, View } from 'react-native';
import { Svg, Path } from 'react-native-svg';
import {
  utxosDataBalance,
  type UtxosData,
  VaultsStatuses,
  Vaults,
  getVaultsVaultedBalance,
  areVaultsSynched
} from '../lib/vaults';
import UnitsModal from './UnitsModal';
import type { Currency, SubUnit } from '../lib/settings';
import { useSettings } from '../hooks/useSettings';
import { IconButton } from '../../common/ui';
import { formatFiat, fromSats } from '../lib/btcRates';
import FreezeIcon from './FreezeIcon';
import { numberToLocalizedString } from '../../common/lib/numbers';
import type { Locale } from '../../i18n-locales/init';
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
            <Path d="M12 2.25a.75.75 0 0 1 .75.75v2.25a.75.75 0 0 1-1.5 0V3a.75.75 0 0 1 .75-.75ZM7.5 12a4.5 4.5 0 1 1 9 0 4.5 4.5 0 0 1-9 0ZM18.894 6.166a.75.75 0 0 0-1.06-1.06l-1.591 1.59a.75.75 0 1 0 1.06 1.061l1.591-1.59ZM21.75 12a.75.75 0 0 1-.75.75h-2.25a.75.75 0 0 1 0-1.5H21a.75.75 0 0 1 .75.75ZM17.834 18.894a.75.75 0 0 0 1.06-1.06l-1.59-1.591a.75.75 0 1 0-1.061 1.06l1.59 1.591ZM12 18a.75.75 0 0 1 .75.75V21a.75.75 0 0 1-1.5 0v-2.25A.75.75 0 0 1 12 18ZM7.758 17.303a.75.75 0 0 0-1.061-1.06l-1.591 1.59a.75.75 0 0 0 1.06 1.061l1.591-1.59ZM6 12a.75.75 0 0 1-.75.75H3a.75.75 0 0 1 0-1.5h2.25A.75.75 0 0 1 6 12ZM6.697 7.757a.75.75 0 0 0 1.06-1.06l-1.59-1.591a.75.75 0 0 0-1.061 1.06l1.59 1.591Z" />
          </Svg>
        ) : (
          <Svg
            className="fill-none stroke-black w-6 h-6 mr-2"
            viewBox="0 0 24 24"
          >
            <FreezeIcon />
          </Svg>
        )}
        <Text
          className={`font-bold text-3xl pr-0 mr-2 ${formattedBalance === undefined ? 'animate-pulse bg-slate-200 rounded' : 'bg-transparent'}`}
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

const formatBalance = ({
  balance,
  currency,
  locale,
  mode
}: {
  balance: number;
  currency: Currency;
  locale: Locale;
  mode: SubUnit | 'Fiat';
}) => {
  if (mode === 'Fiat') {
    return formatFiat({ amount: balance, locale, currency });
  } else {
    return numberToLocalizedString(balance, locale);
  }
};

const WalletHeader = ({
  networkId,
  utxosData,
  vaults,
  vaultsStatuses,
  btcFiat,
  faucetPending
}: {
  networkId: NetworkId;
  utxosData: UtxosData | undefined;
  vaults: Vaults | undefined;
  vaultsStatuses: VaultsStatuses | undefined;
  btcFiat: number | undefined;
  faucetPending: boolean;
}) => {
  const { t } = useTranslation();
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
  const balance = utxosData ? utxosDataBalance(utxosData) : undefined;
  const frozenBalance =
    vaults && vaultsStatuses && areVaultsSynched(vaults, vaultsStatuses)
      ? getVaultsVaultedBalance(vaults, vaultsStatuses)
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
                  mode: mode,
                  balance: fromSats(balance, mode, btcFiat),
                  locale: settings.LOCALE,
                  currency: settings.CURRENCY
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
                  mode: mode,
                  balance: fromSats(frozenBalance, mode, btcFiat),
                  locale: settings.LOCALE,
                  currency: settings.CURRENCY
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
