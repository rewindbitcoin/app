// TODO: extremelly important, before sharing this module make sure
// this works properly: react-native-get-random-values

import './init';
import React, { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { SecureStorageAvailabilityProvider } from './src/common/contexts/SecureStorageAvailabilityContext';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import {
  createRootStack,
  isNativeStack,
  WALLETS,
  WALLET_HOME,
  SETTINGS,
  SETUP_VAULT,
  CREATE_VAULT,
  IMPORT_WALLET
} from './src/app/screens';
import type { Signers, Wallet } from './src/app/lib/wallets';
import { NavigationContainer, useNavigation } from '@react-navigation/native';
import { ToastProvider } from './src/common/components/Toast';
import WalletsScreen from './src/app/screens/WalletsScreen';
import ImportWalletScreen from './src/app/screens/ImportWalletScreen';
import WalletHomeScreen from './src/app/screens/WalletHomeScreen';
import SetUpVaultScreen from './src/app/screens/SetUpVaultScreen';
import CreateVaultScreen from './src/app/screens/CreateVaultScreen';
import { WalletProvider } from './src/app/contexts/WalletContext';
import Settings from './src/app/screens/SettingsScreen';
import { StorageProvider } from './src/common/contexts/StorageContext';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SERIALIZABLE } from './src/common/lib/storage';
import { useGlobalStateStorage } from './src/common/contexts/StorageContext';
import { SETTINGS_GLOBAL_STORAGE } from './src/app/lib/settings';
import type { VaultSettings } from './src/app/lib/vaults';
import { useTheme, Button } from './src/common/ui';

import {
  defaultSettings,
  Settings as SettingsType
} from './src/app/lib/settings';
import { useTranslation } from 'react-i18next';
import { initI18n } from './src/i18n-locales/init';
//Init for 1st render. Then, on settings load from context & apply correct one
initI18n(defaultSettings.LOCALE);

const RootStack = createRootStack();

const Main = () => {
  // Get settings from disk. It will be used for setting the correct LOCALE.
  const [settings] = useGlobalStateStorage<SettingsType>(
    SETTINGS_GLOBAL_STORAGE,
    SERIALIZABLE
  );

  const { t } = useTranslation();

  const [wallet, setWallet] = useState<Wallet>();
  const [vaultSettings, setVaultSettings] = useState<VaultSettings>();
  const [newWalletSigners, setNewWalletSigners] = useState<Signers>();
  const navigation = useNavigation();

  const settingsButton = () => (
    <Button onPress={() => navigation.navigate(SETTINGS)}>
      {t('app.settingsButton')}
    </Button>
  );
  const cancelModalButton = () => (
    <Button mode="text" onPress={() => navigation.goBack()}>
      {t('cancelButton')}
    </Button>
  );

  const handleWallet = useCallback(
    (wallet: Wallet, newWalletSigners?: Signers) => {
      if (newWalletSigners) setNewWalletSigners(newWalletSigners);
      setWallet(wallet);
      if (navigation) navigation.navigate(WALLET_HOME);
      else throw new Error('navigation not set');
    },
    [navigation]
  );
  const handleSetUpVaultInit = useCallback(() => {
    if (navigation) navigation.navigate(SETUP_VAULT);
    else throw new Error('navigation not set');
  }, [navigation]);
  const handleSetUpVaultComplete = useCallback(
    (vaultSettings: VaultSettings) => {
      setVaultSettings(vaultSettings);
      if (navigation) navigation.navigate(CREATE_VAULT);
      else throw new Error('navigation not set');
    },
    [navigation]
  );
  const handleVaultPushed = useCallback(
    (_result: boolean) => navigation.navigate(WALLET_HOME),
    [navigation]
  );

  // init real Locale
  useEffect(() => {
    if (settings?.LOCALE) initI18n(settings.LOCALE);
  }, [settings?.LOCALE]);

  const headerRightContainerStyle = { marginRight: 16 };

  return (
    <WalletProvider
      {...(wallet ? { wallet: wallet } : {})}
      {...(newWalletSigners ? { newWalletSigners: newWalletSigners } : {})}
    >
      <RootStack.Navigator
        screenOptions={isNativeStack ? { animationEnabled: true } : {}}
      >
        <RootStack.Screen
          name={WALLETS}
          options={{
            title: t('app.thunderDenTitle'),
            headerRightContainerStyle,
            headerRight: settingsButton
          }}
        >
          {() => <WalletsScreen onWallet={handleWallet} />}
        </RootStack.Screen>
        <RootStack.Screen
          name={IMPORT_WALLET}
          options={{
            title: t('app.importWalletTitle'),
            presentation: 'modal',
            headerRightContainerStyle,
            headerRight: cancelModalButton
          }}
        >
          {() => {
            //Modals need their own Toast component
            return (
              <ToastProvider>
                <ImportWalletScreen />
              </ToastProvider>
            );
          }}
        </RootStack.Screen>

        <RootStack.Screen
          name={WALLET_HOME}
          options={{
            title: t('app.walletTitle'),
            headerRightContainerStyle,
            headerRight: settingsButton
          }}
        >
          {() => <WalletHomeScreen onSetUpVaultInit={handleSetUpVaultInit} />}
        </RootStack.Screen>

        <RootStack.Screen
          name={SETUP_VAULT}
          options={{
            title: t('vaultSetup.title'),

            //headerShadowVisible:false //TO disable the border line of the header

            //TODO: For iOS way coloer but work to be done yet
            //https://github.com/react-navigation/react-navigation/issues/11550
            //https://github.com/software-mansion/react-native-screens/discussions/1229#discussioncomment-1927333
            //headerTitle: t('vaultSetup.title'),
            headerLargeTitle: true,
            headerTransparent: Platform.OS === 'ios',
            headerBlurEffect: 'regular'
            //headerLargeStyle: {
            //  backgroundColor: PlatformColor('systemGroupedBackgroundColor') // Color of your background
            //}
          }}
        >
          {() => (
            <SetUpVaultScreen onVaultSetUpComplete={handleSetUpVaultComplete} />
          )}
        </RootStack.Screen>

        <RootStack.Screen
          name={CREATE_VAULT}
          options={{
            title: t('app.createVaultTitle'),
            presentation: 'modal'
          }}
        >
          {() => {
            return (
              <>
                <CreateVaultScreen
                  vaultSettings={vaultSettings}
                  onVaultPushed={handleVaultPushed}
                />
              </>
            );
          }}
        </RootStack.Screen>

        <RootStack.Screen
          name={SETTINGS}
          component={Settings}
          options={{ title: t('app.settingsTitle') }}
        />
      </RootStack.Navigator>
    </WalletProvider>
  );
};

//Apply contexts:
//If GestureHandlerRootView needed, place it just below SafeAreaProvider:
// <GestureHandlerRootView style={{ flex: 1 }}> </GestureHandlerRootView>
export default function App() {
  return (
    <SafeAreaProvider>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <NavigationContainer theme={useTheme()}>
          <StorageProvider>
            <SecureStorageAvailabilityProvider>
              <ToastProvider>
                <Main />
              </ToastProvider>
            </SecureStorageAvailabilityProvider>
          </StorageProvider>
        </NavigationContainer>
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}
