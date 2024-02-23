import React, { useCallback, useContext } from 'react';
import { RefreshControl, Button, View, Text } from 'react-native';
import { KeyboardAwareScrollView } from '../../common/ui';
import { WalletContext, WalletContextType } from '../contexts/WalletContext';
import { useTranslation } from 'react-i18next';
import { shareVaults } from '../lib/backup';

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
            </View>
          ))}
        </>
      )}
      <Button
        title={
          //TODO: translate
          syncingBlockchain ? t('Refreshing Balance…') : t('Refresh Balance')
        }
        onPress={syncBlockchain}
        disabled={syncingBlockchain}
      />
      <Button
        title={
          //TODO: translate
          t('Vault Balance')
        }
        onPress={onSetUpVaultInit}
      />
      <Button
        title={
          //TODO: translate
          t('Backup Vaults')
        }
        onPress={onRequestVaultsBackup}
      />
    </KeyboardAwareScrollView>
  );
};

export default WalletHomeScreen;
