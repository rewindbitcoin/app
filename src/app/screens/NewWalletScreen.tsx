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
          <Text className="text-xl font-semibold">
            {t(isImport ? 'bip39.importWalletText' : 'bip39.createWalletText')}
          </Text>
          <Text>
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
            <Text className="pb-2 text-primary">
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
          <View className="mt-4 mb-4">
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
