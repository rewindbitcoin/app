import React, { useMemo, useState, useEffect } from 'react';
import { View, Text } from 'react-native';
import type {
  Vault,
  VaultStatus,
  VaultsStatuses,
  Vaults as VaultsType
} from '../lib/vaults';
import { fetchBlockTimestamp } from '../lib/blockchain';
import { useTranslation } from 'react-i18next';
import { delegateVault } from '../lib/backup';
import { ActivityIndicator, Button } from '../../common/ui';

const Vault = ({
  esploraAPI,
  vault,
  vaultStatus
}: {
  esploraAPI: string;
  vault: Vault;
  vaultStatus: VaultStatus;
}) => {
  const [blockDate, setBlockDate] = useState<string | null>(null);

  useEffect(() => {
    const fetchTimestamp = async () => {
      if (vaultStatus.triggerTxBlockHeight) {
        try {
          const timestamp = await fetchBlockTimestamp(
            esploraAPI,
            vaultStatus.triggerTxBlockHeight
          );
          const date = new Date(timestamp * 1000).toLocaleString(); // Convert to human-readable date
          setBlockDate(date);
        } catch (error) {
          throw new Error('Error fetching block timestamp.');
        }
      }
    };

    fetchTimestamp();
  }, [vaultStatus, esploraAPI]);
  return (
    <>
      <Text>{vault.vaultId}</Text>
      <Text
        className={
          vaultStatus.triggerTxBlockHeight && blockDate === null
            ? 'animate-pulse bg-slate-200 rounded'
            : 'bg-transparent'
        }
      >
        {!vaultStatus.triggerTxBlockHeight
          ? 'TODO Your vault is waiting to be confirmed...'
          : blockDate === null
            ? '      '
            : `TODO Funds frozen on ${blockDate}`}
      </Text>
    </>
  );
};

const Vaults = ({
  esploraAPI,
  vaults,
  vaultsStatuses
}: {
  esploraAPI: string;
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
                esploraAPI={esploraAPI}
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
