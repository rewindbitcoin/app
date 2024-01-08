import React, { useRef, useState, useEffect } from 'react';
import {
  StyleSheet,
  TextInput,
  View,
  Text,
  NativeSyntheticEvent,
  TextInputKeyPressEventData,
  Pressable,
  Platform
} from 'react-native';
import {
  useFonts,
  RobotoMono_400Regular
} from '@expo-google-fonts/roboto-mono';
import { useToast } from '../../common/components/Toast';
import { useTheme, Theme } from '@react-navigation/native';
import memoize from 'lodash.memoize';
import { wordlists } from 'bip39';
import SegmentedControl from '@react-native-segmented-control/segmented-control';

const englishWordList = wordlists['english'];
if (!englishWordList) throw new Error('Cannot load english wordlists');
const MAX_LENGTH = 8; //English wordlist max length = 8
const ZERO_WIDTH_SPACE = '\u200B';
const cleanWord = (word: string) => word.replace(/[^a-z]/gi, '');
const isPartialWordValid = memoize((partialWord: string) => {
  const clean = cleanWord(partialWord);
  return (
    clean.length === 0 ||
    englishWordList.some((word: string) => word.startsWith(clean))
  );
});

import { validateMnemonic as validateMnemonicOriginal } from 'bip39';
const validateMnemonic = memoize(validateMnemonicOriginal);

import { useTranslation } from 'react-i18next';

const wordCandidates = (clean: string) => {
  return englishWordList.filter(word => word.startsWith(clean));
};

export default function Bip39({
  words,
  onWords,
  wordsLength,
  onWordsLength
}: {
  words: string[];
  onWords: (words: string[]) => void;
  wordsLength: 12 | 24;
  onWordsLength: (wordsLength: 12 | 24) => void;
}) {
  const { t } = useTranslation();
  const styles = getStyles(useTheme(), useFonts({ RobotoMono_400Regular }));

  const inputRef = useRef<TextInput>(null);

  const [text, setText] = useState(ZERO_WIDTH_SPACE);

  useEffect(() => inputRef.current?.focus(), []);

  const toast = useToast();
  const toastId = useRef<string>();

  //const prevWordsTypeRef = useRef<12 | 24>(12);

  useEffect(() => {
    if (words.length < wordsLength) hideError();
    inputRef.current?.focus();
    //prevWordsTypeRef.current = wordsLength;
    //if (words.length === wordsLength && !validateMnemonic(words.join(' '))) {
    //  onWords(words.slice(0, wordsLength - 1));
    //  const lastWord = words[words.length - 1];
    //  if (lastWord) handleChangeText(lastWord);
    //}
  }, [words, wordsLength]);

  //Rapid input in textinput may batch several setState in onWords
  //Try to detect if already set
  const alreadyHandled = (clean: string) => {
    const prevClean = clean.slice(0, -1);
    if (!englishWordList) throw new Error('Cannot load english wordlists');
    if (words.length < wordsLength && wordCandidates(prevClean).length === 1)
      return true;
    else return false;
  };

  const showError = () => {
    if (toastId.current !== undefined && toast.isOpen(toastId.current))
      toast.update(toastId.current, t('bip39.invalidErrorMessage'), {
        type: 'danger'
      });
    else {
      toastId.current = toast.show(t('bip39.invalidErrorMessage'), {
        type: 'danger'
      });
    }
  };
  const hideError = () =>
    toastId.current !== undefined &&
    toast.isOpen(toastId.current) &&
    toast.hide(toastId.current);

  /** analizes the text on TextInput, and adds a new word (returning true) or
   * returns false */
  const processText = (text: string) => {
    const clean = cleanWord(text);
    if (!englishWordList) throw new Error('Cannot load english wordlists');
    const wc = wordCandidates(clean);
    if (wc.length > 1) hideError();
    if (words.length < wordsLength && wc.length === 1) {
      const clean = wc[0];
      if (clean === undefined) throw new Error('Array error');
      const newWordList = [...words, clean];
      if (
        newWordList.length < wordsLength ||
        validateMnemonic(newWordList.join(' '))
      ) {
        setText(ZERO_WIDTH_SPACE);
        if (!alreadyHandled(cleanWord(text))) onWords(newWordList);
        return true;
      } else {
        showError();
        return false;
      }
    } else {
      return false;
    }
  };
  const handleChangeText = (newText: string) => {
    if (newText.length === 0) {
      //newText.length is zero -> deleted
      setText(ZERO_WIDTH_SPACE);
      onWords(words.slice(0, -1));
    } else if (newText === ZERO_WIDTH_SPACE) {
      setText(ZERO_WIDTH_SPACE);
    } else {
      if (!processText(newText)) setText(ZERO_WIDTH_SPACE + cleanWord(newText));
    }
  };
  const onKeyPress = (
    event: NativeSyntheticEvent<TextInputKeyPressEventData>
  ) => {
    if (event.nativeEvent.key === 'Enter') {
      processText(text);
    }
  };
  const onEndEditing = () => processText(text);
  const onSubmitEditing = () => processText(text);

  const promptForMoreWords =
    !(words.length === wordsLength) || !validateMnemonic(words.join(' '));

  return (
    <>
      <View style={styles.mnemonicLength}>
        <SegmentedControl
          style={styles.segmented}
          values={[t('bip39.segmented12'), t('bip39.segmented24')]}
          selectedIndex={wordsLength === 12 ? 0 : 1}
          onChange={event => {
            const index = event.nativeEvent.selectedSegmentIndex;
            onWordsLength(index === 0 ? 12 : 24);
          }}
        />
      </View>
      {promptForMoreWords && (
        <Text style={styles.enterMnemonicText}>
          {t('bip39.enterMnemonicText', { wordNumber: words.length + 1 })}
        </Text>
      )}
      <View style={styles.words}>
        {words.map((word, index) => (
          <Pressable
            key={index}
            onPress={() => {
              onWords(words.slice(0, index));
              setText(ZERO_WIDTH_SPACE);
              //inputRef.current?.focus();
            }}
            style={({ pressed }) => [
              styles.textContainer,
              pressed && styles.textContainerPressed
            ]}
          >
            {({ pressed }) => (
              <View
                style={{
                  flexDirection: 'row'
                }}
              >
                <Text numberOfLines={1} style={styles.number}>
                  {
                    `${index + 1 < 10 ? '\u00A0' : ''}${index + 1}`
                    //\u00A0 is a space character, needed for Web platform to show it
                  }
                </Text>
                <Text
                  numberOfLines={1}
                  style={[styles.text, pressed && styles.textPressed]}
                >
                  {`${word}`}
                </Text>
              </View>
            )}
          </Pressable>
        ))}

        {promptForMoreWords && (
          <View style={styles.indexAndInput}>
            <Text style={[styles.number]}>
              {`${words.length + 1 < 10 ? '\u00A0' : ''}${words.length + 1}`}
            </Text>
            <TextInput
              autoFocus
              keyboardType="visible-password"
              blurOnSubmit={false}
              value={text}
              style={[styles.input, !isPartialWordValid(text) && styles.error]}
              ref={inputRef}
              spellCheck={false}
              maxLength={MAX_LENGTH + 1}
              autoComplete={'off'}
              autoCorrect={false}
              autoCapitalize="none"
              onChangeText={handleChangeText}
              onKeyPress={onKeyPress}
              onEndEditing={onEndEditing}
              onSubmitEditing={onSubmitEditing}
            />
          </View>
        )}
      </View>
    </>
  );
}
const getStyles = (theme: Theme, fonts: ReturnType<typeof useFonts>) => {
  const [fontsLoaded] = fonts;
  return StyleSheet.create({
    segmented: {
      height: 50,
      //SegmentedControl for iOS has a bug setting backgroundColor.
      //#eeeeed will set #dfdfdf. Found by experimenting with a Color Picker tool
      //https://github.com/react-native-segmented-control/segmented-control/issues/127
      backgroundColor: Platform.select({ ios: '#eeeeed', default: '#dfdfdf' })
    },
    mnemonicLength: { marginBottom: 30, width: 330 },
    mnemonicTypeText: { marginBottom: 10 },
    enterMnemonicText: {
      marginBottom: 20,
      textAlign: 'left',
      width: 330,
      fontWeight: 'bold',
      fontSize: 16
    },
    words: {
      borderRadius: 5,
      backgroundColor: '#dfdfdf',
      paddingVertical: 10,
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'flex-start',
      width: 330,
      margin: 0,
      paddingHorizontal: 10,
      borderWidth: 0
    },
    indexAndInput: {
      flexDirection: 'row', // Aligns children horizontally
      fontSize: 14,
      width: '33%'
    },
    input: {
      ...Platform.select({
        //clean style for web browsers
        web: {
          outlineStyle: 'none'
        }
      }),
      borderWidth: 0,
      paddingLeft: 5,
      borderRadius: 5,
      backgroundColor: theme.colors.background,
      width: 70,
      ...(fontsLoaded ? { fontFamily: 'RobotoMono_400Regular' } : {})
    },
    error: {
      color: theme.colors.notification
    },
    text: {
      paddingVertical: 10,
      paddingRight: 10,
      paddingLeft: 5,
      ...(fontsLoaded ? { fontFamily: 'RobotoMono_400Regular' } : {})
    },
    number: {
      paddingVertical: 10,
      color: theme.colors.primary,
      paddingRight: 5,
      ...(fontsLoaded ? { fontFamily: 'RobotoMono_400Regular' } : {})
    },
    textContainer: {
      width: '33%'
    },
    textContainerPressed: {
      backgroundColor: '#ccc'
    },
    textPressed: {
      //color: 'darkblue'
    }
  });
};
