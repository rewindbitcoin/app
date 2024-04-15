// TODO: extremelly important, before sharing this module make sure
// this works properly: react-native-get-random-values

import './global.css';
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
  NEW_WALLET
} from './src/app/screens';
import { NavigationContainer, useNavigation } from '@react-navigation/native';
import { ToastProvider } from './src/common/components/Toast';
import WalletsScreen from './src/app/screens/WalletsScreen';
import NewWalletScreen from './src/app/screens/NewWalletScreen';
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
  const [vaultSettings, setVaultSettings] = useState<VaultSettings>();

  const navigation = useNavigation();

  const settingsButton = useCallback(
    () => (
      <Button mode="text" onPress={() => navigation.navigate(SETTINGS)}>
        {t('app.settingsButton')}
      </Button>
    ),
    [navigation, t]
  );
  const onGoBack = useCallback(() => {
    if (navigation.canGoBack()) navigation.goBack();
  }, [navigation]);
  const cancelModalButton = useCallback(
    () => (
      <Button mode="text" onPress={onGoBack}>
        {t('cancelButton')}
      </Button>
    ),
    [t, onGoBack]
  );

  // init real Locale
  useEffect(() => {
    if (settings?.LOCALE) initI18n(settings.LOCALE);
  }, [settings?.LOCALE]);

  const headerRightContainerStyle = { marginRight: 16 };

  const WalletHomeWithSetUpVaultInit = useCallback(
    () => (
      <WalletHomeScreen
        onSetUpVaultInit={() => {
          if (navigation) navigation.navigate(SETUP_VAULT);
          else throw new Error('navigation not set');
        }}
      />
    ),
    [navigation]
  );
  const SetUpVaultScreenWithOnComplete = useCallback(() => {
    return (
      <SetUpVaultScreen
        onVaultSetUpComplete={(vaultSettings: VaultSettings) => {
          setVaultSettings(vaultSettings);
          if (navigation) navigation.navigate(CREATE_VAULT);
          else throw new Error('navigation not set');
        }}
      />
    );
  }, [navigation]);
  const NewWalletScreenWithToast = useCallback(
    () => (
      <ToastProvider>
        <NewWalletScreen />
      </ToastProvider>
    ),
    []
  );
  const CreateVaultScreenWithSettingsOnPushedAndToast = useCallback(
    () => (
      <ToastProvider>
        <CreateVaultScreen
          vaultSettings={vaultSettings}
          onVaultPushed={() => navigation.navigate(WALLET_HOME)}
        />
      </ToastProvider>
    ),
    [navigation, vaultSettings]
  );
  return (
    <WalletProvider>
      <RootStack.Navigator
        screenOptions={isNativeStack ? { animationEnabled: true } : {}}
      >
        <RootStack.Screen
          name={WALLETS}
          options={{
            title: t('app.mainTitle'),
            headerRightContainerStyle,
            headerRight: settingsButton
          }}
          component={WalletsScreen}
        />

        <RootStack.Screen
          name={WALLET_HOME}
          options={{ title: t('app.walletTitle') }}
          component={WalletHomeWithSetUpVaultInit}
        />

        <RootStack.Screen
          name={SETUP_VAULT}
          options={{
            title: t('vaultSetup.title'),

            //headerShadowVisible:false //TO disable the border line of the header

            //TODO: For iOS way cooler but work to be done yet
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
          component={SetUpVaultScreenWithOnComplete}
        />

        <RootStack.Screen
          name={SETTINGS}
          component={Settings}
          options={{ title: t('app.settingsTitle') }}
        />

        <RootStack.Screen
          name={NEW_WALLET}
          options={{
            title: t('app.newWalletTitle'),
            headerRightContainerStyle,
            headerRight: cancelModalButton,
            presentation: 'modal' //Modals need their own Toast component
          }}
          component={NewWalletScreenWithToast}
        />

        <RootStack.Screen
          name={CREATE_VAULT}
          options={{
            title: t('app.createVaultTitle'),
            presentation: 'modal' //Modals need their own Toast component
          }}
          component={CreateVaultScreenWithSettingsOnPushedAndToast}
        />
      </RootStack.Navigator>
    </WalletProvider>
  );
};

const MainMemo = React.memo(Main);

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
                <MainMemo />
              </ToastProvider>
            </SecureStorageAvailabilityProvider>
          </StorageProvider>
        </NavigationContainer>
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}
