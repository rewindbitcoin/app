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
import { Button, IconButton } from '../../common/ui';
import { formatBalance } from '../lib/format';
import FreezeIcon from './FreezeIcon';
import HotIcon from './HotIcon';
import { useTranslation } from 'react-i18next';
import type { NetworkId } from '../lib/network';
import { useNetStatus } from '../hooks/useNetStatus';
import { MaterialIcons } from '@expo/vector-icons';
import { useLocalization } from '../hooks/useLocalization';

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
          <Svg className="fill-yellow-400 w-6 h-6 mr-2" viewBox="0 0 24 24">
            <HotIcon />
          </Svg>
        ) : (
          <Svg className="fill-primary w-5 h-5 mr-2" viewBox="0 0 24 24">
            <FreezeIcon />
          </Svg>
        )}
        <Text
          key={
            formattedBalance === undefined
              ? 'loading'
              : 'loaded' /*trick to reset the component to fix nativewind leaving some classes not correctly reset after the animation*/
          }
          className={
            `font-bold text-3xl pr-0 mr-2 ${formattedBalance === undefined ? 'animate-pulse bg-slate-200 rounded overflow-hidden' : 'animate-none bg-transparent opacity-100'}`
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
  syncBlockchain,
  syncingBlockchain,
  utxosData,
  vaults,
  vaultsStatuses,
  blockchainTip,
  btcFiat,
  faucetPending,
  testWalletWarningDismissed,
  dismissTestWalletWarning,
  seedBackupDone,
  setSeedBackupDone
}: {
  networkId: NetworkId;
  utxosData: UtxosData | undefined;
  syncBlockchain: () => void;
  syncingBlockchain: boolean;
  vaults: Vaults | undefined;
  vaultsStatuses: VaultsStatuses | undefined;
  blockchainTip: number | undefined;
  btcFiat: number | undefined;
  faucetPending: boolean;
  testWalletWarningDismissed: boolean;
  dismissTestWalletWarning: () => void;
  seedBackupDone: boolean;
  setSeedBackupDone: () => void;
}) => {
  void seedBackupDone; //TODO - Implement seed confirmation later
  void setSeedBackupDone; //TODO - Implement seed confirmation later
  const { t } = useTranslation();
  const [showUnitsModal, setShowUnitsModal] = useState<boolean>(false);
  const { settings, setSettings } = useSettings();
  const { locale, currency } = useLocalization();
  const { permanentErrorMessage: netErrorMessage } = useNetStatus();
  //const netErrorMessage =
  //  'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.';
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
                  currency,
                  locale,
                  mode
                })
          }
          iconText={mode === 'Fiat' ? currency : mode}
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
                  currency,
                  locale,
                  mode
                })
          }
          iconText={mode === 'Fiat' ? currency : mode}
          onUnitPress={onUnitPress}
        />
      </View>
      {(netErrorMessage ||
        (networkId !== 'BITCOIN' && !testWalletWarningDismissed)) && (
        <View className="p-4 mt-6 bg-white rounded-lg ios:shadow android:elevation relative">
          <View className="absolute top-5 left-4">
            <Text className="text-red-500">
              <MaterialIcons name="warning-amber" size={20} />
            </Text>
          </View>
          {netErrorMessage ? (
            //only show tapeWalletPlusWarning err if the network status is fine.
            //Otherwise the header would too cluttered
            <>
              <Text
                key={syncingBlockchain.toString() /*fixes native-wind issues*/}
                className="color-slate-500 ml-9 text-sm"
              >
                {netErrorMessage}
              </Text>
              <Button
                textClassName="font-bold !text-sm"
                containerClassName="self-end mt-2"
                onPress={syncBlockchain}
                loading={syncingBlockchain}
                mode="text"
              >
                {syncingBlockchain
                  ? t('walletHome.header.checkingNetwork')
                  : t('walletHome.header.checkNetwork')}
              </Button>
            </>
          ) : (
            networkId !== 'BITCOIN' &&
            !testWalletWarningDismissed && (
              <>
                <Text
                  key={
                    syncingBlockchain.toString() /*fixes native-wind issues*/
                  }
                  className="color-slate-500 ml-9 text-sm"
                >
                  {t('walletHome.header.testWalletWarning')}
                  {networkId === 'TAPE'
                    ? `
` + t('walletHome.header.tapeWalletPlusWarning')
                    : ''}
                </Text>
                <Text
                  className={`self-end font-bold text-sm mt-2 text-primary hover:opacity-90 active:opacity-90 active:scale-95`}
                  onPress={dismissTestWalletWarning}
                >
                  {t('dismissButton')}
                </Text>
              </>
            )
          )}
        </View>
      )}
      <UnitsModal
        isVisible={showUnitsModal}
        mode={mode}
        locale={locale}
        currency={currency}
        btcFiat={btcFiat}
        onSelect={onModeSelect}
        onClose={() => setShowUnitsModal(false)}
      />
    </View>
  );
};

export default React.memo(WalletHeader);
