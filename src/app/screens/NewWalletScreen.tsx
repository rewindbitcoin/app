//TODO: Note that an import may be also needed when the signers data has been
//removed since it may have been stored in SecureStore which can be deleted
//at times. For example when restoring from a backup or when changing the fingerprints
//or faceId of the device
import React, { useCallback, useState } from 'react';
import { View, Text, Pressable, Keyboard, Platform } from 'react-native';
import {
  Button,
  ActivityIndicator,
  KeyboardAwareScrollView
} from '../../common/ui';
import { useTranslation } from 'react-i18next';
import Bip39, { validateMnemonic } from '../components/Bip39';
import ConfirmBip39 from '../components/ConfirmBip39';
import WalletAdvancedSettings, {
  type AdvancedSettings
} from '../components/WalletAdvancedSettings';
import { useSecureStorageAvailability } from '../../common/contexts/SecureStorageAvailabilityContext';
//import { AntDesign } from '@expo/vector-icons';
//import { cssInterop } from 'nativewind';
//cssInterop(AntDesign, {
//  className: {
//    target: 'style',
//    nativeStyleToProp: { color: true, fontSize: 'size' }
//  }
//});
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { generateMnemonic } from 'bip39';

export default function NewWalletScreen() {
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
  }, []);

  const switchNewImport = useCallback(() => {
    setWords(isImport ? generateMnemonic().split(' ') : Array(12).fill(''));
    setIsImport(!isImport);
  }, [isImport]);

  const onBip39ConfirmationIsRequested = useCallback(() => {
    setIsConfirmBip39(true);
  }, []);
  const onBip39Confirmed = useCallback(() => {
    setIsConfirmBip39(false);
  }, []);
  const onBip39Cancel = useCallback(() => {
    setIsConfirmBip39(false);
  }, []);

  return (
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
          {/*<Text className="text-xl font-semibold">
            {t(isImport ? 'bip39.importWalletText' : 'bip39.createWalletText')}
          </Text>*/}
          <Text className="text-base web:text-sm web:sm:text-base">
            {t(
              isImport
                ? 'bip39.importWalletSubText'
                : 'bip39.createWalletSubText'
            )}
          </Text>
          <Pressable
            className="hover:opacity-40 active:opacity-40 self-start"
            onPress={switchNewImport}
          >
            <Text className="pb-2 text-primary text-base web:text-sm web:sm:text-base">
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
          <View className="bg-primary/10 rounded-full p-4 mt-4 flex-row justify-center">
            <Text className="text-primary-dark text-sm web:text-xs web:sm:text-sm">
              {advancedSettings.networkId === 'BITCOIN'
                ? t('wallet.realWalletWarning')
                : t('wallet.testingWalletInfo')}
            </Text>
            <Pressable className="active:opacity-60 hover:opacity-60">
              <Text className="text-primary-dark text-sm font-semibold pl-1 web:text-xs web:sm:text-sm">
                {t('learnMore') + ' ➔'}
              </Text>
            </Pressable>
          </View>
          {/*<View className="bg-backgroundDefault shadow rounded-xl flex-row p-4 justify-center">
            <Text className="text-slate-600 text-xs font-semibold">
              {advancedSettings.networkId === 'BITCOIN'
                ? t('wallet.realWalletWarning')
                : t('wallet.testingWalletInfo')}
            </Text>
            <Text className="text-primary text-xs font-semibold flex-row">
              {' ' + t('learnMore')}
            </Text>
          </View>*/}
          <View className="mb-4">
            <Button
              disabled={!validMnemonic}
              onPress={onBip39ConfirmationIsRequested}
            >
              {t('wallet.importButton')}
            </Button>
          </View>
        </View>
      )}
      {isConfirmBip39 && (
        <ConfirmBip39
          words={words}
          onConfirmed={onBip39Confirmed}
          onCancel={onBip39Cancel}
        />
      )}
    </KeyboardAwareScrollView>
  );
}
