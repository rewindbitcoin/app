//TODO: create a formatter tgat renders: Confirming... or Confirmed on {}. Based on the blockHeight
//Usar este icono oara init unfreeze!!! https://icons.expo.fyi/Index/MaterialCommunityIcons/snowflake-melt
//For the delegage something along this;: https://icons.expo.fyi/Index/FontAwesome/handshake-o
//https://icons.expo.fyi/Index/Foundation/torsos-all
//or this: https://icons.expo.fyi/Index/FontAwesome5/hands-helping
import React, { useCallback, useMemo } from 'react';
import { View, Text } from 'react-native';
import {
  type Vault,
  type VaultStatus,
  type VaultsStatuses,
  type Vaults as VaultsType,
  getVaultVaultedBalance
} from '../lib/vaults';
import { useTranslation } from 'react-i18next';
import { delegateVault } from '../lib/backup';
import { ActivityIndicator, Button } from '../../common/ui';
import { formatBalance } from '../lib/format';

import { useSettings } from '../hooks/useSettings';
import type { TFunction } from 'i18next';
import FreezeIcon from './FreezeIcon';
import { Svg } from 'react-native-svg';

/*
 *
  <Pressable className="flex-row items-center p-4 shadow rounded-xl bg-primary hover:opacity-90 active:opacity-90 active:scale-95">
    <Spin />
    <Text className="font-semibold text-white">Processing...</Text>
  </Pressable>
*/

const getVaultInitDate = (vault: Vault, vaultStatus: VaultStatus) => {
  //vaultPushTime is a bit more precise but may not be available in a device
  //using the same mnemonic. creationTime is good enough.
  //Remember there are some props in vaultStatus that
  //are used to keep internal track of user actions. See docs on VaultStatus.
  const creationOrPushTime = vaultStatus.vaultPushTime || vault.creationTime;
  const formattedDate = new Date(creationOrPushTime * 1000).toLocaleString();
  return formattedDate;
  //return (
  //  t('wallet.vault.vaultDate', { date: formattedDate }) +
  //  (vaultStatus.vaultTxBlockHeight === undefined ||
  //  vaultStatus.vaultTxBlockHeight === 0
  //    ? ` - ${'TODO confirming...'}`
  //    : '')
  //);
};

const confirmationAppend = (blockHeight: number | undefined, t: TFunction) => {
  return ` ${
    blockHeight ? t('wallet.vault.confirming') : t('wallet.vault.confirmed')
  }`;
};

const Vault = ({
  btcFiat,
  vault,
  vaultNumber,
  vaultStatus
}: {
  btcFiat: number | undefined;
  vault: Vault;
  vaultNumber: number;
  vaultStatus: VaultStatus | undefined;
}) => {
  const { settings } = useSettings();
  const { t } = useTranslation();
  if (!settings)
    throw new Error(
      'This component should only be started after settings has been retrieved from storage'
    );

  const handleDelegateVault = useCallback(() => {
    const readmeText = t('walletHome.delegateReadme');
    const readme = readmeText.split('\n');

    delegateVault({ readme, vault });
  }, [t, vault]);
  const mode =
    settings.FIAT_MODE && typeof btcFiat === 'number'
      ? 'Fiat'
      : settings.SUB_UNIT;

  const frozenBalance =
    vaultStatus && getVaultVaultedBalance(vault, vaultStatus);

  //<Text className="font-semibold text-primary-dark bg-primary text-white flex-1 p-4 w-full text-base">
  // TODO when not vaulted show: This Vault has been unfrozen and is moved to your available balance. TODO when panicked show: This Vault was rescued and was moved to your cold address: ADDRESS.
  return (
    <View
      key={vault.vaultId}
      className="items-center rounded-3xl bg-white overflow-hidden"
    >
      {vaultStatus ? (
        <>
          <View className="flex-row items-center justify-start w-full p-4">
            <Svg
              className="native:text-base web:text-xs web:sm:text-base fill-none stroke-white stroke-2 w-6 h-6 bg-primary rounded-full p-0.5"
              viewBox="0 0 24 24"
            >
              <FreezeIcon />
            </Svg>
            <Text className="font-semibold text-slate-800 web:text-base native:text-lg pl-2">
              {t('wallet.vault.vaultTitle', { vaultNumber })}
            </Text>
            <Text className="text-slate-500 ml-auto native:text-sm web:text-xs">
              {getVaultInitDate(vault, vaultStatus)}
            </Text>
          </View>
          <View className="p-4 pt-0">
            <Text className="text-slate-500 native:text-sm web:text-xs font-semibold">
              {t('wallet.vault.amountFrozen')}
            </Text>
            <Text className="native:text-xl web:text-lg font-bold">
              {formatBalance({
                satsBalance: frozenBalance === undefined ? 0 : frozenBalance,
                btcFiat,
                currency: settings.CURRENCY,
                locale: settings.LOCALE,
                mode,
                appendSubunit: true
              })}
            </Text>
            {frozenBalance === undefined ? null : (
              <Text className="self-start text-slate-600">
                {t('wallet.vault.frozenAmount', {
                  amount: formatBalance({
                    satsBalance: frozenBalance,
                    btcFiat,
                    currency: settings.CURRENCY,
                    locale: settings.LOCALE,
                    mode,
                    appendSubunit: true
                  })
                }) + confirmationAppend(vaultStatus.vaultTxBlockHeight, t)}
              </Text>
            )}
            <Text>TODO Rescued Amount: </Text>
            <Text>TODO Unfrozen Amount: </Text>
            <View className="w-full flex-row justify-between">
              <Button mode="secondary" onPress={handleDelegateVault}>
                {t('wallet.vault.triggerUnfreezeButton')}
              </Button>
              <Button mode="secondary" onPress={handleDelegateVault}>
                Delegate
              </Button>
            </View>
          </View>
        </>
      ) : (
        // processCreatedVault sets first vaults and then vaultsStatuses
        // (not atomic, so wait)
        <ActivityIndicator size={'large'} />
      )}
    </View>
  );
};

const Vaults = ({
  btcFiat,
  vaults,
  vaultsStatuses
}: {
  btcFiat: number | undefined;
  vaults: VaultsType;
  vaultsStatuses: VaultsStatuses;
}) => {
  const sortedVaults = useMemo(() => {
    return Object.values(vaults).sort(
      (a, b) => b.creationTime - a.creationTime
    );
  }, [vaults]);

  return (
    <View className="gap-4 max-w-2xl self-center">
      {sortedVaults.map((vault, index) => {
        const vaultStatus = vaultsStatuses[vault.vaultId];
        return (
          <Vault
            key={vault.vaultId}
            btcFiat={btcFiat}
            vault={vault}
            vaultNumber={sortedVaults.length - index}
            vaultStatus={vaultStatus}
          />
        );
      })}
    </View>
  );
};

export default React.memo(Vaults);
