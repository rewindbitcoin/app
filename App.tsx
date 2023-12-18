import './init';
import React, { useEffect } from 'react';
import { Platform, Button } from 'react-native';
import { HOME } from './src/screens';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createStackNavigator } from '@react-navigation/stack';
import Home from './src/components/views/Home';
import { StorageProvider } from './src/contexts/StorageContext';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SERIALIZABLE } from './src/lib/storage';
import {
  SETTINGS_GLOBAL_STORAGE,
  useGlobalStateStorage
} from './src/contexts/StorageContext';
import { defaultSettings, Settings } from './src/lib/settings';
const isNativeStack = Platform.OS === 'ios' || Platform.OS === 'android';
const Stack = isNativeStack
  ? createNativeStackNavigator()
  : createStackNavigator();
import initI18n from './src/i18n/i18n';
//Must be globally init to something... then, on settings load from context, apply the correct one
initI18n(defaultSettings.LOCALE);

const App = () => {
  const [settingsState] = useGlobalStateStorage<Settings>(
    SETTINGS_GLOBAL_STORAGE,
    SERIALIZABLE
  );
  const settings = settingsState || defaultSettings;
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
          options={{
            title: 'Thunder Den',
            headerRight: () => (
              <Button
                onPress={() => alert('This is a button!')}
                title="Settings"
                color="#00cc00"
              />
            )
          }}
          component={Home}
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
