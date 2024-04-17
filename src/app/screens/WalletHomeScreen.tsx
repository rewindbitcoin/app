import React, { useCallback, useContext, useEffect, useMemo } from 'react';
import Password from '../components/Password';
import {
  RefreshControl,
  Button,
  View,
  Text,
  Pressable,
  ActivityIndicator
} from 'react-native';
import { KeyboardAwareScrollView, Modal, useTheme } from '../../common/ui';
import { WalletContext, WalletContextType } from '../contexts/WalletContext';
import { useTranslation } from 'react-i18next';
import { delegateVault, shareVaults } from '../lib/backup';
import moize from 'moize';
import { SimpleLineIcons, Ionicons } from '@expo/vector-icons';
import { cssInterop } from 'nativewind';
for (const IconClass of [SimpleLineIcons, Ionicons]) {
  cssInterop(IconClass, {
    className: {
      target: 'style',
      nativeStyleToProp: { color: true, fontSize: 'size' }
    }
  });
}
import Spin from '../../common/components/Spin';
import {
  useNavigation,
  type RouteProp,
  useRoute
} from '@react-navigation/native';
import { getPasswordDerivedCipherKey } from '../../common/lib/cipher';

import WalletButtons from '../components/WalletButtons';
import type { RootStackParamList, NavigationPropsByScreenId } from '../screens';

type Props = {
  onSetUpVaultInit: () => void;
};

//TODO the WalletProvider must also pass it's own refreshing state
const WalletHomeScreen: React.FC<Props> = ({ onSetUpVaultInit }) => {
  const navigation = useNavigation<NavigationPropsByScreenId['WALLET_HOME']>();
  const route = useRoute<RouteProp<RootStackParamList, 'WALLET_HOME'>>();
  const walletId = route.params.walletId;
  const { t } = useTranslation();

  const context = useContext<WalletContextType | null>(WalletContext);
  if (context === null) throw new Error('Context was not set');

  const {
    vaults,
    syncBlockchain,
    syncingBlockchain,
    wallet,
    walletError,
    requiresPassword,
    onWallet
  } = context;
  if (wallet && walletId !== wallet.walletId)
    throw new Error(
      `Navigated to walletId ${walletId} which does not correspond to the one in the context ${wallet?.walletId}`
    );

  const navOptions = useMemo(
    () => ({
      title: wallet
        ? wallet.walletName ||
          t('wallets.walletId', { id: wallet.walletId + 1 })
        : t('app.walletTitle'),
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
            <Ionicons
              name="settings-outline"
              className="text-primary text-2xl"
            />
          </Pressable>
        </View>
      ),
      headerRightContainerStyle: { marginRight: 16 }
    }),
    [t, wallet]
  );
  useEffect(() => navigation.setOptions(navOptions), [navigation, navOptions]);

  useEffect(() => {
    if (walletError === 'USER_CANCEL')
      if (navigation.canGoBack()) navigation.goBack();
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
    if (navigation.canGoBack()) navigation.goBack();
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
  const onCloseErrorModal = useCallback(() => {
    if (navigation.canGoBack()) navigation.goBack();
  }, [navigation]);

  const handleReceive = useCallback(() => {}, []);
  const handleSend = useCallback(() => {}, []);
  const handleFreeze = useCallback(() => {}, []);

  const theme = useTheme();
  return !wallet /*TODO: prepare nicer ActivityIndicator*/ ? (
    <View className="flex-1 justify-center">
      <ActivityIndicator size={'large'} color={theme.colors.primary} />
    </View>
  ) : (
    <>
      <WalletButtons
        handleReceive={handleReceive}
        handleSend={handleSend}
        handleFreeze={handleFreeze}
      />
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
        isVisible={requiresPassword}
        onPassword={onPassword}
        onCancel={onPasswordCancel}
      />
      <Modal
        isVisible={walletError && walletError !== 'USER_CANCEL'}
        title={
          walletError === 'BIOMETRICS_UNCAPABLE'
            ? t('wallet.errors.biometricsUncapableTitle')
            : t('wallet.errors.storageTitle')
        }
        icon={{ family: 'MaterialIcons', name: 'error' }}
        onClose={onCloseErrorModal}
      >
        <View className="px-2">
          <Text>
            {walletError === 'BIOMETRICS_UNCAPABLE'
              ? t('wallet.errors.biometricsUncapable')
              : t('wallet.errors.storage')}
          </Text>
        </View>
      </Modal>
    </>
  );
};

export default React.memo(WalletHomeScreen);
