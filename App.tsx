// TODO: extremelly important, before sharing this module make sure
// this works properly: react-native-get-random-values

import './init';
import React, { useEffect, useState } from 'react';
import { Button, Platform, View } from 'react-native';
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
import type { Signers, Wallet as WalletType } from './src/app/lib/wallets';
import { NavigationContainer, useNavigation } from '@react-navigation/native';
import { CustomToast } from './src/common/components/Toast';
import WalletsScreen from './src/app/screens/WalletsScreen';
import ImportWalletScreen from './src/app/screens/ImportWalletScreen';
import WalletHomeScreen from './src/app/screens/WalletHomeScreen';
import SetUpVaultScreen from './src/app/screens/SetUpVaultScreen';
import CreateVaultScreen from './src/app/screens/CreateVaultScreen';
import { WalletProvider } from './src/app/contexts/WalletContext';
import Settings from './src/app/screens/SettingsScreen';
import { StorageProvider } from './src/common/contexts/StorageContext';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { SERIALIZABLE } from './src/common/lib/storage';
import { useGlobalStateStorage } from './src/common/contexts/StorageContext';
import { SETTINGS_GLOBAL_STORAGE } from './src/app/lib/settings';
import type { VaultSettings } from './src/app/lib/vaults';
//import AnimatedGradient from './src/common/components/AnimatedGradient';

//import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
//const Tab = createBottomTabNavigator();
//{wallet && (
//  <Tab.Navigator>
//    <Tab.Screen name="Home" component={Settings} />
//    <Tab.Screen name="Settings" component={Settings} />
//  </Tab.Navigator>
//)}

import {
  defaultSettings,
  Settings as SettingsType
} from './src/app/lib/settings';
import { useTranslation } from 'react-i18next';
import initI18n from './src/i18n/i18n';
//Init for 1st render. Then, on settings load from context & apply correct one
initI18n(defaultSettings.LOCALE);

function withModalToast<T extends React.ComponentProps<React.ComponentType>>(
  Component: React.ComponentType<T>
) {
  return (props: T) => (
    <>
      <Component {...props} />
      <CustomToast />
    </>
  );
}

const RootStack = createRootStack();

const App = () => {
  // Get settings from disk. It will be used for setting the correct LOCALE.
  const [settings] = useGlobalStateStorage<SettingsType>(
    SETTINGS_GLOBAL_STORAGE,
    SERIALIZABLE
  );

  const { t } = useTranslation();

  const [wallet, setWallet] = useState<WalletType>();
  const [vaultSettings, setVaultSettings] = useState<VaultSettings>();
  const [newWalletSigners, setNewWalletSigners] = useState<Signers>();
  const navigation = useNavigation();

  const settingsButton = () => (
    <Button
      onPress={() => navigation.navigate(SETTINGS)}
      title={t('app.settingsButton')}
    />
  );

  const handleWalletSelectOrCreate = (
    wallet: WalletType,
    newWalletSigners?: Signers
  ) => {
    if (newWalletSigners) setNewWalletSigners(newWalletSigners);
    setWallet(wallet);
    if (navigation) navigation.navigate(WALLET_HOME);
    else throw new Error('navigation not set');
  };
  const handleSetUpVaultInit = () => {
    if (navigation) navigation.navigate(SETUP_VAULT);
    else throw new Error('navigation not set');
  };
  const handleSetUpVaultComplete = (vaultSettings: VaultSettings) => {
    setVaultSettings(vaultSettings);
    if (navigation) navigation.navigate(CREATE_VAULT);
    else throw new Error('navigation not set');
  };

  // init real Locale
  useEffect(() => {
    if (settings?.LOCALE) initI18n(settings.LOCALE);
  }, [settings?.LOCALE]);

  return (
    <WalletProvider
      {...(wallet ? { wallet: wallet } : {})}
      {...(newWalletSigners ? { newWalletSigners: newWalletSigners } : {})}
    >
      <RootStack.Navigator
        screenOptions={{
          //Disable goBack with gesture to prevent this bug:
          //https://github.com/douglasjunior/react-native-keyboard-manager/issues/89
          ...(Platform.OS === 'ios' ? { gestureEnabled: false } : {}),
          ...(isNativeStack ? { animationEnabled: true } : {})
        }}
      >
        <RootStack.Screen
          name={WALLETS}
          options={{
            title: t('app.thunderDenTitle'),
            headerRightContainerStyle: { marginRight: 10 },
            headerRight: settingsButton
          }}
        >
          {() => (
            <WalletsScreen
              onWalletSelectOrCreate={handleWalletSelectOrCreate}
            />
          )}
        </RootStack.Screen>
        <RootStack.Screen
          name={IMPORT_WALLET}
          options={{
            title: t('app.importWalletTitle'),
            presentation: 'modal'
          }}
          component={withModalToast(ImportWalletScreen)}
        />

        <RootStack.Screen
          name={WALLET_HOME}
          options={{
            title: t('app.thunderDenTitle'),
            headerRightContainerStyle: { marginRight: 10 },
            headerRight: settingsButton
          }}
        >
          {() => <WalletHomeScreen onSetUpVaultInit={handleSetUpVaultInit} />}
        </RootStack.Screen>

        <RootStack.Screen
          name={SETUP_VAULT}
          options={{
            title: t('vaultSetup.title'),
            headerRightContainerStyle: { marginRight: 10 },
            headerRight: settingsButton
          }}
        >
          {() => (
            <SetUpVaultScreen onVaultSetUpComplete={handleSetUpVaultComplete} />
          )}
        </RootStack.Screen>

        <RootStack.Screen
          name={CREATE_VAULT}
          options={{
            title: t('app.thunderDenTitle'),
            presentation: 'modal'
          }}
        >
          {() => (
            <CreateVaultScreen
              vaultSettings={vaultSettings}
              onVaultCreated={_result => navigation.navigate(WALLET_HOME)}
            />
          )}
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
export default () => (
  <NavigationContainer>
    <SafeAreaProvider>
      <StorageProvider>
        <App />
      </StorageProvider>
      <CustomToast />
    </SafeAreaProvider>
  </NavigationContainer>
);
