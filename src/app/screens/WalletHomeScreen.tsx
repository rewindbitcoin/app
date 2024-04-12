import React, { useCallback, useContext, useEffect } from 'react';
import Password from '../components/Password';
import {
  RefreshControl,
  Button,
  View,
  Text,
  Pressable,
  ActivityIndicator
} from 'react-native';
import { KeyboardAwareScrollView } from '../../common/ui';
import { WalletContext, WalletContextType } from '../contexts/WalletContext';
import { useTranslation } from 'react-i18next';
import { delegateVault, shareVaults } from '../lib/backup';
import moize from 'moize';
import { SimpleLineIcons, Ionicons } from '@expo/vector-icons';
import { cssInterop } from 'nativewind';
cssInterop(Ionicons, {
  className: {
    target: 'style',
    nativeStyleToProp: { color: true, fontSize: 'size' }
  }
});
cssInterop(SimpleLineIcons, {
  className: {
    target: 'style',
    nativeStyleToProp: { color: true, fontSize: 'size' }
  }
});
import Spin from '../../common/components/Spin';
import { useNavigation } from '@react-navigation/native';
import { getPasswordDerivedCipherKey } from '../../common/lib/cipher';

type Props = {
  onSetUpVaultInit: () => void;
};

const navOptions = {
  headerRight: () => (
    <View className="flex-row justify-between gap-5 items-center">
      <Pressable
        className={`animate-spin hover:opacity-90 active:scale-95 active:opacity-90`}
      >
        <SimpleLineIcons name="refresh" className="text-primary text-xl" />
      </Pressable>
      <Pressable
        className={`hover:opacity-90 active:scale-95 active:opacity-90`}
      >
        <Ionicons name="settings-outline" className="text-primary text-2xl" />
      </Pressable>
    </View>
  ),
  headerRightContainerStyle: { marginRight: 16 }
};

//TODO the WalletProvider must also pass it's own refreshing state
const WalletHomeScreen: React.FC<Props> = ({ onSetUpVaultInit }) => {
  const navigation = useNavigation();
  const { t } = useTranslation();
  useEffect(() => {
    if (!('setOptions' in navigation))
      throw new Error('This navigation does not implement setOptions');
    navigation.setOptions(navOptions);
  }, [navigation]);

  const context = useContext<WalletContextType | null>(WalletContext);
  if (context === null) throw new Error('Context was not set');

  const {
    vaults,
    syncBlockchain,
    syncingBlockchain,
    wallet,
    walletError,
    requiresAuth,
    onWallet
  } = context;

  useEffect(() => {
    if (walletError === 'USER_CANCEL') navigation.goBack();
  }, [walletError, navigation]);

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

  const onPasswordCancel = useCallback(() => {
    navigation.goBack();
  }, [navigation]);
  const onPassword = useCallback(
    (password: string) => {
      if (!wallet) throw new Error(`wallet not set yet`);
      const cb = async () => {
        const signersCipherKey = await getPasswordDerivedCipherKey(password);
        onWallet({
          wallet,
          signersCipherKey
        });
      };
      cb();
    },
    [wallet, onWallet]
  );
  return !wallet ? (
    <ActivityIndicator />
  ) : (
    <>
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
        <Text>{`Wallet ${JSON.stringify(wallet, null, 2)}`}</Text>
        {vaults && (
          <>
            <Text>vaults:</Text>
            {Object.values(vaults).map(vault => (
              <View key={vault.vaultId} className="items-center">
                <Text>{vault.vaultId}</Text>
                <Button
                  title={t('walletHome.delegate')}
                  onPress={createDelegateVaultHandler(vault.vaultId)}
                />
                <Pressable className="flex-row items-center p-4 shadow rounded-xl bg-primary hover:opacity-90 active:opacity-90 active:scale-95">
                  <Spin />
                  <Text className="font-semibold text-white">
                    Processing...
                  </Text>
                </Pressable>
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
        <Button
          title={t('walletHome.vaultBalance')}
          onPress={onSetUpVaultInit}
        />
        <Button
          title={t('walletHome.backupVaults')}
          onPress={onRequestVaultsBackup}
        />
      </KeyboardAwareScrollView>
      <Password
        mode="REQUEST"
        isVisible={requiresAuth}
        onPassword={onPassword}
        onCancel={onPasswordCancel}
      />
    </>
  );
};

export default React.memo(WalletHomeScreen);
