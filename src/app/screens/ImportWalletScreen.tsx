//TODO: Note that an import may be also needed when the signers data has been
//removed since it may have been stored in SecureStore which can be deleted
//at times. For example when restoring from a backup or when changing the fingerprints
//or faceId of the device
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import {
  Button,
  Text,
  ActivityIndicator,
  KeyboardAwareScrollView
} from '../../common/ui';
import { useTranslation } from 'react-i18next';
import Bip39, { validateMnemonic } from '../components/Bip39';
import WalletAdvancedSettings from '../components/WalletAdvancedSettings';
import { useSecureStorageAvailability } from '../../common/contexts/SecureStorageAvailabilityContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function ImportWalletScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const canUseSecureStorage = useSecureStorageAvailability();
  const [words, setWords] = useState<string[]>(Array(12).fill(''));
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
        <View style={{ maxWidth: 500, marginHorizontal: 20 }}>
          <Text variant="headlineSmall">{t('bip39.importWalletText')}</Text>
          <Text style={{ marginVertical: 20 }}>
            {t('bip39.importWalletSubText')}
          </Text>
          <Bip39 words={words} onWords={(words: string[]) => setWords(words)} />
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
