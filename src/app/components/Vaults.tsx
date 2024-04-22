import React, { useMemo } from 'react';
import { View, Text, Pressable } from 'react-native';
import type { Vault, Vaults as VaultsType } from '../lib/vaults';
import { useTranslation } from 'react-i18next';
import { delegateVault } from '../lib/backup';
import Spin from '../../common/components/Spin';
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
    <View className="gap-4">
      {Object.values(vaults).map(vault => (
        <View
          key={vault.vaultId}
          className="max-w-[90%] items-center rounded-3xl bg-white p-2 gap-2"
        >
          <Text>{vault.vaultId}</Text>
          <Button mode="text" onPress={handleDelegateVaultMap[vault.vaultId]}>
            {t('wallet.vault.delegateButton')}
          </Button>
          <Button mode="text" onPress={handleDelegateVaultMap[vault.vaultId]}>
            {t('wallet.vault.triggerDefreezeButton')}
          </Button>
          <Button mode="secondary">Delegate</Button>
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
