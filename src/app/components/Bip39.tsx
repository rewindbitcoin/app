import React, { useEffect } from 'react';
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
import { Toast } from '../../common/components/Toast';
import { useTheme } from '@react-navigation/native';
import memoize from 'lodash.memoize';
import { wordlists } from 'bip39';
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

export default function WordListComponent({
  wordList,
  onWordList
}: {
  wordList: string[];
  onWordList: (wordList: string[]) => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const numberColor = colors.primary;

  const inputRef = React.useRef<TextInput>(null);
  const [fontsLoaded] = useFonts({ RobotoMono_400Regular });

  const [text, setText] = React.useState(ZERO_WIDTH_SPACE);

  useEffect(() => inputRef.current?.focus(), []);

  useEffect(() => {
    console.log({
      wordList,
      validation: validateMnemonic(wordList.join(' ')),
      length: wordList.length
    });
    if (wordList.length !== 12 && wordList.length < 24) Toast.hide();
    if (!validateMnemonic(wordList.join(' ')) && wordList.length === 12) {
      console.log('Toast show');
      Toast.show({
        autoHide: false,
        type: 'info',
        text1: t('bip39.invalidTitle'),
        text2: t('bip39.invalid12Words')
      });
    }
  }, [wordList]);

  //Rapid input in textinput may batch several setState in onWordList
  //Try to detect if already set
  const alreadyHandled = (clean: string) => {
    const prevClean = clean.slice(0, -1);
    if (!englishWordList) throw new Error('Cannot load english wordlists');
    const wordCandidates =
      prevClean.length > 1 //With 2 letters you can find a word. F.ex.: yard
        ? englishWordList.filter(word => word.startsWith(prevClean))
        : [];
    console.log({ prevClean, length: wordCandidates.length });
    if (wordList.length < 24 && wordCandidates.length === 1) return true;
    else return false;
  };

  /** analizes the text on TextInput, and adds a new word (returning true) or
   * returns false */
  const processText = (text: string) => {
    const clean = cleanWord(text);
    if (!englishWordList) throw new Error('Cannot load english wordlists');
    const wordCandidates =
      clean.length > 1 //With 2 letters you can find a word. F.ex.: yard
        ? englishWordList.filter(word => word.startsWith(clean))
        : [];
    if (wordList.length < 24 && wordCandidates.length === 1) {
      const clean = wordCandidates[0];
      if (clean === undefined) throw new Error('Array error');
      const newWordList = [...wordList, clean];
      if (newWordList.length < 24 || validateMnemonic(newWordList.join(' '))) {
        setText(ZERO_WIDTH_SPACE);
        if (!alreadyHandled(cleanWord(text))) onWordList(newWordList);
        return true;
      } else {
        Toast.show({
          autoHide: false,
          type: 'error',
          text1: t('bip39.invalidTitle'),
          text2: t('bip39.invalid24Words')
        });
        return false;
      }
    } else {
      Toast.hide();
      return false;
    }
  };
  const handleChangeText = (newText: string) => {
    if (newText.length === 0) {
      //newText.length is zero -> deleted
      setText(ZERO_WIDTH_SPACE);
      onWordList(wordList.slice(0, -1));
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
  //const onBlur = () => {
  //  processText();
  //  inputRef.current?.focus();
  //};
  const onSubmitEditing = () => processText(text);

  return (
    <>
      <View style={styles.view}>
        {wordList.map((word, index) => (
          <Pressable
            key={index}
            onPress={() => {
              onWordList(wordList.slice(0, index));
              setText(ZERO_WIDTH_SPACE);
              //inputRef.current?.focus();
            }}
            style={({ pressed }) => [
              {
                backgroundColor: pressed ? 'lightgray' : 'transparent'
              },
              styles.textContainer
            ]}
          >
            {({ pressed }) => (
              <View
                style={{
                  flexDirection: 'row'
                }}
              >
                <Text
                  numberOfLines={1}
                  style={[
                    styles.text,
                    {
                      color: numberColor,
                      paddingRight: 5
                    },
                    pressed ? styles.textPressed : {},
                    fontsLoaded ? { fontFamily: 'RobotoMono_400Regular' } : {}
                  ]}
                >
                  {
                    `${index + 1 < 10 ? '\u00A0' : ''}${index + 1}`
                    //\u00A0 is a space character, needed for Web platform to show it
                  }
                </Text>
                <Text
                  numberOfLines={1}
                  style={[
                    styles.text,
                    {
                      paddingRight: 10,
                      paddingLeft: 5
                    },
                    pressed ? styles.textPressed : {},
                    fontsLoaded ? { fontFamily: 'RobotoMono_400Regular' } : {}
                  ]}
                >
                  {`${word}`}
                </Text>
              </View>
            )}
          </Pressable>
        ))}

        <View style={styles.indexAndInput}>
          <Text
            style={[
              styles.text,
              {
                paddingRight: 5,
                color: numberColor
              },
              fontsLoaded ? { fontFamily: 'RobotoMono_400Regular' } : {}
            ]}
          >
            {`${wordList.length + 1 < 10 ? '\u00A0' : ''}${
              wordList.length + 1
            }`}
          </Text>
          <TextInput
            autoFocus
            keyboardType="visible-password"
            blurOnSubmit={false}
            value={text}
            style={[
              styles.input,
              isPartialWordValid(text) ? {} : { backgroundColor: '#FFCCCC' },
              fontsLoaded ? { fontFamily: 'RobotoMono_400Regular' } : {}
            ]}
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
      </View>
    </>
  );
}
const styles = StyleSheet.create({
  view: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    width: 330,
    margin: 0,
    padding: 0,
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
    backgroundColor: 'lightgray', // Set the border color
    width: 70
  },
  text: {
    //backgroundColor: 'yellow',
    //lineHeight: 20,
    //height: 20 + 10 + 2,
    paddingVertical: 10 //5 + 1 (TextInput border)
  },
  textContainer: {
    // Additional styling for Pressable container
    //padding: 5,
    //margin: 2,
    //borderRadius: 4,
    width: '33%'
  },
  textPressed: {
    // Style for text when Pressable is pressed
    color: 'darkblue'
    //textDecorationLine: 'underline'
  }
});
