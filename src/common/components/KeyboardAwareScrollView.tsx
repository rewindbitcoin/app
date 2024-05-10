//export { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
//export { ScrollView as KeyboardAwareScrollView } from 'react-native';

//This will only affect iOS:

import React, { forwardRef } from 'react';
import { KeyboardAwareScrollView as RNKASV } from 'react-native-keyboard-aware-scroll-view';
import { Platform, ScrollView, ScrollViewProps } from 'react-native';

const KeyboardAwareScrollView = forwardRef<ScrollView, ScrollViewProps>(
  (props, ref) => {
    // RNKASV uses innerRef
    const innerRef = (element: JSX.Element): void => {
      const scrollEl = element as unknown as ScrollView;
      if (typeof ref === 'function') ref(scrollEl);
      else if (ref && typeof ref === 'object') ref.current = scrollEl;
    };

    // On iOS use KeyboardAwareScrollView (which uses innerRef)
    if (Platform.OS === 'ios') return <RNKASV {...props} innerRef={innerRef} />;
    // On other platforms use ScrollView with normal ref directly
    else return <ScrollView {...props} ref={ref} />;
  }
);
KeyboardAwareScrollView.displayName = 'KeyboardAwareScrollView';

export { KeyboardAwareScrollView };

import Animated from 'react-native-reanimated';

const KeyboardAwareAnimatedScrollView =
  Platform.OS === 'ios'
    ? Animated.createAnimatedComponent(KeyboardAwareScrollView)
    : Animated.ScrollView;

export { KeyboardAwareAnimatedScrollView };

/*
import { listenToKeyboardEvents } from 'react-native-keyboard-aware-scroll-view';
const KeyboardAwareAnimatedScrollView = listenToKeyboardEvents({})(
  Animated.ScrollView
);
*/

//For Android:
//IMPORTANT: set "softwareKeyboardLayoutMode":  to "resize" in app.json
//this is so that Android does not "pan" the whole screen and the Toast is still
//visible on Top. Otherwise the whole thing is panned including the Toast out of the vuew

//import React, {
//  useCallback,
//  useEffect,
//  useMemo,
//  useRef,
//  useState
//} from 'react';
//import { Platform } from 'react-native';
//import { Keyboard, ScrollView, TextInput, StatusBar } from 'react-native';
//
//interface Props extends React.ComponentProps<typeof ScrollView> {
//  additionalScrollHeight?: number;
//}
//
//export const KeyboardAwareScrollView = ({
//  children,
//  additionalScrollHeight,
//  contentContainerStyle,
//  ...props
//}: Props) => {
//  const [, updateState] = React.useState();
//
//  const scrollViewRef = useRef<ScrollView>(null);
//  const scrollPositionRef = useRef<number>(0);
//  const contentHeightRef = useRef<number>(0);
//  const scrollViewSizeRef = useRef<number>(0);
//
//  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
//  const [additionalPadding, setAdditionalPadding] = useState(0);
//
//  const scrollToPosition = useCallback(
//    (toPosition: number, animated?: boolean) => {
//      console.log('Programmatically scrollToPosition', { toPosition });
//      scrollViewRef.current?.scrollTo({ y: toPosition, animated: !!animated });
//      //scrollPositionRef.current = toPosition;
//      //console.log('TRACE scrollToPosition', scrollPositionRef.current);
//    },
//    []
//  );
//
//  const additionalScroll = useMemo(
//    () => additionalScrollHeight ?? 0,
//    [additionalScrollHeight]
//  );
//  const androidStatusBarOffset = useMemo(
//    () => StatusBar.currentHeight ?? 0,
//    []
//  );
//
//  useEffect(() => {
//    const didShowListener = Keyboard.addListener('keyboardDidShow', frames => {
//      const keyboardY = frames.endCoordinates.screenY;
//
//      if (Platform.OS === 'ios') {
//        const keyboardHeight = frames.endCoordinates.height;
//        console.log('keyboardDidShow', { keyboardY, keyboardHeight });
//        setAdditionalPadding(keyboardHeight);
//      }
//
//      setTimeout(() => {
//        setIsKeyboardVisible(true);
//      }, 100);
//
//      const currentlyFocusedInput = TextInput.State.currentlyFocusedInput();
//      const currentScrollY = scrollPositionRef.current;
//
//      currentlyFocusedInput?.measureInWindow((_x, y, _width, height) => {
//        const endOfInputY = y + height + androidStatusBarOffset;
//        const deltaToScroll = endOfInputY - keyboardY;
//
//        if (deltaToScroll < 0) return;
//
//        const scrollPositionTarget =
//          currentScrollY + deltaToScroll + additionalScroll;
//        //Programmatically scroll so that keyboard does not hide the input
//        scrollToPosition(scrollPositionTarget, true);
//      });
//    });
//
//    const didHideListener = Keyboard.addListener('keyboardDidHide', () => {
//      setAdditionalPadding(0);
//      setIsKeyboardVisible(false);
//      const scrollPosition = scrollPositionRef.current;
//      scrollViewRef.current?.scrollTo({
//        y: scrollPosition + 1,
//        animated: false
//      });
//      scrollViewRef.current?.scrollTo({
//        y: scrollPosition,
//        animated: false
//      });
//      //setTimeout(() => {
//      //  console.log('forceUpdate');
//      //  const scrollPosition = scrollPositionRef.current;
//      //  scrollViewRef.current?.scrollTo({
//      //    y: scrollPosition + 1,
//      //    animated: false
//      //  });
//      //  scrollViewRef.current?.scrollTo({
//      //    y: scrollPosition,
//      //    animated: false
//      //  });
//      //}, 5000);
//    });
//
//    //Programmatically restore old scroll position after hiding keyb
//    //const willHideListener = Keyboard.addListener(
//    //  'keyboardWillHide',
//    //  frames => {
//    //    // iOS only, scroll back to initial position to avoid flickering
//    //    const keyboardHeight = frames.endCoordinates.height;
//    //    const currentScrollY = scrollPositionRef.current;
//
//    //    /*
//    //      Added this early return to avoid a bug with react-navigation, where moving from a screen to another, this event was triggered twice
//    //      In any case, no need to scroll back if we are already at the top so this early return should be safe
//    //    */
//    //    if (currentScrollY <= 0) return;
//
//    //    const scrollPositionTarget = currentScrollY - keyboardHeight;
//    //    scrollToPosition(scrollPositionTarget, true);
//    //  }
//    //);
//
//    return () => {
//      didShowListener.remove();
//      didHideListener.remove();
//      //willHideListener.remove();
//    };
//  }, [additionalScroll, androidStatusBarOffset, scrollToPosition]);
//  console.log('render', { additionalPadding });
//
//  //{...(additionalPadding
//  //  ? {
//  //      contentInset: { bottom: additionalPadding },
//  //      scrollIndicatorInsets: { bottom: additionalPadding }
//  //    }
//  //  : {})}
//
//  // scrollEventThrottle={16}
//  return (
//    <ScrollView
//      ref={scrollViewRef}
//      contentContainerStyle={[
//        contentContainerStyle
//        //,{ paddingBottom: additionalPadding }
//      ]}
//      {...(additionalPadding
//        ? {
//            contentInset: { bottom: additionalPadding },
//            scrollIndicatorInsets: { bottom: additionalPadding }
//          }
//        : {})}
//      keyboardShouldPersistTaps="handled"
//      onMomentumScrollEnd={event => {
//        scrollPositionRef.current = event.nativeEvent.contentOffset.y;
//        console.log('TRACE onMomentumScrollEnd', scrollPositionRef.current);
//      }}
//      onScrollEndDrag={event => {
//        scrollPositionRef.current = event.nativeEvent.contentOffset.y;
//        console.log('TRACE onScrollEnd', scrollPositionRef.current);
//      }}
//      onLayout={event => {
//        console.log('onLayout');
//        scrollViewSizeRef.current = event.nativeEvent.layout.height;
//      }}
//      onContentSizeChange={(_width, contentHeight) => {
//        const prevContentHeight = contentHeightRef.current;
//        const contentHeightDelta = contentHeight - prevContentHeight;
//        contentHeightRef.current = contentHeight;
//
//        const currentScrollY = scrollPositionRef.current;
//        console.log('onContentSizeChange', {
//          prevContentHeight,
//          contentHeight
//        });
//        if (!isKeyboardVisible) {
//          if (contentHeight <= scrollViewSizeRef.current)
//            scrollToPosition(0, false);
//        } else {
//          const scrollPositionTarget = currentScrollY + contentHeightDelta;
//          scrollToPosition(scrollPositionTarget, true);
//        }
//      }}
//      {...props}
//    >
//      {children}
//    </ScrollView>
//  );
//};
