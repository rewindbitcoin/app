//TODO: Note that an import may be also needed when the signers data has been
//removed since it may have been stored in SecureStore which can be deleted
//at times. For example when restoring from a backup or when changing the fingerprints
//or faceId of the device
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Button, Text, ActivityIndicator } from '../../common/components/ui';
import { KeyboardAwareScrollView } from '../../common/components/KeyboardAwareScrollView';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import Bip39, { validateMnemonic } from '../components/Bip39';
import { useSecureStorageAvailability } from '../../common/contexts/SecureStorageAvailabilityContext';

export default () => {
  const navigation = useNavigation();
  const { t } = useTranslation();
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
        flexGrow: 1,
        justifyContent: 'center',
        alignItems: 'center'
      }}
    >
      {canUseSecureStorage === undefined ? (
        <ActivityIndicator />
      ) : (
        <View style={{ width: 330 }}>
          <Text variant="headlineSmall">{t('bip39.importWalletText')}</Text>
          <Text style={{ marginVertical: 20 }}>
            {t('bip39.importWalletSubText')}
          </Text>
          <Bip39 words={words} onWords={(words: string[]) => setWords(words)} />
          <View style={{ marginTop: 50 }}>
            <Button onPress={navigation.goBack}>{t('cancelButton')}</Button>
          </View>
        </View>
      )}
    </KeyboardAwareScrollView>
  );
};
