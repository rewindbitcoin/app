// TODO: extremelly important, before sharing this module make sure
// this works properly: react-native-get-random-values
//
//
//
// TODO: missing setDiscoveryDataMap after refresh
// TODO: discovery is created here
// -> all calls to discovery with side effects should be handled here
// side effects mean that the call may return different values depending on
// external factors. utxos may change, a tx status may change and so on.
// TODO: In vaults.ts there are uses of discovery that produce side effects. Move that
// from there.
// TODO: pass a function down called: refresh()
import './init';
import React, { useEffect, useState } from 'react';
import { Platform, Button } from 'react-native';
import {
  RootStackParamList,
  WALLETS,
  WALLET_HOME,
  SETTINGS
} from './src/screens';
import type { Signers, Wallet as WalletType } from './src/lib/wallets';
import { NavigationContainer, useNavigation } from '@react-navigation/native';
import { CustomToast } from './src/components/common/Toast';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createStackNavigator } from '@react-navigation/stack';
import Wallets from './src/components/views/Wallets';
import WalletHome from './src/components/views/WalletHome';
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
const isNativeStack = Platform.OS === 'ios' || Platform.OS === 'android';
const RootStack = isNativeStack
  ? createNativeStackNavigator<RootStackParamList>()
  : createStackNavigator<RootStackParamList>();
import initI18n from './src/i18n/i18n';
import { networkMapping } from './src/lib/network';
//Init for 1st render. Then, on settings load from context & apply correct one
initI18n(defaultSettings.LOCALE);

const App = () => {
  // Get data from disk: Settings, Vaults & DiscoveryData.
  // Storage hooks also keep and set state.
  const [settings, , isSettingsSynchd] = useGlobalStateStorage<SettingsType>(
    SETTINGS_GLOBAL_STORAGE,
    SERIALIZABLE
  );
  // Let's allow displaying some draft data quickly even if settings still not loaded:
  //TODO: don't do this: Better pass real settings and wherever it makes sense
  //use defaultSettings as default or wait to show otehrwise
  //TODO: setDiscoveryDataMap after any fetch in discovery

  const { t } = useTranslation();

  const [wallet, setWallet] = useState<WalletType>();
  const [newWalletSigners, setNewWalletSigners] = useState<Signers>();
  const navigation = useNavigation();

  const processWallet = (wallet: WalletType, newWalletSigners?: Signers) => {
    if (newWalletSigners) setNewWalletSigners(newWalletSigners);
    setWallet(wallet);
    if (navigation) navigation.navigate(WALLET_HOME);
    else throw new Error('navigation not set');
  };

  // inits Locale
  useEffect(() => {
    if (isSettingsSynchd && settings) initI18n(settings.LOCALE);
  }, [settings, isSettingsSynchd]);

  return (
    <RootStack.Navigator
      screenOptions={isNativeStack ? { animationEnabled: true } : {}}
    >
      <RootStack.Screen
        name={WALLETS}
        options={({ navigation }) => ({
          title: t('app.thunderDenTitle'),
          headerRightContainerStyle: { marginRight: 10 },
          headerRight: () => (
            <Button
              onPress={() => navigation.navigate(SETTINGS)}
              title={t('app.settingsButton')}
            />
          )
        })}
      >
        {() => <Wallets onWallet={processWallet} />}
      </RootStack.Screen>

      <RootStack.Screen
        name={WALLET_HOME}
        options={({ navigation }) => ({
          title: t('app.thunderDenTitle'),
          headerRightContainerStyle: { marginRight: 10 },
          headerRight: () => (
            <Button
              onPress={() => navigation.navigate(SETTINGS)}
              title={t('app.settingsButton')}
            />
          )
        })}
      >
        {() => {
          if (wallet) {
            const network = networkMapping[wallet.networkId];
            if (!network)
              throw new Error(`Invalid networkId ${wallet.networkId}`);
            return (
              <WalletHome
                walletId={wallet.walletId}
                network={network}
                {...(newWalletSigners
                  ? { newWalletSigners: newWalletSigners }
                  : {})}
              />
            );
          } else return null;
        }}
      </RootStack.Screen>

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
