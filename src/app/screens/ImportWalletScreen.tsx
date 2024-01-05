import React, { useState } from 'react';
import { ScrollView, Button } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import Bip39 from '../components/Bip39';
import { CustomToast } from '../../common/components/Toast';

import memoize from 'lodash.memoize';
import { validateMnemonic as validateMnemonicOriginal } from 'bip39';
const validateMnemonic = memoize(validateMnemonicOriginal);

export default () => {
  const navigation = useNavigation();
  const { t } = useTranslation();
  const [wordList, setWordList] = useState<string[]>([]);

  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{
        flexGrow: 1, //grow vertically to 100% and center child
        justifyContent: 'center',

        alignItems: 'center'
      }}
    >
      <Bip39
        wordList={wordList}
        onWordList={(wordList: string[]) => setWordList(wordList)}
      />
      {validateMnemonic(wordList.join(' ')) && (
        <Button
          title={t('bip39.importWalletButton')}
          onPress={() => console.log('TODO action and TODO translate title')}
        />
      )}
      <Button title={t('cancelButton')} onPress={navigation.goBack} />
      <CustomToast />
    </ScrollView>
  );
};
