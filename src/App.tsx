import '../global.css';
import '../init';
import ErrorBoundary from './ErrorBoundary';
import React, {
  useCallback,
  useEffect,
  useState,
  useMemo,
  useRef
} from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import {
  SecureStorageInfoProvider,
  useSecureStorageInfo
} from './common/contexts/SecureStorageInfoContext';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';

import {
  createRootStack,
  isNativeStack,
  WALLETS,
  WALLET_HOME,
  SETTINGS,
  SETUP_VAULT,
  CREATE_VAULT,
  SEND,
  RECEIVE,
  NEW_WALLET,
  UniversalNavigationOptions
} from './app/screens';
import { NavigationContainer, useNavigation } from '@react-navigation/native';
import { ToastProvider } from './common/components/Toast';
import WalletsScreen from './app/screens/WalletsScreen';
import NewWalletScreen from './app/screens/NewWalletScreen';
import WalletHomeScreen from './app/screens/WalletHomeScreen';
import SetUpVaultScreen from './app/screens/SetUpVaultScreen';
import SendScreen from './app/screens/SendScreen';
import ReceiveScreen from './app/screens/ReceiveScreen';
import CreateVaultScreen from './app/screens/CreateVaultScreen';
import { WalletProvider } from './app/contexts/WalletContext';
import Settings from './app/screens/SettingsScreen';
import { GlobalStorageProvider } from './common/contexts/GlobalStorageContext';
import NetStatusProvider from './app/contexts/NetStatusContext';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { VaultSettings } from './app/lib/vaults';
import { useTheme, Button } from './common/ui';

import { I18nextProvider, useTranslation } from 'react-i18next';
import { i18n } from './i18n-locales/init';
import { i18nLanguageInit, useLocalization } from './app/hooks/useLocalization';
i18nLanguageInit();
import { AuthenticationType } from 'expo-local-authentication';
import { Pressable } from 'react-native';
//Init for 1st render. Then, on settings load from context & apply correct one

const RootStack = createRootStack();

const Main = () => {
  const { secureStorageInfo } = useSecureStorageInfo();
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
  const theme = useTheme();

  const settingsButton = useCallback(
    () => (
      <Pressable
        hitSlop={10}
        onPress={() => navigation.navigate(SETTINGS)}
        className={`hover:opacity-90 active:scale-95 active:opacity-90`}
      >
        <Ionicons
          name="settings-outline"
          size={20}
          color={theme.colors.primary}
        />
      </Pressable>
    ),
    [navigation, theme.colors.primary]
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

  //This will change the i18n language if the user dynamically changes it
  useLocalization();

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

  const SetUpVaultScreenWithOnComplete = () => {
    //useEffect(() => {
    //  // This function will be called when the component unmounts
    //  return () => {
    //    console.log('SetUpVaultScreenWithOnComplete is being unmounted');
    //  };
    //}, []);
    return (
      <SetUpVaultScreen
        onVaultSetUpComplete={(vaultSettings: VaultSettings) => {
          setVaultSettings(vaultSettings);
          if (navigation) navigation.navigate(CREATE_VAULT);
          else throw new Error('navigation not set');
        }}
      />
    );
  };
  const CreateVaultScreenWithSettings = useCallback(
    () => <CreateVaultScreen vaultSettings={vaultSettings} />,
    [vaultSettings]
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
          name={SEND}
          options={{
            title: t('send.title')
          }}
          component={SendScreen}
        />

        <RootStack.Screen
          name={RECEIVE}
          options={{
            title: t('receive.title')
          }}
          component={ReceiveScreen}
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
          component={CreateVaultScreenWithSettings}
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
  const [errorKey, setErrorKey] = useState<number>(0);
  const { t } = useTranslation();
  const onGlobalError = useCallback(() => {
    setErrorKey(prevErrorKey => prevErrorKey + 1);
  }, []);

  // Refs for notification listeners:
  //while the app is running
  const notificationListener = useRef<Notifications.Subscription>();
  //when a user taps a notification
  const responseListener = useRef<Notifications.Subscription>();

  useEffect(() => {
    notificationListener.current =
      Notifications.addNotificationReceivedListener(notification => {
        console.log('Notification received:', notification);
      });

    responseListener.current =
      Notifications.addNotificationResponseReceivedListener(response => {
        console.warn('Notification response received:', response);
      });

    return () => {
      if (notificationListener.current) {
        Notifications.removeNotificationSubscription(
          notificationListener.current
        );
      }
      if (responseListener.current) {
        Notifications.removeNotificationSubscription(responseListener.current);
      }
    };
  }, []);

  return (
    <SafeAreaProvider>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <NavigationContainer theme={useTheme()}>
          <ToastProvider>
            <GlobalStorageProvider>
              <NetStatusProvider>
                <SecureStorageInfoProvider>
                  <I18nextProvider i18n={i18n}>
                    <ErrorBoundary key={errorKey} onError={onGlobalError} t={t}>
                      <MainMemo />
                    </ErrorBoundary>
                  </I18nextProvider>
                </SecureStorageInfoProvider>
              </NetStatusProvider>
            </GlobalStorageProvider>
          </ToastProvider>
        </NavigationContainer>
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}
