//TODO: Note that an import may be also needed when the signers data has been
//removed since it may have been stored in SecureStore which can be deleted
//at times. For example when restoring from a backup or when changing the fingerprints
//or faceId of the device
import React, { useCallback, useContext, useRef, useState } from 'react';
import { defaultSettings } from '../lib/settings';
import type { Wallet } from '../lib/wallets';
import { View, Text, Pressable, Keyboard, Platform } from 'react-native';
import type { Engine as StorageEngine } from '../../common/lib/storage';
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
import { useSecureStorageAvailability } from '../../common/contexts/SecureStorageAvailabilityContext';
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
import { WALLET_HOME, type RootStackParamList } from '../screens';
import {
  WalletContext,
  type WalletContextType
} from '../contexts/WalletContext';
import { shallowEqualArrays } from 'shallow-equal';

export default function NewWalletScreen() {
  const context = useContext<WalletContextType | null>(WalletContext);
  const onWallet = context?.onWallet;
  if (!onWallet) throw new Error(`onWallet not set yet`);

  const route = useRoute<RouteProp<RootStackParamList, 'NEW_WALLET'>>();
  const navigation = useNavigation();
  const walletId = route.params?.walletId;
  if (walletId === undefined)
    throw new Error(`Wallets should have been loaded`);
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const canUseSecureStorage = useSecureStorageAvailability();
  if (canUseSecureStorage === undefined)
    throw new Error('Could not retrieve Secure Storage availability');
  const [isImport, setIsImport] = useState<boolean>(false);
  const [isConfirmBip39, setIsConfirmBip39] = useState<boolean>(false);
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
    networkId: 'STORM'
  });

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
      const wallet: Wallet = {
        creationEpoch: Math.floor(Date.now() / 1000),
        walletId,
        version: defaultSettings.WALLETS_DATA_VERSION,
        networkId,
        signersEncryption: signersPassword ? 'PASSWORD' : 'NONE',
        signersStorageEngine,
        encryption
      };
      const signerId = 0; //ThunderDen v1.0 has Only 1 signer anyway
      const network = networkMapping[networkId];
      const mnemonic = words.join(' ');
      const masterNode = getMasterNode(mnemonic, network);
      const masterFingerprint = masterNode.fingerprint.toString('hex');
      const signersCipherKey = signersPassword
        ? await getPasswordDerivedCipherKey(signersPassword)
        : undefined;
      await onWallet({
        wallet,
        ...(signersCipherKey ? { signersCipherKey } : {}),
        newSigners: {
          [signerId]: {
            masterFingerprint,
            type: 'SOFTWARE',
            mnemonic
          }
        }
      });
      navigation.goBack();
      navigation.navigate(WALLET_HOME);
    },
    [navigation, onWallet, walletId]
  );

  const hasAskedNonSecureSignersToSetPassword = useRef<boolean>(false);
  const onCreateNew = useCallback(async () => {
    if (
      !canUseSecureStorage &&
      !advancedSettings.signersPassword &&
      hasAskedNonSecureSignersToSetPassword.current === false
    ) {
      hasAskedNonSecureSignersToSetPassword.current = true;
      setAskNonSecureSignersPassword(true);
    } else {
      addWallet(
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
  }, []);
  const onBip39Cancel = useCallback(() => {
    setIsConfirmBip39(false);
  }, []);
  const onBip39Confirmed = useCallback(() => {
    setIsConfirmBip39(false);
    if (
      !canUseSecureStorage &&
      !advancedSettings.signersPassword &&
      hasAskedNonSecureSignersToSetPassword.current === false
    ) {
      hasAskedNonSecureSignersToSetPassword.current = true;
      setAskNonSecureSignersPassword(true);
    } else {
      addWallet(
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
  const onNonSecureSignerContinueWithoutPassword = useCallback(() => {
    setAskNonSecureSignersPassword(false);
    addWallet(
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
    (password: string) => {
      setAskNonSecureSignersPassword(false);
      addWallet(
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
  return (
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
        {canUseSecureStorage === undefined ? (
          <ActivityIndicator />
        ) : (
          <View className="max-w-lg p-4 gap-4">
            <Text className="native:text-base web:text-sm web:sm:text-base">
              {t(
                isImport
                  ? 'bip39.importWalletSubText'
                  : 'bip39.createWalletSubText'
              )}
            </Text>
            <Pressable
              className="hover:opacity-40 active:opacity-40 self-start p-2 -m-2"
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
                onPress={
                  isImport ? onCreateNew : onBip39ConfirmationIsRequested
                }
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
                    : t('wallet.testingWalletInfo')}
                </Text>
                <Pressable
                  className="active:opacity-60 hover:opacity-60"
                  onPress={() => showNetworkHelp(true)}
                >
                  <Text
                    className={`native:text-sm pl-1 web:text-xs web:sm:text-sm text-primary`}
                  >
                    {t('learnMore')}
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        )}
        {isConfirmBip39 && (
          <ConfirmBip39
            network={networkMapping[advancedSettings.networkId]}
            words={words}
            onConfirmed={onBip39Confirmed}
            onCancel={onBip39Cancel}
          />
        )}
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
        <Text className="pl-2 pr-2">{t('help.network')}</Text>
      </Modal>
      <Password
        mode="OPTIONAL_SET"
        isVisible={askNonSecureSignersPassword}
        onPassword={onNonSecureSignerPassword}
        onContinueWithoutPassword={onNonSecureSignerContinueWithoutPassword}
        onCancel={onNonSecureSignerPasswordCancel}
      />
    </>
  );
}
