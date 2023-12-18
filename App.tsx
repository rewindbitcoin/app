import './init';
import React, { useEffect } from 'react';
import { Platform, Button } from 'react-native';
import { StackParamList, HOME, SETTINGS } from './src/screens';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createStackNavigator } from '@react-navigation/stack';
import Home from './src/components/views/Home';
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
const Stack = isNativeStack
  ? createNativeStackNavigator<StackParamList>()
  : createStackNavigator<StackParamList>();
import initI18n from './src/i18n/i18n';
//Must be globally init to something... then, on settings load from context,
//apply the correct one
initI18n(defaultSettings.LOCALE);

const App = () => {
  const [settingsState] = useGlobalStateStorage<SettingsType>(
    SETTINGS_GLOBAL_STORAGE,
    SERIALIZABLE
  );
  const settings = settingsState || defaultSettings;
  const { t } = useTranslation();
  useEffect(() => {
    initI18n(settings.LOCALE);
  }, [settings.LOCALE]);
  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={isNativeStack ? { animationEnabled: true } : {}}
      >
        <Stack.Screen
          name={HOME}
          options={({ navigation }) => ({
            title: t('app.thunderDenTitle'),
            headerRight: () => (
              <Button
                onPress={() => navigation.navigate(SETTINGS)}
                title={t('app.settingsButton')}
              />
            )
          })}
          component={Home}
        />
        <Stack.Screen
          name={SETTINGS}
          component={Settings}
          options={{ title: t('app.settingsTitle') }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
};

//Apply contexts:
export default () => (
  <SafeAreaProvider>
    <StorageProvider>
      <App />
    </StorageProvider>
  </SafeAreaProvider>
);
