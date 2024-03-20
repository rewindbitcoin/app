import React from 'react';
import { View, Platform, Pressable } from 'react-native';
import { Text, Button, KeyboardAwareScrollView } from '../../common/ui';
import type { Wallet, Wallets, Signers } from '../lib/wallets';
import { SERIALIZABLE } from '../../common/lib/storage';
import { useLocalStateStorage } from '../../common/hooks/useLocalStateStorage';
import { defaultSettings } from '../lib/settings';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { IMPORT_WALLET } from '../screens';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Svg, Path } from 'react-native-svg';
import BitcoinLogo from '../../../assets/Bitcoin.svg';
import { cssInterop } from 'nativewind';
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

const walletBackgroundColors = [
  'bg-blue-500',
  'bg-orange-500',
  'bg-green-500',
  'bg-indigo-500',
  'bg-yellow-500',
  'bg-purple-500',
  'bg-pink-500',
  'bg-cyan-500',
  'bg-red-500',
  'bg-teal-500'
];

const walletId = 0;

const WalletsScreen = ({
  onWallet
}: {
  /** pass back signers if this is a new wallet that must be created */
  onWallet: (wallet: Wallet, newWalletSigners?: Signers) => void;
}) => {
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
  //I will have: ImportWalletScreen, NewWalletScreen, RecoverSignersWalletScreen

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
  const handleImportWallet = () => navigation.navigate(IMPORT_WALLET);

  //TODO: do the translation of all the t() below:
  return (
    <>
      <Pressable
        onPress={handleImportWallet}
        style={{ marginBottom: insets.bottom }}
        className={`bottom-8 right-8 z-10 p-4 bg-primary rounded-2xl hover:opacity-90 active:scale-95 active:opacity-90 fixed native:absolute shadow flex-row gap-1 items-center`}
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
        <View className="gap-4">
          {wallets &&
            Object.entries(wallets).map(([walletId, wallet], index) => (
              <Pressable
                className={`gap-4 max-w-96 p-4 rounded-lg active:opacity-90 hover:opacity-90 active:scale-95 overflow-hidden ${walletBackgroundColors[index % walletBackgroundColors.length]}`}
                onPress={() => onWallet(wallet)}
                key={walletId}
              >
                <BitcoinLogo className="h-96 w-96 absolute opacity-30" />
                <Text className="font-semibold text-white">
                  {'Main Wallet'}
                </Text>
                <Text className="text-left text-white">
                  {JSON.stringify(wallet, null, 2)}
                </Text>
              </Pressable>
            ))}
        </View>
        {isWalletsSynchd && !wallets?.[0] && (
          <Button mode="contained" onPress={handleNewTestingWallet}>
            {'Create Test Wallet'}
          </Button>
        )}
      </KeyboardAwareScrollView>
    </>
  );
};
export default WalletsScreen;
