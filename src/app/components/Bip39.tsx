import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, TextInput, View, Text, Platform } from 'react-native';

import { LayoutAnimation } from 'react-native';
import {
  useFonts,
  RobotoMono_400Regular
} from '@expo-google-fonts/roboto-mono';
import { useToast } from '../../common/components/Toast';
import { useTheme, Theme } from '@react-navigation/native';
import SegmentedControl from '@react-native-segmented-control/segmented-control';

import memoize from 'lodash.memoize';
import { wordlists } from 'bip39';

const englishWordList = wordlists['english'];
if (!englishWordList) throw new Error('Cannot load english wordlists');
const MAX_LENGTH = 8; //English wordlist max length = 8
const isPartialWordValid = memoize((partialWord: string) => {
  return englishWordList.some((word: string) => word.startsWith(partialWord));
});
const isWordValid = memoize((candidateWord: string) => {
  return englishWordList.some((word: string) => word === candidateWord);
});

import { validateMnemonic as validateMnemonicOriginal } from 'bip39';
export const validateMnemonic = memoize(
  (text: string) =>
    //no spaces at beginning, end or more than 1 consecutive space
    !/^\s|\s$|\s{2,}/.test(text) && validateMnemonicOriginal(text)
);

import { useTranslation } from 'react-i18next';

const wordCandidates = (clean: string) => {
  return englishWordList.filter(word => word.startsWith(clean));
};

export default function Bip39({
  words,
  onWords
}: {
  words: string[];
  onWords: (words: string[]) => void;
}) {
  const inputRef = useRef<TextInput>(null);
  const { t } = useTranslation();
  const styles = getStyles(useTheme(), useFonts({ RobotoMono_400Regular }));

  const [activeWordIndex, setActiveWordIndex] = useState(0);

  const toast = useToast();
  const toastId = useRef<string>();

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

  const handleChangeText = (text: string) => {
    const prevWord = words[activeWordIndex];
    if (prevWord === undefined)
      throw new Error(
        `Invalid activeWordIndex: ${activeWordIndex} : ${JSON.stringify(words)}`
      );
    if (prevWord.length > text.length) {
      //Delete text:
      onWords(
        words.map((word, index) => (index === activeWordIndex ? text : word))
      );
    } else {
      //Add text:
      const isLastWord = !words.some(
        (word: string, index: number) =>
          index !== activeWordIndex && !isWordValid(word)
      );

      const wc = wordCandidates(text);
      if (wc.length > 1) hideError();
      if (wc.length === 1) {
        const guessedWord = wc[0];
        if (guessedWord === undefined) throw new Error('Array error');
        const candidateWords = words.map((word, index) =>
          index === activeWordIndex ? guessedWord : word
        );
        if (!isLastWord || validateMnemonic(candidateWords.join(' '))) {
          onWords(candidateWords);
          if (!isLastWord) {
            setActiveWordIndex(
              candidateWords.findIndex(word => !isWordValid(word))
            );
          }
        } else {
          showError();
          //Incorrect word
          onWords(
            words.map((word, index) =>
              index === activeWordIndex ? text : word
            )
          );
        }
      } else {
        //More than 1 word candidate
        onWords(
          words.map((word, index) => (index === activeWordIndex ? text : word))
        );
      }
    }
  };

  const isMounted = useRef<boolean>(false);
  useEffect(() => {
    if (isMounted.current) inputRef.current?.focus();
    isMounted.current = true;
  }, [activeWordIndex]);

  return (
    <>
      <SegmentedControl
        style={styles.segmented}
        values={[t('bip39.segmented12'), t('bip39.segmented24')]}
        selectedIndex={words.length === 12 ? 0 : 1}
        onChange={event => {
          const newWords = [...words];
          const N = event.nativeEvent.selectedSegmentIndex === 0 ? 12 : 24;
          if (newWords.length > N) onWords(newWords.slice(0, N));
          else {
            while (newWords.length < N) newWords.push('');
            onWords(newWords);
          }
          LayoutAnimation.spring();
        }}
      />
      <View style={{ ...styles.words }}>
        {words.map((word, index) => (
          <View key={index} style={{ ...styles.indexAndInput }}>
            <Text style={[styles.number]}>
              {`${index + 1 < 10 ? '\u00A0' : ''}${index + 1}`}
            </Text>
            <TextInput
              {...(activeWordIndex === index ? { ref: inputRef } : {})}
              keyboardType="visible-password"
              blurOnSubmit={false}
              value={word}
              style={[
                styles.input,
                ((index === activeWordIndex && !isPartialWordValid(word)) ||
                  (index !== activeWordIndex && !isWordValid(word))) &&
                  styles.error
              ]}
              spellCheck={false}
              maxLength={MAX_LENGTH + 1}
              autoComplete={'off'}
              autoCorrect={false}
              autoCapitalize="none"
              onChangeText={handleChangeText}
              onFocus={() => {
                setActiveWordIndex(index);
              }}
            />
          </View>
        ))}
      </View>
    </>
  );
}
const getStyles = (theme: Theme, fonts: ReturnType<typeof useFonts>) => {
  const [fontsLoaded] = fonts;
  return StyleSheet.create({
    segmented: {
      height: 50,
      marginBottom: 20,
      //SegmentedControl for iOS has a bug setting backgroundColor.
      //#eeeeed will set #dfdfdf. Found by experimenting with a Color Picker tool
      //https://github.com/react-native-segmented-control/segmented-control/issues/127
      backgroundColor: Platform.select({ ios: '#eeeeed', default: '#dfdfdf' })
    },
    words: {
      overflow: 'hidden',
      borderRadius: 5,
      backgroundColor: '#dfdfdf',
      paddingTop: 10,
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'flex-start',
      margin: 0,
      paddingHorizontal: 10,
      borderWidth: 0
    },
    indexAndInput: {
      flexDirection: 'row', // Aligns children horizontally
      fontSize: 14,
      marginBottom: 10,
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
    number: {
      paddingVertical: 10,
      color: theme.colors.primary,
      paddingRight: 5,
      ...(fontsLoaded ? { fontFamily: 'RobotoMono_400Regular' } : {})
    }
  });
};
