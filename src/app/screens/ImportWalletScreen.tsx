import React, { useState } from 'react';
import { Button, View, Text } from 'react-native';
import { KeyboardAwareScrollView } from '../../common/components/KeyboardAwareScrollView';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import Bip39, { validateMnemonic } from '../components/Bip39';

export default () => {
  const navigation = useNavigation();
  const { t } = useTranslation();
  const [words, setWords] = useState<string[]>([
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    ''
  ]);

  return (
    <KeyboardAwareScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{
        //backgroundColor: 'red',
        flexGrow: 1, //grow vertically to 100% and center child
        justifyContent: 'center',
        //paddingTop: 500
        //paddingTop: 400,
        //marginTop: 300,
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
      {validateMnemonic(words.join(' ')) && <Text>NOW TRIGGER</Text>}
      <View style={{ marginTop: 50 }}>
        <Button title={t('cancelButton')} onPress={navigation.goBack} />
      </View>
    </KeyboardAwareScrollView>
  );
};
