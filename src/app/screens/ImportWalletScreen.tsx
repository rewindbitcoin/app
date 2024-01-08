import React, { useState } from 'react';
import { ScrollView, Button, View, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import type { Toast } from '../../common/components/Toast';
import Bip39 from '../components/Bip39';

import memoize from 'lodash.memoize';
import { validateMnemonic as validateMnemonicOriginal } from 'bip39';
const validateMnemonic = memoize(validateMnemonicOriginal);

export default ({ toastRef }: { toastRef: React.RefObject<Toast> }) => {
  const navigation = useNavigation();
  const { t } = useTranslation();
  const [words, setWords] = useState<string[]>([]);
  const [wordsLength, setWordsLength] = useState<12 | 24>(12);

  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{
        flexGrow: 1, //grow vertically to 100% and center child
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
      <Bip39
        toastRef={toastRef}
        words={words}
        onWords={(words: string[]) => setWords(words)}
        wordsLength={wordsLength}
        onWordsLength={(wordsLength: 12 | 24) => {
          setWordsLength(wordsLength);
          setWords(words => {
            // Trim the words array to the maximum length of wordsLength (12 or 24)
            const trimmedWords = words.slice(0, wordsLength);
            if (trimmedWords.length === wordsLength) {
              if (validateMnemonic(words.join(' '))) {
                return trimmedWords;
              } else {
                //Going from 24->12 words, only set 11 words if the 12th word was
                //invalid
                return trimmedWords.slice(0, wordsLength - 1);
              }
            } else return trimmedWords;
          });
        }}
      />
      {validateMnemonic(words.join(' ')) && <Text>NOW TRIGGER</Text>}
      <View style={{ marginTop: 50 }}>
        <Button title={t('cancelButton')} onPress={navigation.goBack} />
      </View>
    </ScrollView>
  );
};
