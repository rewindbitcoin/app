//Note that activeWordIndex moves forward only if there is an exact match.
//That is, then when typing "you" (that is a valid word) it will not
//automatically pass to next word since "your" is also a valid
//word. Also , for example "feed" and "fee"...
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import { Text, StyleSheet, View } from 'react-native';
import AutoScrollWrapper from '../../common/components/AutoScrollWrapper';
import { batchedUpdates } from '~/common/lib/batchedUpdates';

import { LayoutAnimation } from 'react-native';
import { useFonts } from 'expo-font';
import {
  RobotoMono_400Regular,
  RobotoMono_500Medium
} from '@expo-google-fonts/roboto-mono';
import {
  useTheme,
  Theme,
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

/**
 * returns empty array if the candidateWord is not found. Even if there are words
 * starting with candidateWord this will return an empty array.
 *
 * if candidateWord is found in englishWordList, this returns an array including
 * candidateWord; but also including other words that start with candidateWord.
 * For example, when typing "fee" that is a valid word, this function will
 * return ["fee", "feed"]. But typing "fe" this returns [].
 */
const findMatchingWordAndCandidates = memoize((candidateWord: string) => {
  if (!englishWordList.some((word: string) => word === candidateWord)) {
    return [];
  }

  const matched = englishWordList.filter((word: string) =>
    word.startsWith(candidateWord)
  );

  return matched;
});

import { validateMnemonic as validateMnemonicOriginal } from 'bip39';
export const validateMnemonic = memoize(
  (text: string) =>
    //no spaces at beginning, end or more than 1 consecutive space
    !/^\s|\s$|\s{2,}/.test(text) && validateMnemonicOriginal(text)
);

import { useTranslation } from 'react-i18next';

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
  const [fontsLoaded] = useFonts({
    'RobotoMono-400Regular': RobotoMono_400Regular,
    'RobotoMono-500Medium': RobotoMono_500Medium
  });
  const theme = useTheme();
  const styles = useMemo(() => getStyles(theme), [theme]);

  const [activeWordIndex, setActiveWordIndex] = useState<number>(0);

  const toast = useToast();
  const toastId = useRef<string>();

  const showError = useCallback(() => {
    if (toastId.current !== undefined && toast.isOpen(toastId.current))
      toast.hide(toastId.current);
    toastId.current = toast.show(t('bip39.invalidErrorMessage'), {
      type: 'danger'
    });
  }, [t, toast]);
  const hideError = useCallback(
    () =>
      toastId.current !== undefined &&
      toast.isOpen(toastId.current) &&
      toast.hide(toastId.current),
    [toast]
  );

  if (readonly === false && onWords === undefined)
    throw new Error('onWords required if readonly=false');

  const handleChangeText = useCallback(
    (text: string) => {
      if (readonly === false && onWords) {
        if (onWords === undefined)
          throw new Error('onWords required if readonly=false');
        const prevWord = words[activeWordIndex];
        if (prevWord === undefined)
          throw new Error(
            `Invalid activeWordIndex: ${activeWordIndex} : ${JSON.stringify(words)}`
          );
        const newWords = words.map((word, index) =>
          index === activeWordIndex ? text : word
        );
        if (prevWord.length > text.length) {
          //Delete text:
          onWords(newWords);
          hideError();
        } else {
          //If editting last word (meaning all other words in inputs don't have errors)
          const isEditingLastWord = !words.some(
            (word: string, index: number) =>
              index !== activeWordIndex &&
              findMatchingWordAndCandidates(word).length === 0
          );
          const matched = findMatchingWordAndCandidates(text);
          if (
            isEditingLastWord &&
            matched.length >= 1 &&
            !matched.some(word =>
              validateMnemonic(
                newWords
                  .map((w, i) => (i === activeWordIndex ? word : w))
                  .join(' ')
              )
            )
          )
            showError();
          else hideError();

          //Add text and update index. For the current text, only move
          //forward activeWordIndex if there is exactly one match (and no other
          //candidartes; f.ex.: "fee" does not move forward the activeWordIndex
          //since "fees" is another valid word)
          batchedUpdates(() => {
            onWords(newWords);
            const nextIndex =
              matched.length !== 1
                ? activeWordIndex //keep current activeWordIndex if not exact match
                : newWords.findIndex(
                    word => findMatchingWordAndCandidates(word).length === 0
                  );
            if (nextIndex !== -1) setActiveWordIndex(nextIndex);
          });
        }
      }
    },
    [activeWordIndex, hideError, showError, onWords, words, readonly]
  );

  useEffect(() => {
    if (!readonly && autoFocus) inputRef.current?.focus();
  }, [readonly, autoFocus]);
  const hasUserInteracted = useRef<boolean>(false);
  useEffect(() => {
    if (!readonly && hasUserInteracted.current) inputRef.current?.focus();
  }, [activeWordIndex, readonly]);

  const onChangeNWords = useCallback(
    (index: number) => {
      if (!onWords) throw new Error('onWords must be defined if not readonly');
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
    },
    [onWords, words]
  );

  const handleFocus = useCallback(
    (index: number) => () => {
      hasUserInteracted.current = true;
      setActiveWordIndex(index);
    },
    []
  );

  //These settings on SegmentedControl are better for fast devices but on
  //slow devices it was better to show some feedback in the <SegmentedControl>
  //and then render the new words after a requestAnimationFrame:
  //
  //currentIndex={words.length === 12 ? 0 : 1}
  //onChange={onChangeNWords}
  const [segmentedIndex, setSegmentedIndex] = useState<number>(0);
  const onSegmentedIndexChange = useCallback(
    (index: number) => {
      //Decouple the tab change from the render itself to show rapid user
      //feedback
      setSegmentedIndex(index);
      requestAnimationFrame(() => onChangeNWords(index));
    },
    [onChangeNWords]
  );
  return (
    <View className="rounded-xl bg-backgroundDefault flex-row flex-wrap pt-2 pr-2 w-full android:border android:border-gray-300 shadow mobmed:pt-3 mobmed:pr-3">
      {readonly === false && disableLengthChange === false && onWords && (
        <View className="pb-4 items-center w-full">
          <SegmentedControl
            style={styles.segmented}
            activeTextStyle={styles.segmentedTexts}
            inactiveTextStyle={styles.segmentedTexts}
            segments={[t('bip39.segmented12'), t('bip39.segmented24')]}
            currentIndex={segmentedIndex}
            onChange={onSegmentedIndexChange}
          />
        </View>
      )}
      {words.map((word, index) => (
        <View
          key={index}
          className="flex-row w-1/3 pl-1 pb-2 mobmed:pl-2 mobmed:pb-3"
        >
          <Text
            className={`text-xs/10 mobmed:text-sm/10 pr-1 color-slate-500 ${fontsLoaded ? "font-['RobotoMono-500Medium']" : ''}`}
          >
            {`${index + 1 < 10 ? '\u00A0' : ''}${index + 1}`}
          </Text>
          <AutoScrollWrapper enabled={readonly}>
            <TextInput
              secureTextEntry={hideWords}
              readOnly={readonly}
              {...(activeWordIndex === index ? { ref: inputRef } : {})}
              blurOnSubmit={false}
              value={word}
              className={`ios:pb-1 text-xs mobmed:text-sm rounded px-2 ${readonly ? 'bg-slate-200' : 'bg-white'} flex-1 web:w-full outline-none ${fontsLoaded ? "font-['RobotoMono-400Regular']" : ''} ${
                (index === activeWordIndex && !isPartialWordValid(word)) ||
                (index !== activeWordIndex &&
                  findMatchingWordAndCandidates(word).length === 0)
                  ? 'text-notification'
                  : 'text-black'
              }`}
              spellCheck={false}
              maxLength={MAX_LENGTH + 1}
              autoComplete={'off'}
              autoCorrect={false}
              autoCapitalize="none"
              onChangeText={handleChangeText}
              onFocus={handleFocus(index)}
            />
          </AutoScrollWrapper>
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
      fontSize: 14
    }
  });
};
