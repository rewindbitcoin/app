import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { LayoutAnimation } from 'react-native';
import { useFonts } from 'expo-font';
import {
  RobotoMono_400Regular,
  RobotoMono_500Medium
} from '@expo-google-fonts/roboto-mono';
import {
  useTheme,
  Theme,
  Text,
  TextInput,
  SegmentedControl,
  useToast
} from '../../common/ui';

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
  onWords,
  disableLengthChange = false,
  autoFocus = false,
  readonly = false,
  hideWords = false
}: {
  words: string[];
  onWords?: (words: string[]) => void;
  disableLengthChange?: boolean;
  autoFocus?: boolean;
  readonly?: boolean;
  hideWords?: boolean;
}) {
  const inputRef = useRef<TextInput>(null);
  const { t } = useTranslation();
  useFonts({
    'RobotoMono-400Regular': RobotoMono_400Regular,
    'RobotoMono-500Medium': RobotoMono_500Medium
  });
  const styles = getStyles(useTheme());

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

  if (readonly === false && onWords === undefined)
    throw new Error('onWords required if readonly=false');

  const handleChangeText = (text: string) => {
    if (readonly === false && onWords) {
      if (onWords === undefined)
        throw new Error('onWords required if readonly=false');
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
            words.map((word, index) =>
              index === activeWordIndex ? text : word
            )
          );
        }
      }
    }
  };

  //const isMounted = useRef<boolean>(false);
  useEffect(() => {
    if (!readonly && autoFocus) inputRef.current?.focus();
    //if (isMounted.current) inputRef.current?.focus();
    //isMounted.current = true;
  }, [activeWordIndex, readonly]);

  return (
    <View className="rounded-xl bg-backgroundDefault flex-row flex-wrap pt-2 pr-2 w-full android:border android:border-gray-300 shadow mobmed:pt-3 mobmed:pr-3">
      {readonly === false && disableLengthChange === false && onWords && (
        <View className="pb-4 items-center w-full">
          <SegmentedControl
            style={styles.segmented}
            activeTextStyle={styles.segmentedTexts}
            inactiveTextStyle={styles.segmentedTexts}
            segments={[t('bip39.segmented12'), t('bip39.segmented24')]}
            currentIndex={words.length === 12 ? 0 : 1}
            onChange={index => {
              const newWords = [...words];
              const N = index === 0 ? 12 : 24;
              if (newWords.length > N) onWords(newWords.slice(0, N));
              else {
                while (newWords.length < N) newWords.push('');
                onWords(newWords);
              }
              //LayoutAnimation.spring();
              LayoutAnimation.configureNext({
                ...LayoutAnimation.Presets.linear,
                duration: 150
              });
            }}
          />
        </View>
      )}
      {words.map((word, index) => (
        <View
          key={index}
          className="flex-row w-1/3 pl-1 pb-2 mobmed:pl-2 mobmed:pb-3"
        >
          <Text className="text-xs/10 mobmed:text-sm/10 pr-1 font-['RobotoMono-500Medium'] color-slate-500">
            {`${index + 1 < 10 ? '\u00A0' : ''}${index + 1}`}
          </Text>
          <TextInput
            secureTextEntry={hideWords}
            readOnly={readonly}
            {...(activeWordIndex === index ? { ref: inputRef } : {})}
            blurOnSubmit={false}
            value={word}
            className={`ios:pb-1 text-xs mobmed:text-sm rounded pl-2 ${readonly ? 'bg-slate-200' : 'bg-white'} flex-1 web:w-full outline-none font-['RobotoMono-400Regular'] ${
              (index === activeWordIndex && !isPartialWordValid(word)) ||
              (index !== activeWordIndex && !isWordValid(word))
                ? 'text-notification'
                : 'text-black'
            }`}
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
  );
}
const getStyles = (theme: Theme) => {
  return StyleSheet.create({
    segmented: {
      marginLeft: 10,
      width: 200,
      height: 30,
      backgroundColor: theme.colors.darkerOverDarkerBackground
    },
    segmentedTexts: {
      fontSize: 12
    }
  });
};
