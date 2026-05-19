// Copyright (C) 2025 Jose-Luis Landabaso - https://rewindbitcoin.com
// Licensed under the GNU GPL v3 or later. See the LICENSE file for details.

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import {
  View,
  Platform,
  KeyboardAvoidingView,
  Dimensions,
  LayoutChangeEvent,
  Pressable,
  Text
} from 'react-native';
import RNModal from 'react-native-modal';
import { Button } from './Button';
import { useTheme } from '../theme';
import type { IconType } from './types';
import * as Icons from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Ubuntu_500Medium, Ubuntu_700Bold } from '@expo-google-fonts/ubuntu';
import { rgba } from 'polished';
import { useFonts } from 'expo-font';

import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
  //Important to use this one or android won't be able to Scroll content:
  ScrollView
} from 'react-native-gesture-handler';
import Animated, {
  withSpring,
  withTiming,
  runOnJS,
  useAnimatedStyle,
  useSharedValue
} from 'react-native-reanimated';

import { getRealWindowHeight } from 'react-native-extra-dimensions-android';

export interface ModalProps {
  title: string;
  subTitle?: string;
  isVisible: boolean;
  icon?: IconType;
  customButtons?: React.ReactNode;
  closeButtonText?: string;
  headerMini?: boolean;
  onClose?: () => void;
  onModalHide?: () => void;
  children: React.ReactNode;
}

const DELTA = 100;
const ANIMATION_TIME = 200;
const OPACITY = 0.25;
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const RawModal: React.FC<ModalProps> = ({
  isVisible,
  icon,
  headerMini = false,
  closeButtonText,
  onClose,
  onModalHide,
  customButtons = null,
  title,
  subTitle,
  children
}) => {
  if (subTitle && headerMini)
    throw new Error('subTitle and headerMini are not compatible');
  const [ubuntuLoaded] = useFonts({
    Ubuntu700Bold: Ubuntu_700Bold,
    Ubuntu500Medium: Ubuntu_500Medium
  });
  const theme = useTheme();
  const isNativeModal = Platform.OS !== 'web';
  const hiddenTranslateY =
    Platform.OS === 'android'
      ? getRealWindowHeight()
      : Platform.OS === 'ios'
        ? Dimensions.get('window').height
        : 0;
  const translateY = useSharedValue(hiddenTranslateY);
  const scrollViewPaddingVertical = 20;
  const [buttonHeight, setButtonHeight] = useState<number>(0);
  const [headerTitleHasManyLines, setHeaderTitleHasManyLines] = useState(false);

  const [childrenHeight, setChildrenHeight] = useState<number>(200);
  const headerHeight = headerMini ? 60 : 150;

  const onCloseTriggered = useSharedValue<boolean>(false);
  const dragStartY = useSharedValue(0);

  const Icon =
    icon && icon.family && Icons[icon.family] ? Icons[icon.family] : null;

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(Platform.OS !== 'web')
        /*
         * TAG-android-does-not-propagate-slider-events
         *
         * This keeps Slider (see EditableSlider.tsx) usable within the modal.
         * On Android, a parent pan gesture can capture events before the Slider
         * receives them. Increasing the minimum distance delays modal drag
         * recognition enough for slider drags to become the responder first.
         *
         * This replaces minDist={20} from the previous handler API.
         * The Slider also applies an Android-only onResponderGrant workaround;
         * using both has proven smoother on Android.
         *
         * References:
         * https://github.com/callstack/react-native-slider/issues/296#issuecomment-1001085596
         * https://github.com/callstack/react-native-slider/issues/296#issuecomment-1138417122
         */
        .minDistance(20)
        .onStart(() => {
          dragStartY.value = translateY.value;
        })
        .onUpdate(event => {
          const translation = dragStartY.value + event.translationY;
          if (translation >= 0) translateY.value = translation;
          else translateY.value = translation / 3;
        })
        .onEnd((_, success) => {
          if (success && translateY.value > DELTA && onClose) {
            onCloseTriggered.value = true;
            runOnJS(onClose)();
          } else {
            translateY.value = withSpring(0);
          }
        })
        .onFinalize((_, success) => {
          if (!success && !onCloseTriggered.value)
            translateY.value = withSpring(0);
        }),
    [dragStartY, onClose, onCloseTriggered, translateY]
  );

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [
        {
          translateY: translateY.value
        }
      ]
    };
  });
  const backdropOpacity = useSharedValue(0);
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value
  }));
  const handleClose = () => {
    onCloseTriggered.value = true;
    if (onClose) onClose();
  };
  const isMountedRef = useRef<boolean>(false);
  useEffect(() => {
    isMountedRef.current = true;
    if (isVisible) {
      // Reanimated shared values are intentionally mutable; this is not React state.
      // eslint-disable-next-line react-hooks/immutability
      onCloseTriggered.value = false;
      // Reanimated shared values are intentionally mutable; this is not React state.
      // eslint-disable-next-line react-hooks/immutability
      translateY.value = isNativeModal
        ? withTiming(0, { duration: ANIMATION_TIME })
        : 0;
      // Reanimated shared values are intentionally mutable; this is not React state.
      // eslint-disable-next-line react-hooks/immutability
      backdropOpacity.value = withTiming(OPACITY, { duration: ANIMATION_TIME });
    } else {
      if (isNativeModal) {
        // Reanimated shared values are intentionally mutable; this is not React state.
        // eslint-disable-next-line react-hooks/immutability
        translateY.value = withTiming(hiddenTranslateY, {
          duration: ANIMATION_TIME
        });
      } else {
        setTimeout(() => {
          //Make sure it's set to zero.
          if (isMountedRef.current && !isVisible) {
            // Reanimated shared values are intentionally mutable; this is not React state.
            // eslint-disable-next-line react-hooks/immutability
            translateY.value = 0;
          }
        }, 1.5 * ANIMATION_TIME);
      }
      // Reanimated shared values are intentionally mutable; this is not React state.
      // eslint-disable-next-line react-hooks/immutability
      backdropOpacity.value = withTiming(0, { duration: ANIMATION_TIME });
    }
    return () => {
      isMountedRef.current = false;
    };
  }, [
    hiddenTranslateY,
    isNativeModal,
    isVisible,
    translateY,
    backdropOpacity,
    onCloseTriggered
  ]);

  const onParentLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const newHeight =
        event.nativeEvent.layout.height + scrollViewPaddingVertical * 2;
      setChildrenHeight(prevHeight => {
        // Only update if the difference is more than 1 (in Android there may be
        // slight imprecission while rendering which would trigger infinite updates)
        // This might be the problem in Android:
        // https://github.com/facebook/react-native/issues/21801
        if (Math.abs(prevHeight - newHeight) > 1) {
          return newHeight;
        }
        // Return previous state to avoid unnecessary re-render
        return prevHeight;
      });
    },
    [scrollViewPaddingVertical]
  );

  const onButtonLayout = useCallback((event: LayoutChangeEvent) => {
    const newHeight = event.nativeEvent.layout.height;
    setButtonHeight(prevHeight => {
      // Only update if the difference is more than 1 (in Android there may be
      // slight imprecission while rendering which would trigger infinite updates)
      if (Math.abs(prevHeight - newHeight) > 1) {
        return newHeight;
      }
      // Return previous state to avoid unnecessary re-render
      return prevHeight;
    });
  }, []);

  const scrollViewRef = useRef<ScrollView | null>(null);
  // Simulate a small scroll to hint at scrollability. This is specially
  // important for iOS since persistentScrollbar only applies to Android
  // See: https://stackoverflow.com/questions/47038519/permanently-visible-scroll-bar-for-scrollview-react-native
  useEffect(() => {
    let timer1: ReturnType<typeof setTimeout> | undefined;
    let timer2: ReturnType<typeof setTimeout> | undefined;
    if (isVisible) {
      timer1 = setTimeout(() => {
        scrollViewRef.current?.flashScrollIndicators();
      }, 1000);
      timer2 = setTimeout(() => {
        scrollViewRef.current?.flashScrollIndicators();
      }, 3000);
    }
    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
    };
  }, [isVisible]);

  return (
    <RNModal
      {...(Platform.OS === 'android'
        ? {
            deviceHeight: getRealWindowHeight(),
            // The Android native Modal lives in its own window. Keeping that
            // window hardware-accelerated prevents brief transparent frames
            // during visible content/layout changes inside the modal.
            hardwareAccelerated: true
          }
        : {})}
      statusBarTranslucent
      isVisible={isVisible}
      // These timings only apply to react-native-modal's content fade below.
      // Sheet movement and backdrop opacity are driven separately by Reanimated.
      animationInTiming={ANIMATION_TIME}
      animationOutTiming={ANIMATION_TIME}
      // We render and animate our own backdrop with Reanimated to avoid
      // react-native-modal's separate backdrop transition/unmount flicker.
      hasBackdrop={false}
      // react-native-modal only fades the content wrapper now. Backdrop opacity
      // and sheet movement are handled by Reanimated below; before this,
      // react-native-modal owned backdrop transitions and slideInUp/slideOutDown
      // movement. Keep this fade JS-driven: native-driver fade delayed/blanked
      // first frames on Android, and native-driver slide caused modal flicker.
      useNativeDriver={false}
      // Fade only: do not let react-native-modal animate spatial movement.
      // The sheet's translateY movement is fully controlled by Reanimated.
      animationIn="fadeIn"
      animationOut="fadeOut"
      onModalHide={onModalHide}
      style={{
        ...(Platform.OS !== 'web' ? { justifyContent: 'flex-end' } : {}),
        margin: 0,
        padding: 0
        //https://github.com/react-native-modal/react-native-modal/issues/147
        //statusBarTranslucent does the trick
        //backgroundColor: 'red'
      }}
    >
      <AnimatedPressable
        // Own the backdrop instead of using react-native-modal's separate
        // backdrop state machine; that path can briefly flash clear-dark-clear
        // during close, especially after drag-dismiss or on short modals.
        // Android's system touch feedback can also play a loud/repeated click.
        android_disableSound
        pointerEvents={isVisible ? 'auto' : 'none'}
        onPress={handleClose}
        style={[
          {
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: 0,
            right: 0,
            backgroundColor: 'black'
          },
          backdropStyle
        ]}
      />
      <KeyboardAvoidingView behavior="padding">
        {/*
         * behavior="padding" on June 13, 2024
         *
         * I was using behavior="position" because behavior="padding" used to
         * make it randomly flicker on android(1px up & down) when the keyboard
         * is dismissed. However behavior="position" also had a problem:
         * In Android, in the InitUnfreeze When the Fee Slider is shown,
         * if the User opens the Keyboard to set up manually a fee,
         * then the Slider stops working (while the Keyboard
         * is shown. So I've reverted to behavior="padding". For some reason
         * the flickering is not showing up anymore. Perhaps because I upgraded
         * react-native version. It's unsure, so better keep monitoring it.
         */}
        <GestureHandlerRootView
          style={{
            //See: https://github.com/software-mansion/react-native-gesture-handler/issues/139
            backgroundColor: 'transparent'
          }}
        >
          <GestureDetector gesture={panGesture}>
            <Animated.View style={animatedStyle}>
              <View
                style={{
                  height: Math.min(
                    600,
                    childrenHeight + buttonHeight + headerHeight
                  ),
                  borderRadius: 20,
                  overflow: 'hidden',
                  marginBottom: 20,
                  marginTop: 20,
                  maxHeight: Dimensions.get('window').height - 40,
                  maxWidth: 600,
                  width: '95%',
                  alignSelf: 'center',
                  backgroundColor: theme.colors.white,
                  justifyContent: 'space-around',
                  alignItems: 'center',

                  // Shadow for iOs and Web:
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.25,
                  shadowRadius: 3.84,

                  // Elevation for Android
                  elevation: 5
                }}
              >
                <View
                  style={{
                    alignSelf: 'stretch',
                    height: headerHeight,
                    backgroundColor: theme.colors.primary
                  }}
                >
                  {Icon && icon ? (
                    <Icon
                      style={{
                        color: theme.colors.white,
                        opacity: 0.1,
                        fontSize: headerMini ? 45 : 120,
                        paddingLeft: headerMini ? 8 : 30,
                        paddingTop: headerMini ? 8 : 15
                      }}
                      name={icon.name}
                    />
                  ) : null}
                  <View
                    className={`${headerMini ? 'bottom-2' : 'bottom-4'} absolute w-full`}
                  >
                    <Text
                      className={`${ubuntuLoaded ? "font-['Ubuntu700Bold']" : ''} uppercase opacity-90 ${headerMini ? 'text-lg ml-16 pr-2' : 'px-4 text-xl mobmed:text-2xl mobmed:px-8'} text-white ${subTitle || headerTitleHasManyLines ? '!leading-none' : ''}`}
                      {...(headerMini ? { numberOfLines: 1 } : {})}
                      onTextLayout={e => {
                        const linesLength = e.nativeEvent.lines.length;
                        if (linesLength >= 3 && !headerTitleHasManyLines) {
                          setHeaderTitleHasManyLines(true);
                        } else if (linesLength < 3 && headerTitleHasManyLines) {
                          setHeaderTitleHasManyLines(false);
                        }
                      }}
                    >
                      {title}
                    </Text>
                    {subTitle && (
                      <Text
                        className={`${ubuntuLoaded ? "font-['Ubuntu500Medium']" : ''} opacity-75 w-full left-0 px-4 mobmed:px-8 text-white pt-4`}
                        numberOfLines={2}
                      >
                        {subTitle}
                      </Text>
                    )}
                  </View>
                  {Platform.select({
                    //A bar as a hint to the user this is draggable
                    //Don't show on web
                    web: null,
                    default: (
                      <View
                        style={{
                          alignSelf: 'center',
                          opacity: 0.3,
                          position: 'absolute',
                          borderWidth: 2,
                          borderColor: theme.colors.white,
                          borderRadius: 2,
                          top: 10,
                          width: 80
                        }}
                      />
                    )
                  })}
                </View>

                <ScrollView
                  ref={scrollViewRef}
                  persistentScrollbar={true}
                  keyboardShouldPersistTaps="handled"
                  style={{
                    alignSelf: 'stretch',
                    marginHorizontal: 4 /*leave some margin so that the scrollbar in Android does not look too close to the edge (makes it difficult to grasp if content is scrollable, so 4 pixels margin here and additional 4 pixels padding in the children makes 8 pixels horizontal "padding"*/
                  }}
                  contentContainerStyle={{
                    flexGrow: 1,
                    paddingVertical: scrollViewPaddingVertical,
                    paddingHorizontal: 4,
                    justifyContent: 'center'
                  }}
                >
                  <View onLayout={onParentLayout}>{children}</View>
                </ScrollView>
                <LinearGradient
                  colors={[rgba(theme.colors.white, 0), theme.colors.white]}
                  style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    bottom: buttonHeight,
                    height: 20
                  }}
                />
                {onClose && !customButtons ? (
                  <View style={{ paddingBottom: 20 }} onLayout={onButtonLayout}>
                    <Button onPress={handleClose}>
                      {closeButtonText || 'Understood'}
                    </Button>
                  </View>
                ) : null}
                {customButtons && (
                  <View onLayout={onButtonLayout}>{customButtons}</View>
                )}
              </View>
            </Animated.View>
          </GestureDetector>
        </GestureHandlerRootView>
      </KeyboardAvoidingView>
    </RNModal>
  );
};

const Modal = React.memo(RawModal);

export { Modal };
