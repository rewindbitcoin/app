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
  SETTINGS
} from './src/screens';
import type { Signers, Wallet as WalletType } from './src/lib/wallets';
import { NavigationContainer, useNavigation } from '@react-navigation/native';
import { CustomToast } from './src/components/common/Toast';
import WalletsScreen from './src/components/views/WalletsScreen';
import WalletScreen from './src/components/views/WalletScreen';
import { withWalletProvider } from './src/contexts/WalletContext';
import Settings from './src/components/views/Settings';
import { StorageProvider } from './src/contexts/StorageContext';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SERIALIZABLE } from './src/lib/storage';
import {
  SETTINGS_GLOBAL_STORAGE,
  useGlobalStateStorage
} from './src/contexts/StorageContext';
import { defaultSettings, Settings as SettingsType } from './src/lib/settings';
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

  const settingsButtonOnHeaderRight = () => (
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

  const WalletScreenWithWalletProvider = withWalletProvider(
    WalletScreen,
    wallet,
    newWalletSigners
  );

  // init real Locale
  useEffect(() => {
    if (settings?.LOCALE) initI18n(settings.LOCALE);
  }, [settings?.LOCALE]);

  return (
    <RootStack.Navigator
      screenOptions={isNativeStack ? { animationEnabled: true } : {}}
    >
      <RootStack.Screen
        name={WALLETS}
        options={{
          title: t('app.thunderDenTitle'),
          headerRightContainerStyle: { marginRight: 10 },
          headerRight: settingsButtonOnHeaderRight
        }}
      >
        {() => <WalletsScreen onWallet={processWallet} />}
      </RootStack.Screen>

      <RootStack.Screen
        name={WALLET_HOME}
        component={WalletScreenWithWalletProvider}
        options={{
          title: t('app.thunderDenTitle'),
          headerRightContainerStyle: { marginRight: 10 },
          headerRight: settingsButtonOnHeaderRight
        }}
      />

      <RootStack.Screen
        name={SETTINGS}
        component={Settings}
        options={{ title: t('app.settingsTitle') }}
      />
    </RootStack.Navigator>
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
