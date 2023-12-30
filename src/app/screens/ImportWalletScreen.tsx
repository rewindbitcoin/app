import React, { useState } from 'react';
import { ScrollView } from 'react-native';
import memoize from 'lodash.memoize';
import { wordlists, validateMnemonic as validateMnemonicOriginal } from 'bip39';
const wordList = wordlists['english'];
if (!wordList) throw new Error('Cannot load english wordlists');
const MAX_LENGTH = 8; //English wordlist max length = 8
const SPACE = ' ';
const validateMnemonic = memoize(validateMnemonicOriginal);
const cleanWord = (word: string) => word.replace(/[^a-z]/gi, '');
const isPartialWordValid = memoize((partialWord: string) => {
  const clean = cleanWord(partialWord.trim());
  return clean.length === 0 || wordList.some(word => word.startsWith(clean));
});

export default () => {
  const [wordList, setWordList] = useState<string[]>([]);
  const isValidMnemonic = validateMnemonic(wordList.join(' '));
  const [text, setText] = React.useState('');
  const addWord = (text: string) => {
    const newWordList = [...wordList, text];
    setWordList(newWordList);
    setText(SPACE);
    //inputRef && inputRef.current && inputRef.current.focus();
    //We also defer the focus because on Web, a "Tab" keypress automatically
    //removes the focus after render.
    setTimeout(
      () => inputRef && inputRef.current && inputRef.current.focus(),
      0
    );
    if (memoValidateMnemonic(newWordList.join(' ')) === true) {
      console.log('TODO');
    }
  };
  const handleChangeText = (newText: string) => {
    if (newText.length === 0) {
      setWordList(wordList.slice(0, -1));
      setText(SPACE);
    } else if (newText === SPACE) {
      setText(SPACE);
    } else {
      let clean = cleanWord(newText);
      const wordCandidates =
        clean.length > 1 //With 2 letters you can find a word. F.ex.: yard
          ? wordList.filter(word => word.startsWith(clean))
          : [];
      if (
        wordList.length < 24 &&
        wordCandidates.length === 1 &&
        clean === wordCandidates[0]
      ) {
        clean = wordCandidates[0];
        addWord(clean);
      } else {
        setText(SPACE + clean);
      }
    }
  };
  const onKeyPress = ({ nativeEvent }) => nativeEvent.key === 'Enter' && onOk();
  const onEndEditing = () => onOk();
  const onBlur = () => {
    onOk();
    inputRef.current.focus();
  };
  const onSubmitEditing = () => onOk();
  const onOk = () => {
    let clean = cleanWord(text);
    const wordCandidates =
      clean.length > 1 //With 2 letters you can find a word. F.ex.: yard
        ? wordList.filter(word => word.startsWith(clean))
        : [];
    if (wordList.length < 24 && wordCandidates.length === 1) {
      clean = wordCandidates[0];
      addWord(clean);
    }
  };

  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{
        flexGrow: 1, //grow vertically to 100% and center child
        justifyContent: 'center'
      }}
    ></ScrollView>
  );
};
