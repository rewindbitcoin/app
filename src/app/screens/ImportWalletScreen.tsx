//TODO: Note that an import may be also needed when the signers data has been
//removed since it may have been stored in SecureStore which can be deleted
//at times. For example when restoring from a backup or when changing the fingerprints
//or faceId of the device
import React, { useEffect, useState } from 'react';
import { Button, View, Text } from 'react-native';
import { KeyboardAwareScrollView } from '../../common/components/KeyboardAwareScrollView';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import Bip39, { validateMnemonic } from '../components/Bip39';

export default () => {
  const navigation = useNavigation();
  const { t } = useTranslation();
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
      <Text
        style={{
          fontWeight: 'bold',
          fontSize: 24,
          marginBottom: 20,
          textAlign: 'center'
        }}
      >
        {t('bip39.importWalletText')}
      </Text>
      <Text style={{ width: 330, marginBottom: 20 }}>
        {t('bip39.importWalletSubText')}
      </Text>
      <Bip39 words={words} onWords={(words: string[]) => setWords(words)} />
      <View style={{ marginTop: 50 }}>
        <Button title={t('cancelButton')} onPress={navigation.goBack} />
      </View>
    </KeyboardAwareScrollView>
  );
};
