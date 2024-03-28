import React from 'react';
import { View, Platform, Pressable } from 'react-native';
import { Text, Button, KeyboardAwareScrollView } from '../../common/ui';
import type { Wallet, Wallets, Signers } from '../lib/wallets';
import { SERIALIZABLE } from '../../common/lib/storage';
import { useLocalStateStorage } from '../../common/hooks/useLocalStateStorage';
import { defaultSettings } from '../lib/settings';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { NEW_WALLET } from '../screens';
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
cssInterop(Svg, {
  className: {
    target: 'style',
    nativeStyleToProp: { width: true, height: true }
  }
});
//cssInterop(BitcoinSign, {
//  className: {
//    target: 'style',
//    nativeStyleToProp: { width: true, height: true }
//  }
//});
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
//import { FontAwesome5 } from '@expo/vector-icons';
//cssInterop(FontAwesome5, {
//  className: {
//    target: 'style',
//    nativeStyleToProp: { width: true, height: true }
//  }
//});

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

const walletId = 0;

const WalletsScreen = ({
  onWallet
}: {
  /** pass back signers if this is a new wallet that must be created */
  onWallet: (wallet: Wallet, newWalletSigners?: Signers) => void;
}) => {
  const [ubuntuLoaded] = useFonts({ Ubuntu700Bold: Ubuntu_700Bold });
  //const [fontsLoaded] = useFonts({
  //  Prefectures: require('../../../assets/Prefectures.ttf')
  //});
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { t } = useTranslation();
  const [wallets, setWallets, isWalletsSynchd] = useLocalStateStorage<Wallets>(
    `WALLETS`,
    SERIALIZABLE
  );

  //TODO: here i need to make sure the signersStorageEngine read or created
  //matches this system specs
  //if it does not, then create a new signersStorageEngine and ask the user
  //to provide new signers
  //I will have: NewWalletScreen, RecoverSignersWalletScreen

  const handleNewTestingWallet = () => {
    console.log('handleNewTestingWallet', 'TODO');
    const masterFingerprint = 'TODO';
    if (isWalletsSynchd && !wallets?.[0]) {
      const wallet: Wallet = {
        creationEpoch: Math.floor(Date.now() / 1000),
        walletId,
        version: defaultSettings.WALLETS_DATA_VERSION,
        networkId: 'TESTNET',
        signersEncryption: 'NONE',
        signersStorageEngine: Platform.OS === 'web' ? 'IDB' : 'SECURESTORE',
        encryption: 'NONE'
      };
      setWallets({ [walletId]: wallet });
      const signerId = 0; //ThunderDen v1.0 has Only 1 signer anyway
      onWallet(wallet, {
        [signerId]: {
          masterFingerprint,
          type: 'SOFTWARE',
          mnemonic:
            'goat oak pull seek know resemble hurt pistol head first board better'
        }
      });
    }
  };
  const handleNewWallet = () => navigation.navigate(NEW_WALLET);

  //TODO: do the translation of all the t() below:
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
                onPress={() => onWallet(wallet)}
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
        {isWalletsSynchd && !wallets?.[0] && (
          <Button onPress={handleNewTestingWallet}>
            {'Create Test Wallet'}
          </Button>
        )}
      </KeyboardAwareScrollView>
    </>
  );
};
export default WalletsScreen;
