import React, { useMemo } from 'react';
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

const Vault = ({
  btcFiat,
  vault,
  vaultStatus
}: {
  btcFiat: number | undefined;
  vault: Vault;
  vaultStatus: VaultStatus;
}) => {
  const { settings } = useSettings();
  if (!settings)
    throw new Error(
      'This component should only be started after settings has been retrieved from storage'
    );
  const mode =
    settings.FIAT_MODE && typeof btcFiat === 'number'
      ? 'Fiat'
      : settings.SUB_UNIT;
  const getVaultInitDate = (vault: Vault, vaultStatus: VaultStatus) => {
    //vaultPushTime is a bit more precise but may not be available in a device
    //using the same mnemonic. creationTime is good enough.
    //Remember there are some props in vaultStatus that
    //are used to keep internal track of user actions. See docs on VaultStatus.
    const creationOrPushTime = vaultStatus.vaultPushTime || vault.creationTime;
    const formattedDate = new Date(creationOrPushTime * 1000).toLocaleString();
    console.log({ vaultTxBlockHeight: vaultStatus.vaultTxBlockHeight });
    return (
      `TODO vault created on ${formattedDate}.` +
      (vaultStatus.vaultTxBlockHeight === undefined ||
      vaultStatus.vaultTxBlockHeight === 0
        ? ` - ${'TODO confirming...'}`
        : '')
    );
  };

  const frozenBalance = getVaultVaultedBalance(vault, vaultStatus);

  return (
    <>
      <Text>{vault.vaultId}</Text>
      <Text>{getVaultInitDate(vault, vaultStatus)}</Text>
      <Text>
        TODO Vaulted Amount:{' '}
        {formatBalance({
          satsBalance: frozenBalance,
          btcFiat,
          currency: settings.CURRENCY,
          locale: settings.LOCALE,
          mode
        }) + (mode === 'Fiat' ? '' : ' ' + mode)}
      </Text>
    </>
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
  const { t } = useTranslation();
  const handleDelegateVaultMap = useMemo(() => {
    const map: { [vaultId: string]: () => void } = {};
    Object.values(vaults).map((vault: Vault) => {
      const vaultId = vault.vaultId;
      map[vaultId] = () => {
        if (!vaults) throw new Error(`vaults not yet defined`);
        const vault = vaults[vaultId];
        if (!vault) throw new Error(`Vault ${vaultId} not found in vaults`);
        const readmeText = t('walletHome.delegateReadme');
        const readme = readmeText.split('\n');

        delegateVault({ readme, vault });
      };
    });
    return map;
  }, [t, vaults]);

  return (
    <View className="gap-4 max-w-2xl self-center">
      {Object.values(vaults).map(vault => {
        const vaultStatus = vaultsStatuses[vault.vaultId];
        return (
          <View
            key={vault.vaultId}
            className="items-center rounded-3xl bg-white p-4 gap-4"
          >
            {!vaultStatus ? (
              // processCreatedVault sets first vaults and then vaultsStatuses
              // (not atomic, so wait)
              <ActivityIndicator size={'large'} />
            ) : (
              <Vault
                btcFiat={btcFiat}
                vault={vault}
                vaultStatus={vaultStatus}
              />
            )}
            <Text className="break-words">{vault.vaultId}</Text>
            <View className="w-full flex-row justify-between">
              <Button
                mode="secondary"
                onPress={handleDelegateVaultMap[vault.vaultId]}
              >
                {t('wallet.vault.triggerDefreezeButton')}
              </Button>
              <Button
                mode="secondary"
                onPress={handleDelegateVaultMap[vault.vaultId]}
              >
                Delegate
              </Button>
            </View>
            {/*<Pressable className="flex-row items-center p-4 shadow rounded-xl bg-primary hover:opacity-90 active:opacity-90 active:scale-95">
            <Spin />
            <Text className="font-semibold text-white">Processing...</Text>
          </Pressable>*/}
          </View>
        );
      })}
    </View>
  );
};

export default React.memo(Vaults);
