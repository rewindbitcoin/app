import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  ScrollView,
  TextInput,
  Button,
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
import memoize from 'lodash.memoize';
import { wordlists, validateMnemonic as validateMnemonicOriginal } from 'bip39';
const englishWordList = wordlists['english'];
if (!englishWordList) throw new Error('Cannot load english wordlists');
const MAX_LENGTH = 8; //English wordlist max length = 8
const SPACE = '\u200B';
const validateMnemonic = memoize(validateMnemonicOriginal);
const cleanWord = (word: string) => word.replace(/[^a-z]/gi, '');
const isPartialWordValid = memoize((partialWord: string) => {
  const clean = cleanWord(partialWord);
  return (
    clean.length === 0 || englishWordList.some(word => word.startsWith(clean))
  );
});

const numberColor = '#2685BF';

export default () => {
  const inputRef = React.useRef<TextInput>(null);
  const [fontsLoaded] = useFonts({ RobotoMono_400Regular });

  const [wordList, setWordList] = useState<string[]>([]);
  const isValidMnemonic = validateMnemonic(wordList.join(' '));
  const [text, setText] = React.useState(SPACE);
  const addWord = (text: string) => {
    const newWordList = [...wordList, text];
    setWordList(newWordList);
    setText(SPACE);
    //inputRef && inputRef.current && inputRef.current.focus();
    //We also defer the focus because on Web, a "Tab" keypress automatically
    //removes the focus after render.
    setTimeout(() => inputRef.current?.focus(), 0);
    if (validateMnemonic(newWordList.join(' ')) === true) {
      console.log('TODO');
    }
  };
  useEffect(() => inputRef.current?.focus(), []);
  /** analizes the text on TextInput, and adds a new word (returning true) or
   * returns false */
  const processText = () => {
    const clean = cleanWord(text);
    const wordCandidates =
      clean.length > 1 //With 2 letters you can find a word. F.ex.: yard
        ? englishWordList.filter(word => word.startsWith(clean))
        : [];
    if (wordList.length < 24 && wordCandidates.length === 1) {
      const clean = wordCandidates[0];
      if (clean === undefined) throw new Error('Array error');
      addWord(clean);
      return true;
    }
    return false;
  };
  const handleChangeText = (newText: string) => {
    console.log('handleChangeText', { newText });
    if (newText.length === 0) {
      //newText.length is zero -> deleted
      setWordList(wordList.slice(0, -1));
      setText(SPACE);
    } else if (newText === SPACE) {
      setText(SPACE);
    } else {
      if (!processText()) setText(SPACE + cleanWord(newText));
    }
  };
  const onKeyPress = (
    event: NativeSyntheticEvent<TextInputKeyPressEventData>
  ) => {
    if (event.nativeEvent.key === 'Enter') {
      processText();
    }
  };
  const onEndEditing = () => processText();
  //const onBlur = () => {
  //  processText();
  //  inputRef.current?.focus();
  //};
  const onSubmitEditing = () => processText();

  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets={true}
      contentContainerStyle={{
        flexGrow: 1, //grow vertically to 100% and center child
        justifyContent: 'center',

        alignItems: 'center'
      }}
    >
      <View style={styles.view}>
        {wordList.map((word, index) => (
          <Pressable
            key={index}
            onPress={() => {
              setWordList(wordList.slice(0, index));
              setText(SPACE);
              inputRef.current?.focus();
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
      {isPartialWordValid(text) &&
        !isValidMnemonic &&
        wordList.length === 12 && (
          <Text>
            This 12-word sequence is invalid. Continue entering the rest of the
            words if you have a 24-word mnemonic, or correct any errors if you
            use 12 words.
          </Text>
        )}
      {isPartialWordValid(text) &&
        !isValidMnemonic &&
        wordList.length === 24 && (
          <Text>This word sequence is invalid. Correct any errors.</Text>
        )}
      {isValidMnemonic && (
        <Button title="Continue" onPress={() => console.log('TODO')} />
      )}
    </ScrollView>
  );
};
const styles = StyleSheet.create({
  view: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    borderColor: '#000000',
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
