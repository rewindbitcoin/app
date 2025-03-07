import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Text, View, Pressable } from 'react-native';
import { KeyboardAwareScrollView } from '../../common/ui';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { NEW_WALLET, WALLET_HOME } from '../screens';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Svg, Path } from 'react-native-svg';
import BitcoinSign from '../../../assets/BitcoinSign.svg';
import BitcoinLogo from '../../../assets/Bitcoin.svg';
import RegtestLogo from '../../../assets/Regtest.svg';
import TestnetLogo from '../../../assets/Testnet.svg';
import { Ubuntu_700Bold } from '@expo-google-fonts/ubuntu';
import { useFonts } from 'expo-font';
import { cssInterop } from 'nativewind';
import { useWallet } from '../hooks/useWallet';
import { walletTitle } from '../lib/wallets';
import { useLocalization } from '../hooks/useLocalization';
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
  'bg-green-500',
  'bg-orange-500',
  'bg-indigo-500',
  'bg-pink-500',
  'bg-purple-500',
  'bg-cyan-500',
  'bg-red-500',
  'bg-teal-500'
];
const walletCls = [
  'text-blue-500',
  'text-yellow-500',
  'text-green-500',
  'text-orange-500',
  'text-indigo-500',
  'text-pink-500',
  'text-purple-500',
  'text-cyan-500',
  'text-red-500',
  'text-teal-500'
];
const walletBg = (index: number) => walletBgs[index % walletBgs.length];
const walletCl = (index: number) => walletCls[index % walletCls.length];

const WalletsScreen = () => {
  const { onWallet, wallets } = useWallet();
  if (!onWallet) throw new Error(`onWallet not set yet`);
  const [ubuntuLoaded] = useFonts({ Ubuntu700Bold: Ubuntu_700Bold });
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { t } = useTranslation();
  const { locale } = useLocalization();
  const handleWalletMap = useMemo(() => {
    if (!wallets) return {};
    else {
      const map: { [walletId: number]: () => void } = {};
      Object.keys(wallets).map(walletIdStr => {
        const walletId = Number(walletIdStr);
        const wallet = wallets[walletId];
        if (!wallet) throw new Error(`Unset wallet for ${walletId}`);
        map[walletId] = () => {
          onWallet({ wallet });
          navigation.navigate(WALLET_HOME, { walletId });
        };
      });
      return map;
    }
  }, [wallets, onWallet, navigation]);

  const handleNewWallet = useCallback(() => {
    if (!wallets) throw new Error('wallets not yet defined');
    //Get the max used + 1 (note that some wallets may have been deleted) so don't
    //use wallets.length since we may end up reusing existin indices!!!
    const walletId =
      Object.values(wallets).length === 0
        ? 0
        : Math.max(...Object.values(wallets).map(wallet => wallet.walletId)) +
          1;
    navigation.navigate(NEW_WALLET, { walletId });
  }, [navigation, wallets]);

  const mbStyle = useMemo(() => ({ marginBottom: insets.bottom }), [insets]);

  const buttonHeightRef = useRef<number>();
  const scrollViewHeightRef = useRef<number>();
  const contentHeightRef = useRef<number>();
  const [extraPadding, setExtraPadding] = useState<boolean>(false);

  const handleExtraPadding = () => {
    //Wait until we have all the layouts
    if (
      buttonHeightRef.current &&
      scrollViewHeightRef.current &&
      contentHeightRef.current
    ) {
      const newExtraPadding =
        scrollViewHeightRef.current - contentHeightRef.current <=
        buttonHeightRef.current + 8 * 5; /*bottom-8*/
      //dont allow to set it to false
      //to avoid unnecessary re-layouts and possible flickering
      if (newExtraPadding === true && extraPadding === false)
        setExtraPadding(true);
    }
  };

  return (
    <>
      <Pressable
        onLayout={event => {
          buttonHeightRef.current = event.nativeEvent.layout.height;
          handleExtraPadding();
        }}
        onPress={handleNewWallet}
        style={mbStyle}
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
        contentContainerClassName="justify-center items-center"
        contentContainerStyle={
          { flexGrow: 1 } /*className flex-1 does not work!*/
        }
        onLayout={event => {
          scrollViewHeightRef.current = event.nativeEvent.layout.height;
          handleExtraPadding();
        }}
      >
        <View
          className={`gap-4 w-full max-w-screen-sm mx-auto px-2 py-6 ${extraPadding ? 'pb-32' : ''}`}
          onLayout={event => {
            contentHeightRef.current = event.nativeEvent.layout.height;
            handleExtraPadding();
          }}
        >
          {wallets &&
            Object.entries(wallets).map(([walletId, wallet], index) => (
              <Pressable
                className={`w-full max-w-96 min-h-56 gap-4 p-4 rounded-3xl active:opacity-90 hover:opacity-90 active:scale-95 ${walletBg(index)} overflow-hidden`}
                onPress={handleWalletMap[wallet.walletId]}
                key={walletId}
              >
                <View className="z-10 flex-row justify-between">
                  <Text
                    className={
                      `${ubuntuLoaded ? "font-['Ubuntu700Bold']" : ''} uppercase text-base text-white overflow-hidden flex-1`
                      // flex-1 explanation:
                      // https://www.bam.tech/article/why-my-text-is-going-off-screen
                    }
                  >
                    {walletTitle(wallet, wallets, t)}
                  </Text>
                  {wallet.networkId !== 'BITCOIN' && (
                    <View className="self-start p-2 rounded-xl bg-white/70">
                      <Text
                        className={`font-semibold text-xs text-center leading-4 ${walletCl(index)}`}
                      >
                        {t('wallets.testWallet')}
                      </Text>
                      <Text
                        className={`font-semibold text-xs text-center leading-4 ${walletCl(index)}`}
                      >
                        {t('wallets.noRealValue')}
                      </Text>
                    </View>
                  )}
                </View>
                <View className="z-10 absolute bottom-4 left-4">
                  <Text className="flex-initial text-xs font-semibold text-white">
                    {t('wallets.createdOn')}
                  </Text>
                  <Text className="flex-initial text-xs font-semibold text-white">
                    {new Intl.DateTimeFormat(locale, {
                      year: 'numeric',
                      month: 'long',
                      day: '2-digit'
                    }).format(new Date(wallet.creationEpoch * 1000))}
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
                <BitcoinSign
                  opacity={0.1}
                  className="w-60 z-0 fill-white absolute -bottom-46"
                />
              </Pressable>
            ))}
        </View>
      </KeyboardAwareScrollView>
    </>
  );
};
export default React.memo(WalletsScreen);
