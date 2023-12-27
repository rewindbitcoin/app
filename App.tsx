// TODO: extremelly important, before sharing this module make sure
// this works properly: react-native-get-random-values

import './init';
import React, { useEffect, useState } from 'react';
import { Button } from 'react-native';
import {
  createRootStack,
  isNativeStack,
  WALLETS,
  WALLET_HOME,
  SETTINGS,
  SETUP_VAULT
} from './src/app/screens';
import type { Signers, Wallet as WalletType } from './src/app/lib/wallets';
import { NavigationContainer, useNavigation } from '@react-navigation/native';
import { CustomToast } from './src/common/components/Toast';
import WalletsScreen from './src/app/screens/WalletsScreen';
import WalletHomeScreen from './src/app/screens/WalletHomeScreen';
import SetupVaultScreen from './src/app/screens/SetUpVaultScreen';
import { WalletProvider } from './src/app/contexts/WalletContext';
import Settings from './src/app/screens/SettingsScreen';
import { StorageProvider } from './src/common/contexts/StorageContext';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SERIALIZABLE } from './src/common/lib/storage';
import { useGlobalStateStorage } from './src/common/contexts/StorageContext';
import { SETTINGS_GLOBAL_STORAGE } from './src/app/lib/settings';

import {
  defaultSettings,
  Settings as SettingsType
} from './src/app/lib/settings';
import { useTranslation } from 'react-i18next';
import initI18n from './src/i18n/i18n';
//Init for 1st render. Then, on settings load from context & apply correct one
initI18n(defaultSettings.LOCALE);

const RootStack = createRootStack();

const App = () => {
  // Get settings from disk. It will be used for setting the correct LOCALE.
  const [settings] = useGlobalStateStorage<SettingsType>(
    SETTINGS_GLOBAL_STORAGE,
    SERIALIZABLE
  );

  const { t } = useTranslation();

  const [wallet, setWallet] = useState<WalletType>();
  const [newWalletSigners, setNewWalletSigners] = useState<Signers>();
  const navigation = useNavigation();

  const settingsButton = () => (
    <Button
      onPress={() => navigation.navigate(SETTINGS)}
      title={t('app.settingsButton')}
    />
  );

  const processWallet = (wallet: WalletType, newWalletSigners?: Signers) => {
    if (newWalletSigners) setNewWalletSigners(newWalletSigners);
    setWallet(wallet);
    if (navigation) navigation.navigate(WALLET_HOME);
    else throw new Error('navigation not set');
  };
  const processSetUpVault = () => {
    if (navigation) navigation.navigate(SETUP_VAULT);
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
        screenOptions={isNativeStack ? { animationEnabled: true } : {}}
      >
        <RootStack.Screen
          name={WALLETS}
          options={{
            title: t('app.thunderDenTitle'),
            headerRightContainerStyle: { marginRight: 10 },
            headerRight: settingsButton
          }}
        >
          {() => <WalletsScreen onWallet={processWallet} />}
        </RootStack.Screen>

        <RootStack.Screen
          name={WALLET_HOME}
          options={{
            title: t('app.thunderDenTitle'),
            headerRightContainerStyle: { marginRight: 10 },
            headerRight: settingsButton
          }}
        >
          {() => <WalletHomeScreen onSetUpVault={processSetUpVault} />}
        </RootStack.Screen>

        <RootStack.Screen
          name={SETUP_VAULT}
          options={{
            title: t('app.thunderDenTitle'),
            headerRightContainerStyle: { marginRight: 10 },
            headerRight: settingsButton
          }}
        >
          {() => (
            <SetupVaultScreen
              onNewValues={({ amount, feeRate, lockBlocks }) =>
                console.log('TRACE new vault setup', {
                  amount,
                  feeRate,
                  lockBlocks
                })
              }
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
    </SafeAreaProvider>
    <CustomToast />
  </NavigationContainer>
);
