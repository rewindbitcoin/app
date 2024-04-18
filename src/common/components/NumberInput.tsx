const INPUT_MAX_LENGTH = 18;
import React, { useState, useCallback, useRef, useMemo } from 'react';
import type { Locale } from '../../i18n-locales/init';
import AntDesign from '@expo/vector-icons/AntDesign';
import {
  Text,
  View,
  TextInput,
  StyleSheet,
  Platform,
  TextStyle,
  NativeSyntheticEvent,
  TextInputSelectionChangeEventData,
  LayoutChangeEvent
} from 'react-native';
import { useTheme } from '../theme';
import { useFonts } from 'expo-font';
import { RobotoMono_400Regular } from '@expo-google-fonts/roboto-mono';
import {
  localizedStrToNumber,
  localizeInputNumericString,
  unlocalizedKeyboardFix,
  getNewCursor
} from '../../common/lib/numbers';

const ClearButton = React.memo(
  ({
    onChangeText,
    showClearButton,
    fontSize,
    listSeparatorColor
  }: {
    onChangeText: (text: string) => void;
    showClearButton: boolean;
    fontSize?: number | undefined;
    listSeparatorColor: string;
  }) => {
    if (!showClearButton || Platform.OS === 'web') {
      return null;
    }

    return (
      <AntDesign
        onPress={() => onChangeText('')}
        style={{
          color: listSeparatorColor,
          fontSize: fontSize,
          alignSelf: 'center',
          marginRight: -10,
          paddingVertical: 10,
          paddingRight: 5,
          marginLeft: 10
        }}
        name="closecircle"
      />
    );
  }
);
ClearButton.displayName = 'ClearButton';

interface NumericInputProps {
  maxLength?: number;
  locale: Locale;
  strValue: string;
  numberFormatting?: boolean;
  style?: TextStyle;
  onChangeValue: (value: string) => void;
}

//The number we will use to initialize NumberInput width. Better to use the
//last one (if it was available) even if it is for a different style than zero.
//In fact, in most of the cases lastMaxLengthWidthGlobal will be the same (if no
//styles are passed) and we will avoid nasty flicker when re-rendering it as
//a new component.
let lastMaxLengthWidthGlobal: null | number = null;

const NumericInput = ({
  maxLength = INPUT_MAX_LENGTH,
  strValue,
  numberFormatting = true,
  locale,
  style,
  onChangeValue
}: NumericInputProps) => {
  if (maxLength > INPUT_MAX_LENGTH)
    throw new Error(`This component admits ${INPUT_MAX_LENGTH} length at most`);

  const theme = useTheme();
  const styles = useMemo(() => getStyles(), []);

  const [selection, setSelection] = useState<{
    start: number;
    end: number;
  }>({ start: strValue.length, end: strValue.length });

  //https://lefkowitz.me/visual-guide-to-react-native-textinput-keyboardtype-options/
  const keyboardType = 'numeric';
  const [fontsLoaded] = useFonts({ RobotoMono_400Regular });

  const lastProgramaticalSetSelectionEpochRef = useRef<number>(0);

  //IMPORTANT:
  //onChangeText is called before selection (setSelection) has been
  //set: https://github.com/facebook/react-native/pull/35603
  //In this component which will be the next cursor position using setSelection
  //Then we discard all onSelectionChange which ara called as a reaction for
  //changing text (if the are called within a few milliseconds after we have
  //setSelection here). Cursor position is 100% controlled in onChangeText.
  //This prevents missbehaviour in iOS. We still allow the user selecting
  //text when onSelectionChange is called not as a reaction of changing text.
  const onChangeText = useCallback(
    (newStrTextInputValue: string) => {
      //Cursor position for strValue (old input text value):
      //We will set the next cursor position for the returned newStrValue
      const cursor =
        selection?.end === undefined ? strValue.length : selection.end;

      let newStrValue = newStrTextInputValue;
      if (newStrTextInputValue.length > INPUT_MAX_LENGTH) {
        //Don't do anything. Dont' change cursor, don't add text
        //We have a limit of 20 chars for localized number operations
        ///(see number.ts) and being at 18 means that adding a number can
        //also add a decimal separator so that would be 2 letters. Just
        //don't allow more than that
        //setSelection({ start: cursor, end: cursor });
        //lastProgramaticalSetSelectionEpochRef.current = new Date().getTime();
        return;
      }
      if (
        keyboardType === 'numeric' &&
        (Platform.OS === 'ios' || Platform.OS === 'android')
      )
        newStrValue = unlocalizedKeyboardFix(newStrValue, strValue, locale);
      if (numberFormatting) {
        newStrValue = localizeInputNumericString(newStrValue, locale);

        //console.log('onChangeText', {
        //  newStrTextInputValue,
        //  strValue,
        //  cursor,
        //  newStrValue
        //});
        if (!Number.isNaN(localizedStrToNumber(newStrValue, locale))) {
          const isBackSpaceOnDelimiter =
            newStrValue === strValue &&
            newStrTextInputValue.length === strValue.length - 1;
          const newCursor = getNewCursor(newStrValue, strValue, cursor, locale);
          //console.log('onChangeText', { newCursor });
          if (isBackSpaceOnDelimiter) {
            setSelection({ start: cursor - 1, end: cursor - 1 });
            lastProgramaticalSetSelectionEpochRef.current =
              new Date().getTime();
          } else {
            setSelection({ start: newCursor, end: newCursor });
            lastProgramaticalSetSelectionEpochRef.current =
              new Date().getTime();
          }
        }
      }
      onChangeValue(newStrValue);
      //setStrValue(newStrValue);
      //const isValidStrValue = !Number.isNaN(
      //  localizedStrToNumber(newStrValue, locale)
      //);
      //if (isValidStrValue) {
      //  const value = localizedStrToNumber(newStrValue, locale);
      //  onChangeValue(value);
      //} else {
      //  onChangeValue(null);
      //}
    },
    [
      selection?.end,
      keyboardType,
      strValue,
      locale,
      numberFormatting,
      onChangeValue
    ]
  );

  const onSelectionChange = useCallback(
    ({
      nativeEvent
    }: NativeSyntheticEvent<TextInputSelectionChangeEventData>) => {
      const currentEpoch = new Date().getTime();
      //100 milliseconds
      if (currentEpoch - lastProgramaticalSetSelectionEpochRef.current > 100) {
        setSelection(nativeEvent.selection);
      }
    },
    []
  );

  //The <Text> Component is a fake component which will be not visible
  //It is used to compute the width of the font (for INPUT_MAX_LENGTH
  //zeros)
  //Since we use a fixed-width font-family (Roboto) then we can
  //compute the TextInput width later
  const onTextLayout = useCallback(
    (event: LayoutChangeEvent) => {
      if (fontsLoaded) {
        const { width } = event.nativeEvent.layout;
        lastMaxLengthWidthGlobal = width;
        setMaxLengthWidth(width);
      }
    },
    [fontsLoaded]
  );

  const [showClearButton, setShowClearButton] = useState<boolean>(false);

  const onFocus = useCallback(() => {
    setShowClearButton(true);
    setSelection({ start: strValue.length, end: strValue.length });
  }, [strValue]);
  const onBlur = useCallback(() => {
    setShowClearButton(false);
  }, []);

  const [maxLengthWidth, setMaxLengthWidth] = useState<number | null>(
    lastMaxLengthWidthGlobal
  );

  const hiddenTextStyle = useMemo(() => {
    return [
      {
        position: 'absolute' as const,
        opacity: 0,
        zIndex: -1000
      },
      fontsLoaded && { fontFamily: 'RobotoMono_400Regular' },
      style,
      styles.input
    ];
  }, [style, styles.input, fontsLoaded]);

  const textStyle = useMemo(() => {
    return [
      maxLengthWidth !== null && {
        width:
          (maxLengthWidth * Math.max(1, strValue.length)) / INPUT_MAX_LENGTH
      },
      fontsLoaded && { fontFamily: 'RobotoMono_400Regular' },
      style,
      styles.input
    ];
  }, [fontsLoaded, maxLengthWidth, strValue.length, style, styles.input]);

  return (
    <View className="flex-row">
      <Text onLayout={onTextLayout} style={hiddenTextStyle}>
        {'0'.repeat(INPUT_MAX_LENGTH)}
      </Text>
      <TextInput
        maxLength={INPUT_MAX_LENGTH}
        {...(selection ? { selection } : {})}
        keyboardType={keyboardType}
        style={textStyle}
        onFocus={onFocus}
        onBlur={onBlur}
        value={strValue}
        onChangeText={onChangeText}
        onSelectionChange={onSelectionChange}
      />
      <ClearButton
        onChangeText={onChangeText}
        showClearButton={showClearButton}
        fontSize={style?.fontSize}
        listSeparatorColor={theme.colors.listsSeparator}
      />
    </View>
  );
};

export default React.memo(NumericInput);

const getStyles = () =>
  StyleSheet.create({
    input: {
      padding: 0,
      borderWidth: 0,
      ...Platform.select({ web: { outlineWidth: 0 }, default: {} })
    }
  });
