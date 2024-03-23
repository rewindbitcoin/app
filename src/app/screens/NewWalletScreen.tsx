//TODO: Note that an import may be also needed when the signers data has been
//removed since it may have been stored in SecureStore which can be deleted
//at times. For example when restoring from a backup or when changing the fingerprints
//or faceId of the device
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import {
  Button,
  ActivityIndicator,
  KeyboardAwareScrollView
} from '../../common/ui';
import { useTranslation } from 'react-i18next';
import Bip39, { validateMnemonic } from '../components/Bip39';
import WalletAdvancedSettings from '../components/WalletAdvancedSettings';
import { useSecureStorageAvailability } from '../../common/contexts/SecureStorageAvailabilityContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { generateMnemonic } from 'bip39';

export default function NewWalletScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const canUseSecureStorage = useSecureStorageAvailability();
  const [isImport, setIsImport] = useState<boolean>(false);
  //const [words, setWords] = useState<string[]>(Array(12).fill(''));
  const [words, setWords] = useState<string[]>(generateMnemonic().split(' '));
  const stringifiedWords = words.join(' ');

  useEffect(() => {
    if (validateMnemonic(stringifiedWords)) {
      console.log('VALID MNEMONIC');
      //onWallet(wallet, [
      //  {
      //    type: 'SOFTWARE',
      //    mnemonic: stringifiedWords
      //  }
      //]);
    }
  }, [stringifiedWords]);

  const switchNewImport = useCallback(() => {
    setWords(isImport ? generateMnemonic().split(' ') : Array(12).fill(''));
    setIsImport(!isImport);
  }, [isImport]);

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
            className="hover:opacity-40 active:opacity-40"
            onPress={switchNewImport}
          >
            <Text className="pb-2 text-primary">
              {isImport ? t('bip39.chooseNew') : t('bip39.chooseImport')}
            </Text>
          </Pressable>
          <Bip39
            readonly={!isImport}
            words={words}
            onWords={(words: string[]) => setWords(words)}
          />
          <WalletAdvancedSettings style={{ marginTop: 20 }} />
          <View style={{ marginVertical: 20 }}>
            <Button
              disabled={!validateMnemonic(stringifiedWords)}
              onPress={() => console.log('Import')}
            >
              {t('wallet.importButton')}
            </Button>
          </View>
        </View>
      )}
    </KeyboardAwareScrollView>
  );
}
