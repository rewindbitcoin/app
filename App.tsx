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
import { GlobalStorageProvider } from './src/common/contexts/GlobalStorageContext';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SERIALIZABLE } from './src/common/lib/storage';
import { useStorage } from './src/common/hooks/useStorage';
import { SETTINGS_GLOBAL_STORAGE } from './src/app/lib/settings';
import type { VaultSettings } from './src/app/lib/vaults';
import { useTheme, Button } from './src/common/ui';
import { deviceName } from 'expo-device';

import {
  defaultSettings,
  Settings as SettingsType
} from './src/app/lib/settings';
import { useTranslation } from 'react-i18next';
import { initI18n } from './src/i18n-locales/init';
//Init for 1st render. Then, on settings load from context & apply correct one
initI18n(defaultSettings.LOCALE);

const RootStack = createRootStack();

const iOsWithPhysicalButton =
  deviceName &&
  Platform.OS === 'ios' &&
  [
    'iPhone',
    'iPhone 3G',
    'iPhone 3GS',
    'iPhone 4',
    'iPhone 4S',
    'iPhone 5',
    'iPhone 5c',
    'iPhone 5s',
    'iPhone 6',
    'iPhone 6 Plus',
    'iPhone 6s',
    'iPhone 6s Plus',
    'iPhone SE',
    'iPhone 7',
    'iPhone 7 Plus',
    'iPhone 8',
    'iPhone 8 Plus',
    'iPhone SE (2nd generation)',
    'iPhone SE (3rd generation)'
  ].includes(deviceName);

const Main = () => {
  // Get settings from disk. It will be used for setting the correct LOCALE.
  const [settings] = useStorage<SettingsType>(
    SETTINGS_GLOBAL_STORAGE,
    SERIALIZABLE,
    undefined,
    undefined,
    undefined,
    undefined,
    'GLOBAL'
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
          onVaultPushed={() => {
            if (navigation.canGoBack()) navigation.goBack();
          }}
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
            // Conditional presentation mode based on device model
            // This adjustment is necessary due to a specific issue observed on
            // iOS devices with physical home buttons.
            // When a nested modal is closed on such devices, the entire screen
            // that encalsulated the previous modal shifts a bit, disrupting the
            // user experience.
            // The following patch adjusts the modal presentation style to
            // 'fullScreenModal' for devices with physical buttons
            // to mitigate this issue.
            // - Issue related to screen shifting on close:
            // https://github.com/react-navigation/react-navigation/issues/11664
            // - Related discussion: https://github.com/react-navigation/react-navigation/issues/11875
            // How to Reproduce the Issue:
            // 1. Close and Restart the App on iOS device with physical button:
            // 2. Navigate to New Wallet:
            // 3. Access Advanced Options:
            // 4. Open any Modal (Click on the information (i) icon)
            // 5. Close the Modal
            // 6. After closing the modal the screen shifts or jumps.
            // Note: Further testing on physical devices (not just simulators)
            // is pending to confirm if the issue persists there as well.
            presentation: (iOsWithPhysicalButton
              ? 'fullScreenModal'
              : 'modal') as 'modal' //web (non-native) stack does not support fullScreenModal. However we only set it on ohysical devices which we are sure are using the native stack
          }}
          component={
            //Modals need their own Toast component
            NewWalletScreenWithToast
          }
        />

        <RootStack.Screen
          name={CREATE_VAULT}
          options={{
            title: t('app.createVaultTitle'),
            // See comment above on Conditional presentation mode based on device model
            presentation: (iOsWithPhysicalButton
              ? 'fullScreenModal'
              : 'modal') as 'modal'
          }}
          component={
            //Modals need their own Toast component
            CreateVaultScreenWithSettingsOnPushedAndToast
          }
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
          <GlobalStorageProvider>
            <SecureStorageAvailabilityProvider>
              <ToastProvider>
                <MainMemo />
              </ToastProvider>
            </SecureStorageAvailabilityProvider>
          </GlobalStorageProvider>
        </NavigationContainer>
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}
