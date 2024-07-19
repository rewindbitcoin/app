// TODO: extremelly important, before sharing this module make sure
// this works properly: react-native-get-random-values

import './global.css';
import './init';
import React, { useCallback, useEffect, useState, useMemo } from 'react';
import { Platform } from 'react-native';
import {
  SecureStorageInfoProvider,
  useSecureStorageInfo
} from './src/common/contexts/SecureStorageInfoContext';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import {
  createRootStack,
  isNativeStack,
  WALLETS,
  WALLET_HOME,
  SETTINGS,
  SETUP_VAULT,
  CREATE_VAULT,
  NEW_WALLET,
  UniversalNavigationOptions
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
import NetStatusProvider from './src/common/contexts/NetStatusContext';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { VaultSettings } from './src/app/lib/vaults';
import { useTheme, Button } from './src/common/ui';

import { defaultSettings } from './src/app/lib/settings';
import { I18nextProvider, useTranslation } from 'react-i18next';
import { i18n, initI18n } from './src/i18n-locales/init';
import { AuthenticationType } from 'expo-local-authentication';
import { useSettings } from './src/app/hooks/useSettings';
//Init for 1st render. Then, on settings load from context & apply correct one
initI18n(defaultSettings.LOCALE);

const RootStack = createRootStack();

const Main = () => {
  // Get settings from disk. It will be used for setting the correct LOCALE.
  const { settings } = useSettings();

  const secureStorageInfo = useSecureStorageInfo();
  //ios devices which do not have FACIAL_RECOGNITION are assumed to be the
  //ones with physical button. Also, initially iOsWithPhysicalButton will be
  //undefined since secureStorageInfo is async
  const iOsWithPhysicalButton: undefined | boolean =
    Platform.OS !== 'ios'
      ? false
      : secureStorageInfo
        ? !secureStorageInfo.authenticationTypes.includes(
            AuthenticationType.FACIAL_RECOGNITION
          )
        : undefined;

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
    if (settings?.LOCALE && defaultSettings.LOCALE !== settings.LOCALE)
      initI18n(settings.LOCALE);
  }, [settings?.LOCALE]);

  //disable elastic effect
  //https://stackoverflow.com/a/75120095/1660381
  useEffect(() => {
    if (Platform.OS === 'web') {
      const style = document.createElement('style');
      style.textContent = `html { overscroll-behavior: none; }`;
      document.head.appendChild(style);
      return () => {
        document.head.removeChild(style);
      };
    }
    return () => {};
  }, []);

  const headerRightContainerStyle = { marginRight: 16 };

  //TODO: These screens below re-render too oftern, i'm passing new objects {{}}
  //to all of them, the useCallback does notthing if also passing {{}}

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
  const CreateVaultScreenWithSettingsOnPushed = useCallback(
    () => (
      <CreateVaultScreen
        vaultSettings={vaultSettings}
        onVaultPushed={() => {
          if (navigation.canGoBack()) navigation.goBack();
        }}
      />
    ),
    [navigation, vaultSettings]
  );
  const screenOptions = useMemo<UniversalNavigationOptions>(
    () =>
      isNativeStack
        ? { animationEnabled: true }
        : {
            //So that the header is always displayed -
            //however the browser address bar is always displayed
            //https://reactnavigation.org/docs/stack-navigator/#cardstyle
            cardStyle: { flex: 1 }
          },
    []
  );
  return (
    <WalletProvider>
      <RootStack.Navigator screenOptions={screenOptions}>
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
          options={{
            title: ''
            // set with setOptions in WalletHomeScreen - removed default value
            // t('app.walletTitle') from here to avoid unpleasant quick text rewrite
            // t('app.walletTitle')
          }}
          component={WalletHomeScreen}
        />

        <RootStack.Screen
          name={SETUP_VAULT}
          options={{
            title: t('vaultSetup.title')

            //headerShadowVisible:false //TO disable the border line of the header

            //TODO: For iOS way cooler but work to be done yet
            //https://github.com/react-navigation/react-navigation/issues/11550
            //https://github.com/software-mansion/react-native-screens/discussions/1229#discussioncomment-1927333
            //headerTitle: t('vaultSetup.title'),
            //headerLargeTitle: true,
            //headerTransparent: Platform.OS === 'ios',
            //headerBlurEffect: 'regular'
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
            presentation: iOsWithPhysicalButton === true ? 'card' : 'modal'
          }}
          component={NewWalletScreen}
        />

        <RootStack.Screen
          name={CREATE_VAULT}
          options={{
            title: t('app.createVaultTitle'),
            // See comment above on Conditional presentation mode based on device model
            presentation: iOsWithPhysicalButton === true ? 'card' : 'modal'
          }}
          component={CreateVaultScreenWithSettingsOnPushed}
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
          <NetStatusProvider apiUrl={defaultSettings.GENERATE_204}>
            <GlobalStorageProvider>
              <SecureStorageInfoProvider>
                <ToastProvider>
                  <I18nextProvider i18n={i18n}>
                    <MainMemo />
                  </I18nextProvider>
                </ToastProvider>
              </SecureStorageInfoProvider>
            </GlobalStorageProvider>
          </NetStatusProvider>
        </NavigationContainer>
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}
