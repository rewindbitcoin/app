import React, { useMemo } from 'react';
import { View, Text } from 'react-native';
import type { Vault, Vaults as VaultsType } from '../lib/vaults';
import { useTranslation } from 'react-i18next';
import { delegateVault } from '../lib/backup';
import { Button } from '../../common/ui';

const Vaults = ({ vaults }: { vaults: VaultsType }) => {
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
    <View className="gap-4 items-center max-w-2xl p-4">
      {Object.values(vaults).map(vault => (
        <View
          key={vault.vaultId}
          className="items-center rounded-3xl bg-white p-4 gap-4"
        >
          <Text>{vault.vaultId}</Text>
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
      ))}
    </View>
  );
};

export default React.memo(Vaults);
