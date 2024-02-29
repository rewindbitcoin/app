import React, { useCallback, useContext } from 'react';
import { RefreshControl, Button, View, Text } from 'react-native';
import { KeyboardAwareScrollView } from '../../common/ui';
import { WalletContext, WalletContextType } from '../contexts/WalletContext';
import { useTranslation } from 'react-i18next';
import { delegateVault, shareVaults } from '../lib/backup';
import moize from 'moize';

//TODO the WalletProvider must also pass it's own refreshing state
const WalletHomeScreen = ({
  onSetUpVaultInit
}: {
  onSetUpVaultInit: () => void;
}) => {
  const { t } = useTranslation();
  const context = useContext<WalletContextType | null>(WalletContext);

  if (context === null) {
    throw new Error('Context was not set');
  }
  const { vaults, syncBlockchain, syncingBlockchain } = context;

  const onRequestVaultsBackup = useCallback(() => {
    if (!vaults) throw new Error('vaults not ready');
    return shareVaults({ vaults });
  }, [vaults]);

  const createDelegateVaultHandler = moize((vaultId: string) => {
    return () => {
      if (!vaults) throw new Error(`vaults not yet defined`);
      const vault = vaults[vaultId];
      if (!vault) throw new Error(`Vault ${vaultId} not found in vaults`);
      const readmeText = t('walletHome.delegateReadme');
      const readme = readmeText.split('\n');

      delegateVault({ readme, vault });
    };
  });

  // Use btcFiat, and any other data or functions provided by the context
  // ...

  return (
    <KeyboardAwareScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{
        flexGrow: 1, //grow vertically to 100% and center child
        justifyContent: 'center',
        alignItems: 'center'
      }}
      refreshControl={
        <RefreshControl
          refreshing={syncingBlockchain}
          onRefresh={syncBlockchain}
        />
      }
    >
      {vaults && (
        <>
          <Text>vaults:</Text>
          {Object.values(vaults).map(vault => (
            <View key={vault.vaultId}>
              <Text>{vault.vaultId}</Text>
              <Button
                title={t('walletHome.delegate')}
                onPress={createDelegateVaultHandler(vault.vaultId)}
              />
            </View>
          ))}
        </>
      )}
      <Button
        title={
          syncingBlockchain ? t('Refreshing Balance…') : t('Refresh Balance')
        }
        onPress={syncBlockchain}
        disabled={syncingBlockchain}
      />
      <Button title={t('walletHome.vaultBalance')} onPress={onSetUpVaultInit} />
      <Button
        title={t('walletHome.backupVaults')}
        onPress={onRequestVaultsBackup}
      />
    </KeyboardAwareScrollView>
  );
};

export default WalletHomeScreen;
