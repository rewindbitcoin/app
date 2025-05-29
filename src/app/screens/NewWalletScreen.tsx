import React, { useCallback, useEffect, useRef, useState } from 'react';
import { defaultSettings } from '../lib/settings';
import type { Wallet, Signer } from '../lib/wallets';
import { View, Text, Pressable, Keyboard, Platform } from 'react-native';
import {
  checkReadWriteBiometricsAccessAsync,
  type Engine as StorageEngine
} from '../../common/lib/storage';
import {
  Button,
  ActivityIndicator,
  KeyboardAwareScrollView,
  Modal
} from '../../common/ui';
import { useTranslation } from 'react-i18next';
import Bip39, { validateMnemonic } from '../components/Bip39';
import ConfirmBip39 from '../components/ConfirmBip39';
import WalletAdvancedSettings, {
  type AdvancedSettings
} from '../components/WalletAdvancedSettings';
import { useSecureStorageInfo } from '../../common/contexts/SecureStorageInfoContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { generateMnemonic } from 'bip39';
import { NetworkId, networkMapping } from '../lib/network';
import {
  useNavigation,
  type RouteProp,
  useRoute
} from '@react-navigation/native';
import { getPasswordDerivedCipherKey } from '../../common/lib/cipher';
import { getMasterNode } from '../lib/vaultDescriptors';
import Password from '../components/Password';
import type { RootStackParamList, NavigationPropsByScreenId } from '../screens';
import { shallowEqualArrays } from 'shallow-equal';
import { useWallet } from '../hooks/useWallet';

export default function NewWalletScreen() {
  const { onWallet } = useWallet();

  const route = useRoute<RouteProp<RootStackParamList, 'NEW_WALLET'>>();
  const navigation = useNavigation<NavigationPropsByScreenId['NEW_WALLET']>();
  const walletId = route.params?.walletId;
  if (walletId === undefined)
    throw new Error(`Wallets should have been loaded`);
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { secureStorageInfo } = useSecureStorageInfo();
  if (!secureStorageInfo)
    throw new Error('Could not retrieve Secure Storage availability');
  const { canUseSecureStorage } = secureStorageInfo;
  const [isImport, setIsImport] = useState<boolean>(false);
  const [isConfirmBip39, setIsConfirmBip39] = useState<boolean>(false);
  const [isHiddenBip39ConfModal, setIsHiddenBip39ConfModal] =
    useState<boolean>(false);
  //const [words, setWords] = useState<string[]>(Array(12).fill(''));
  const [words, setWords] = useState<string[]>(generateMnemonic().split(' '));
  const validMnemonic = validateMnemonic(words.join(' '));
  const [advancedSettings, setAdvancedSettings] = useState<AdvancedSettings>({
    signersStorageEngine: canUseSecureStorage
      ? 'SECURESTORE'
      : Platform.OS === 'web'
        ? 'IDB'
        : 'MMKV',
    signersPassword: undefined,
    encryption: 'SEED_DERIVED',
    networkId: 'TAPE'
  });
  //If canUseSecureStorage is revoked:
  useEffect(() => {
    if (
      canUseSecureStorage === false &&
      advancedSettings.signersStorageEngine === 'SECURESTORE'
    ) {
      setAdvancedSettings({
        ...advancedSettings,
        signersStorageEngine: Platform.OS === 'web' ? 'IDB' : 'MMKV'
      });
    }
  }, [canUseSecureStorage, advancedSettings]);

  const [creatingWallet, setCreatingWallet] = useState<boolean>(false);
  const [iOSBiometricsDeclined, setIOSBiometricsDeclined] =
    useState<boolean>(false);

  const onAdvancedSettings = useCallback(
    (advancedSettings: AdvancedSettings) =>
      setAdvancedSettings(advancedSettings),
    []
  );

  const onWords = useCallback((words: string[]) => {
    if (validateMnemonic(words.join(' '))) Keyboard.dismiss();
    setWords(words);

    setWords(currentWords => {
      if (!shallowEqualArrays(currentWords, words)) return words;
      else return currentWords;
    });
  }, []);

  const switchNewImport = useCallback(() => {
    setWords(isImport ? generateMnemonic().split(' ') : Array(12).fill(''));
    setIsImport(!isImport);
  }, [isImport]);
  /**
   * import or create a new wallet
   */
  const addWallet = useCallback(
    async (
      words: string[],
      encryption: 'NONE' | 'SEED_DERIVED',
      signersPassword: string | undefined,
      signersStorageEngine: StorageEngine,
      networkId: NetworkId
    ) => {
      //In iOS the system lets the user encrypt and save data with biometrics
      //without requesting user access to biometrics.
      //iOS only requests bio access grants for reading. So it's better to ask
      //the user grants before creating the wallet. Otherwise the user
      //won't be able to access it if it does not grant biometrics acces when
      //accessing the wallet later.
      //In Android, the user is asked for biometrics access on write operations
      //too. Then it is not necessary to re-request it here (this would require
      //many fingerprint operations).
      //TLDR: user declining biometrics are handled:
      //  - Android: in WalletHomeScreen (See biometricsRequestNotAccepted)
      //  - iOS: in NewWalletScreen (see below)
      if (signersStorageEngine === 'SECURESTORE' && Platform.OS === 'ios') {
        const readWriteAccess = await checkReadWriteBiometricsAccessAsync(
          //This is the authenticatinPrompt. This in fact is only shown in fingerprint dialogs.
          //In iOS (for FaceID) you end up seeing only NSFaceIDUsageDescription.
          //
          //So, try to have a good message for NSFaceIDUsageDescription that works for both creating/reading wallets
          //On fingerprint-devices, users will see:
          t('app.secureStorageCreationAuthenticationPrompt')
        );
        if (readWriteAccess === false) {
          setIOSBiometricsDeclined(true);
          return; //Eary stop here!
        }
      }

      setCreatingWallet(true);
      //This await Promise below is important so that the state is set above
      //immediatelly without waiting for all the awaits below. For some reason
      //this is needed
      await new Promise(resolve => setTimeout(resolve, 0));

      const wallet: Wallet = {
        creationEpoch: Math.floor(Date.now() / 1000),
        walletId,
        version: defaultSettings.WALLETS_DATA_VERSION,
        networkId,
        signersEncryption: signersPassword ? 'PASSWORD' : 'NONE',
        signersStorageEngine,
        encryption
      };
      const signerId = 0; //RewindBitcoin v1.0 has Only 1 signer anyway
      const network = networkMapping[networkId];
      const mnemonic = words.join(' ');
      const masterNode = getMasterNode(mnemonic, network);
      const masterFingerprint = masterNode.fingerprint.toString('hex');
      const signersCipherKey = signersPassword
        ? await getPasswordDerivedCipherKey(signersPassword)
        : undefined;
      const signer: Signer = {
        masterFingerprint,
        type: 'SOFTWARE',
        mnemonic
      };
      await onWallet({
        wallet,
        ...(signersCipherKey ? { signersCipherKey } : {}),
        newSigners: {
          [signerId]: signer
        }
      });
      //if (navigation.canGoBack()) navigation.goBack();
      //navigation.navigate(WALLET_HOME, { walletId });
      navigation.replace('WALLET_HOME', { walletId });
    },
    [navigation, onWallet, walletId, t]
  );

  const hasAskedNonSecureSignersToSetPassword = useRef<boolean>(false);
  const onImport = useCallback(async () => {
    if (
      !canUseSecureStorage &&
      !advancedSettings.signersPassword &&
      hasAskedNonSecureSignersToSetPassword.current === false
    ) {
      hasAskedNonSecureSignersToSetPassword.current = true;
      setAskNonSecureSignersPassword(true);
    } else {
      await addWallet(
        words,
        advancedSettings.encryption,
        advancedSettings.signersPassword,
        advancedSettings.signersStorageEngine,
        advancedSettings.networkId
      );
    }
  }, [
    canUseSecureStorage,
    addWallet,
    words,
    advancedSettings.encryption,
    advancedSettings.signersPassword,
    advancedSettings.signersStorageEngine,
    advancedSettings.networkId
  ]);

  const onBip39ConfirmationIsRequested = useCallback(() => {
    setIsConfirmBip39(true);
    setIsHiddenBip39ConfModal(false);
  }, []);
  const onBip39Cancel = useCallback(() => {
    setIsConfirmBip39(false);
  }, []);
  //https://github.com/react-native-modal/react-native-modal?tab=readme-ov-file#i-cant-show-multiple-modals-one-after-another
  const onBip39ConfirmationModalHidden = useCallback(() => {
    setIsHiddenBip39ConfModal(true);
  }, []);
  const onBip39ConfirmedOrSkipped = useCallback(async () => {
    setIsConfirmBip39(false);
    if (
      !canUseSecureStorage &&
      !advancedSettings.signersPassword &&
      hasAskedNonSecureSignersToSetPassword.current === false
    ) {
      hasAskedNonSecureSignersToSetPassword.current = true;
      setAskNonSecureSignersPassword(true);
    } else {
      await addWallet(
        words,
        advancedSettings.encryption,
        advancedSettings.signersPassword,
        advancedSettings.signersStorageEngine,
        advancedSettings.networkId
      );
    }
  }, [
    canUseSecureStorage,
    addWallet,
    words,
    advancedSettings.encryption,
    advancedSettings.signersPassword,
    advancedSettings.signersStorageEngine,
    advancedSettings.networkId
  ]);

  const [askNonSecureSignersPassword, setAskNonSecureSignersPassword] =
    useState<boolean>(false);
  const onNonSecureSignerPasswordCancel = useCallback(() => {
    hasAskedNonSecureSignersToSetPassword.current = false;
    setAskNonSecureSignersPassword(false);
  }, []);
  const onNonSecureSignerContinueWithoutPassword = useCallback(async () => {
    setAskNonSecureSignersPassword(false);
    await addWallet(
      words,
      advancedSettings.encryption,
      undefined,
      advancedSettings.signersStorageEngine,
      advancedSettings.networkId
    );
  }, [
    addWallet,
    words,
    advancedSettings.encryption,
    advancedSettings.signersStorageEngine,
    advancedSettings.networkId
  ]);

  const onNonSecureSignerPassword = useCallback(
    async (password: string) => {
      setAskNonSecureSignersPassword(false);
      await addWallet(
        words,
        advancedSettings.encryption,
        password,
        advancedSettings.signersStorageEngine,
        advancedSettings.networkId
      );
    },
    [
      addWallet,
      words,
      advancedSettings.encryption,
      advancedSettings.signersStorageEngine,
      advancedSettings.networkId
    ]
  );

  const [networktHelp, showNetworkHelp] = useState<boolean>(false);
  return canUseSecureStorage === undefined ? (
    <View className="flex-1 justify-center">
      <ActivityIndicator size={'large'} />
    </View>
  ) : creatingWallet ? (
    <View className="flex-1 justify-center px-4">
      <ActivityIndicator size={'large'} />
      <Text className="mt-10 text-center text-xl">
        {t('wallet.creatingWallet')}
      </Text>
    </View>
  ) : (
    <>
      <KeyboardAwareScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          //flexGrow: 1,
          //justifyContent: 'center',
          paddingTop: 20,
          paddingBottom: 20 + insets.bottom,
          alignItems: 'center'
        }}
      >
        <View className="max-w-screen-sm p-4 gap-4">
          <Text className="native:text-base web:text-sm web:sm:text-base text-slate-600">
            {isImport
              ? t('bip39.importWalletSubText')
              : t('bip39.createWalletSubText')}
          </Text>
          <Pressable
            hitSlop={10}
            className="hover:opacity-40 active:opacity-40 self-start"
            onPress={switchNewImport}
          >
            <Text className="pb-2 text-primary native:text-base web:text-sm web:sm:text-base">
              {isImport ? t('bip39.chooseNew') : t('bip39.chooseImport')}
            </Text>
          </Pressable>
          <Bip39
            readonly={!isImport}
            hideWords={isConfirmBip39}
            words={words}
            onWords={onWords}
          />
          <View className="mt-4">
            <WalletAdvancedSettings
              canUseSecureStorage={canUseSecureStorage}
              advancedSettings={advancedSettings}
              onAdvancedSettings={onAdvancedSettings}
            />
          </View>
          <View className="mb-4 mt-4">
            <Button
              disabled={!validMnemonic}
              onPress={isImport ? onImport : onBip39ConfirmationIsRequested}
            >
              {advancedSettings.networkId === 'BITCOIN' && isImport
                ? t('wallet.importRealBtcButton')
                : advancedSettings.networkId !== 'BITCOIN' && isImport
                  ? t('wallet.importNonRealBtcButton')
                  : advancedSettings.networkId === 'BITCOIN' && !isImport
                    ? t('wallet.createRealBtcButton')
                    : t('wallet.createNonRealBtcButton')}
            </Button>
            <View className="flex-row flex-wrap justify-center mt-4">
              <Text
                className={`native:text-sm web:text-xs web:sm:text-sm text-slate-600`}
              >
                {advancedSettings.networkId === 'BITCOIN'
                  ? t('wallet.realWalletWarning')
                  : t('wallet.testingWalletInfo')}{' '}
              </Text>
              <Pressable
                className="active:opacity-60 hover:opacity-60"
                hitSlop={10}
                onPress={() => showNetworkHelp(true)}
              >
                <Text
                  className={`native:text-sm web:text-xs web:sm:text-sm text-primary`}
                >
                  {t('learnMore')}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
        <ConfirmBip39
          isVisible={isConfirmBip39}
          network={networkMapping[advancedSettings.networkId]}
          words={words}
          onConfirmedOrSkipped={onBip39ConfirmedOrSkipped}
          onCancel={onBip39Cancel}
          onModalHide={onBip39ConfirmationModalHidden}
        />
      </KeyboardAwareScrollView>
      <Modal
        title={t('network.testOrRealTitle')}
        icon={{
          family: 'FontAwesome5',
          name: 'bitcoin'
        }}
        isVisible={networktHelp}
        onClose={() => showNetworkHelp(false)}
        closeButtonText={t('understoodButton')}
      >
        <Text className="text-base px-2">{t('help.network')}</Text>
      </Modal>
      <Modal
        title={t('wallet.biometricsErrorTitle')}
        icon={{ family: 'MaterialIcons', name: 'error' }}
        isVisible={isHiddenBip39ConfModal && iOSBiometricsDeclined}
        onClose={() => {
          setIOSBiometricsDeclined(false);
        }}
        closeButtonText={t('understoodButton')}
      >
        <Text className="text-base px-2">
          {t('wallet.new.biometricsRequestDeclined') +
            '\n\n' +
            (canUseSecureStorage
              ? t('wallet.new.biometricsHowDisable')
              : Platform.OS === 'ios'
                ? t('wallet.new.biometricsCurrentlyDisabledIOS')
                : t('wallet.new.biometricsCurrentlyDisabledNonIOS'))}
        </Text>
      </Modal>
      <Password
        mode="OPTIONAL_SET"
        isVisible={askNonSecureSignersPassword && isHiddenBip39ConfModal}
        onPassword={onNonSecureSignerPassword}
        onContinueWithoutPassword={onNonSecureSignerContinueWithoutPassword}
        onCancel={onNonSecureSignerPasswordCancel}
      />
    </>
  );
}
