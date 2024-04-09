import React, { useCallback, useContext, useMemo } from 'react';
import { View, Pressable } from 'react-native';
import { Text, KeyboardAwareScrollView } from '../../common/ui';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { NEW_WALLET, WALLET_HOME } from '../screens';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Svg, Path } from 'react-native-svg';
import BitcoinSign from '../../../assets/BitcoinSign.svg';
import BitcoinLogo from '../../../assets/Bitcoin.svg';
import RegtestLogo from '../../../assets/Regtest.svg';
import TestnetLogo from '../../../assets/Testnet.svg';
//import Prefectures from '../../../assets/Prefectures.ttf';
import { Ubuntu_700Bold } from '@expo-google-fonts/ubuntu';
import { useFonts } from 'expo-font';
//const [fontsLoaded] = useFonts({ Prefectures });
import { cssInterop } from 'nativewind';
import {
  WalletContext,
  type WalletContextType
} from '../contexts/WalletContext';
cssInterop(Svg, {
  className: {
    target: 'style',
    nativeStyleToProp: { width: true, height: true }
  }
});
cssInterop(BitcoinLogo, {
  className: {
    target: 'style',
    nativeStyleToProp: { width: true, height: true }
  }
});
cssInterop(RegtestLogo, {
  className: {
    target: 'style',
    nativeStyleToProp: { width: true, height: true }
  }
});
cssInterop(TestnetLogo, {
  className: {
    target: 'style',
    nativeStyleToProp: { width: true, height: true }
  }
});

const walletBgs = [
  //gradients are so cool, but not supported natively:
  //bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500
  'bg-blue-500',
  'bg-yellow-500',
  'bg-indigo-500',
  'bg-orange-500',
  'bg-green-500',
  'bg-purple-500',
  'bg-pink-500',
  'bg-cyan-500',
  'bg-red-500',
  'bg-teal-500'
];
const walletCls = [
  'text-blue-500',
  'text-yellow-500',
  'text-indigo-500',
  'text-orange-500',
  'text-green-500',
  'text-purple-500',
  'text-pink-500',
  'text-cyan-500',
  'text-red-500',
  'text-teal-500'
];
const walletBg = (index: number) => walletBgs[index % walletBgs.length];
const walletCl = (index: number) => walletCls[index % walletCls.length];

const WalletsScreen = () => {
  const context = useContext<WalletContextType | null>(WalletContext);
  if (context === null) throw new Error('Context was not set');
  const { onWallet, wallets } = context;
  if (!onWallet) throw new Error(`onWallet not set yet`);
  const [ubuntuLoaded] = useFonts({ Ubuntu700Bold: Ubuntu_700Bold });
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { t } = useTranslation();
  const handleWalletMap = useMemo(() => {
    if (!wallets) return {};
    else {
      const map: { [walletId: number]: () => void } = {};
      Object.keys(wallets).map(walletIdStr => {
        const walletId = Number(walletIdStr);
        const wallet = wallets[walletId];
        if (!wallet) throw new Error(`Unset wallet for ${walletId}`);
        map[walletId] = () => {
          console.log('onWallet', wallet);
          onWallet({ wallet });
          navigation.navigate(WALLET_HOME);
          //if (wallet.signersEncryption === 'PASSWORD') {
          //  setPasswordRequestWalletId(walletId);
          //} else {
          //  onWallet({ wallet });
          //  navigation.navigate(WALLET_HOME);
          //}
        };
      });
      return map;
    }
  }, [wallets, onWallet, navigation]);

  const handleNewWallet = useCallback(() => {
    if (!wallets) throw new Error('wallets not yet defined');
    navigation.navigate(NEW_WALLET, {
      walletId: Object.keys(wallets).length
    });
  }, [navigation, wallets]);

  return (
    <>
      <Pressable
        onPress={handleNewWallet}
        style={{ marginBottom: insets.bottom }}
        className={`bottom-8 right-8 z-10 p-4 bg-primary rounded-full hover:opacity-90 active:scale-95 active:opacity-90 fixed native:absolute shadow flex-row gap-1 items-center`}
      >
        <Svg
          className="fill-none stroke-white stroke-2 w-5 h-5"
          viewBox="0 0 24 24"
        >
          <Path d="M12 9v6m3-3H9m12 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
        </Svg>
        <Text className="text-center text-white font-semibold">
          {t('wallets.addNew')}
        </Text>
      </Pressable>
      <KeyboardAwareScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          //grow vertically to 100% and center child
          flexGrow: 1,
          justifyContent: 'center',
          alignItems: 'center'
        }}
      >
        <View className="gap-4 max-w-full pr-2 pl-2">
          {wallets &&
            Object.entries(wallets).map(([walletId, wallet], index) => (
              <Pressable
                className={`max-w-full w-96 min-h-56 gap-4 p-4 rounded-3xl active:opacity-90 hover:opacity-90 active:scale-95 overflow-hidden ${walletBg(index)}`}
                onPress={handleWalletMap[wallet.walletId]}
                key={walletId}
              >
                <View className="z-10 flex flex-row justify-between">
                  <Text
                    className={`${ubuntuLoaded ? "font-['Ubuntu700Bold']" : ''} uppercase text-base text-white`}
                  >
                    {Object.entries(wallets).length > 1
                      ? t('wallets.walletId', { id: index + 1 })
                      : t('wallets.mainWallet')}
                  </Text>
                  {wallet.networkId !== 'BITCOIN' && (
                    <View className={`flex-none rounded-xl ${walletBg(index)}`}>
                      <View className={`p-2 rounded-xl bg-white/70`}>
                        <Text
                          className={`font-semibold text-xs text-center text-primary right-0 leading-4 ${walletCl(index)}`}
                        >
                          {t('wallets.testWallet')}
                        </Text>
                        <Text
                          className={`font-semibold text-xs text-center text-primary right-0 leading-4 ${walletCl(index)}`}
                        >
                          {t('wallets.noRealValue')}
                        </Text>
                      </View>
                    </View>
                  )}
                </View>
                <View className="z-10 absolute bottom-4 left-4">
                  <Text className="flex-initial text-xs font-semibold text-white">
                    {t('wallets.createdOn')}
                  </Text>
                  <Text className="flex-initial text-xs font-semibold text-white">
                    {new Intl.DateTimeFormat(
                      undefined /*use system's locale */,
                      {
                        year: 'numeric',
                        month: 'long',
                        day: '2-digit'
                      }
                    ).format(new Date(wallet.creationEpoch * 1000))}
                  </Text>
                </View>
                <View className="z-10 absolute bottom-4 right-4 flex flex-row items-center gap-2">
                  <Text className="flex-initial uppercase text-xs font-bold text-white">
                    {wallet.networkId}
                  </Text>
                  {wallet.networkId === 'BITCOIN' ? (
                    <BitcoinLogo className="flex-initial w-8 h-8" />
                  ) : wallet.networkId === 'TESTNET' ? (
                    <TestnetLogo className="flex-initial w-8 h-8" />
                  ) : (
                    <RegtestLogo className="flex-initial w-8 h-8" />
                  )}
                </View>
                {/*<FontAwesome5
                  name="bitcoin"
                  size={256}
                  className="z-0 text-white opacity-10 absolute -bottom-24 -right-12"
                />*/}
                {
                  <BitcoinSign
                    opacity={0.1}
                    className="w-60 z-0 fill-white absolute -bottom-46"
                  />
                }
              </Pressable>
            ))}
        </View>
      </KeyboardAwareScrollView>
    </>
  );
};
export default React.memo(WalletsScreen);
