// TODO: discovery is created here
// -> all calls to discovery with side effects should be handled here
// side effects mean that the call may return different values depending on
// external factors. utxos may change, a tx status may change and so on.
// TODO: In vaults.ts there are uses of discovery that produce side effects. Move that
// from there.
// TODO: feeEstimates and btcRates also processed here too. To avoid side effects
// TODO: then pass a function down called: refresh()
import './init';
import React, { useEffect, useCallback, useState } from 'react';
import { Platform, Button } from 'react-native';
import { RootStackParamList, HOME, SETTINGS } from './src/screens';
import { NavigationContainer } from '@react-navigation/native';
import { Toast, CustomToast } from './src/components/common/Toast';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createStackNavigator } from '@react-navigation/stack';
import Home from './src/components/views/Home';
import Settings from './src/components/views/Settings';
import { StorageProvider } from './src/contexts/StorageContext';
import {
  SafeAreaProvider,
  useSafeAreaInsets
} from 'react-native-safe-area-context';
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
//Init for 1st render. Then, on settings load from context & apply correct one
initI18n(defaultSettings.LOCALE);

import { getBtcFiat } from './src/lib/btcRates';

import { EsploraExplorer } from '@bitcoinerlab/explorer';
import { DiscoveryFactory, DiscoveryInstance } from '@bitcoinerlab/discovery';
import { networks, Network } from 'bitcoinjs-lib';
const network = networks.testnet;

function esploraUrl(network: Network) {
  const url =
    network === networks.testnet
      ? 'https://blockstream.info/testnet/api/'
      : network === networks.bitcoin
      ? 'https://blockstream.info/api/'
      : null;
  if (!url) throw new Error(`Esplora API not available for this network`);
  return url;
}
const App = () => {
  const [settingsState] = useGlobalStateStorage<SettingsType>(
    SETTINGS_GLOBAL_STORAGE,
    SERIALIZABLE
  );
  const insets = useSafeAreaInsets();
  const settings = settingsState || defaultSettings;

  const [btcFiat, setBtcFiat] = useState<number | null>(null);
  const [feeEstimates, setFeeEstimates] = useState<Record<
    string,
    number
  > | null>(null);
  const [discovery, setDiscovery] = useState<DiscoveryInstance | null>(null);

  const updateBtcFiat = useCallback(async () => {
    try {
      const btcFiat = await getBtcFiat(settings.CURRENCY);
      setBtcFiat(btcFiat);
    } catch (err) {
      Toast.show({
        topOffset: insets.top,
        type: 'error',
        text1: t('app.btcRatesError.title'),
        text2: t('app.btcRatesError.message', { currency: settings.CURRENCY })
      });
    }
  }, [settings.CURRENCY]);
  const updateFeeEstimates = useCallback(async () => {
    if (discovery) {
      try {
        const feeEstimates = await discovery.getExplorer().fetchFeeEstimates();
        setFeeEstimates(feeEstimates);
      } catch (err) {
        Toast.show({
          topOffset: insets.top,
          type: 'error',
          text1: t('app.feeEstimatesError.title'),
          text2: t('app.feeEstimatesError.message')
        });
      }
    }
  }, [discovery]);
  const { t } = useTranslation();

  ////
  //Set discovery:
  ////
  useEffect(() => {
    let isMounted = true;
    let isExplorerConnected = false;
    const url = esploraUrl(network);
    const explorer = new EsploraExplorer({ url });
    const { Discovery } = DiscoveryFactory(explorer, network);

    (async function () {
      await explorer.connect();
      isExplorerConnected = true;
      const discovery = new Discovery();
      if (isMounted) setDiscovery(discovery);
    })();

    return () => {
      isMounted = false;
      if (isExplorerConnected) {
        explorer.close();
        isExplorerConnected = false;
      }
    };
  }, [network]);

  useEffect(() => {
    updateFeeEstimates();
    const interval = setInterval(() => {
      updateFeeEstimates();
    }, settings.BTC_FEE_ESTIMATES_REFRESH_INTERVAL_MS);
    return () => {
      clearInterval(interval);
    };
  }, [updateFeeEstimates, settings.BTC_FEE_ESTIMATES_REFRESH_INTERVAL_MS]);

  //const syncBlockchain = useCallback(async () => {
  //  const { utxos } = discovery.getUtxosAndBalance({ descriptors });
  //}, [discovery]);

  useEffect(() => {
    initI18n(settings.LOCALE);
  }, [settings.LOCALE]);
  useEffect(() => {
    updateBtcFiat();
    const interval = setInterval(() => {
      updateBtcFiat();
    }, settings.BTC_FIAT_REFRESH_INTERVAL_MS);
    return () => {
      clearInterval(interval);
    };
  }, [updateBtcFiat, settings.BTC_FIAT_REFRESH_INTERVAL_MS]);

  return (
    <NavigationContainer>
      <RootStack.Navigator
        screenOptions={isNativeStack ? { animationEnabled: true } : {}}
      >
        <RootStack.Screen
          name={HOME}
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
          {() => <Home btcFiat={btcFiat} feeEstimates={feeEstimates} />}
        </RootStack.Screen>
        <RootStack.Screen
          name={SETTINGS}
          component={Settings}
          options={{ title: t('app.settingsTitle') }}
        />
      </RootStack.Navigator>
      <CustomToast />
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
