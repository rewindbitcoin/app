import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Platform,
  KeyboardAvoidingView,
  Dimensions,
  LayoutChangeEvent
} from 'react-native';
import RNModal from 'react-native-modal';
import { Button } from './Button';
import { useTheme } from '../theme';
import { Text } from './Text';
import * as Icons from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Ubuntu_500Medium, Ubuntu_700Bold } from '@expo-google-fonts/ubuntu';
import { rgba } from 'polished';
import { useFonts } from 'expo-font';

import {
  GestureHandlerRootView,
  PanGestureHandler,
  //Important to use this one or android won't be able to Scroll content:
  ScrollView
} from 'react-native-gesture-handler';
import Animated, {
  withSpring,
  runOnJS,
  useAnimatedGestureHandler,
  useAnimatedStyle,
  useSharedValue
} from 'react-native-reanimated';

import { getRealWindowHeight } from 'react-native-extra-dimensions-android';

export type IconType = { family: keyof typeof Icons; name: string };

interface ModalProps {
  title: string;
  subTitle?: string;
  isVisible: boolean;
  icon?: IconType;
  customButtons?: React.ReactNode;
  closeButtonText?: string;
  onClose?: () => void;
  children: React.ReactNode;
}

const DELTA = 100;
const ANIMATION_TIME = 300;
const OPACITY = 0.3;

const Modal: React.FC<ModalProps> = ({
  isVisible,
  icon,
  closeButtonText,
  onClose,
  customButtons = null,
  title,
  subTitle,
  children
}) => {
  const [ubuntuLoaded] = useFonts({
    Ubuntu700Bold: Ubuntu_700Bold,
    Ubuntu500Medium: Ubuntu_500Medium
  });
  const theme = useTheme();
  const translateY = useSharedValue(0);
  const scrollViewPaddingVertical = 20;
  const [buttonHeight, setButtonHeight] = useState<number>(0);

  const [childrenHeight, setChildrenHeight] = useState<number>(200);
  const headerHeight = 150;

  const onCloseTriggered = useRef<boolean>(false);

  const Icon =
    icon && icon.family && Icons[icon.family] ? Icons[icon.family] : null;

  const gestureHandler = Platform.select({
    web: () => {}, //nop
    default: useAnimatedGestureHandler({
      onStart: (_, ctx: { startY: number }) => {
        ctx.startY = translateY.value;
      },
      onActive: (event, ctx) => {
        const translation = ctx.startY + event.translationY;
        if (translation >= 0) translateY.value = translation;
        else translateY.value = translation / 3;
      },
      onEnd: _ => {
        if (translateY.value > DELTA && onClose) {
          runOnJS(onClose)();
          //translateY.value = withSpring(-200, { duration: ANIMATION_TIME });
        } else {
          translateY.value = withSpring(0);
        }
      },
      onCancel: _ => {
        if (!onCloseTriggered.current) translateY.value = withSpring(0);
      }
    })
  });

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [
        {
          translateY: translateY.value
        }
      ]
    };
  });
  const handleClose = () => {
    onCloseTriggered.current = true;
    if (onClose) onClose();
  };
  const isMountedRef = useRef<boolean>(false);
  useEffect(() => {
    isMountedRef.current = true;
    if (isVisible) {
      onCloseTriggered.current = false;
      translateY.value = 0;
    } else {
      window.setTimeout(() => {
        //Make sure it's set to zero.
        if (isMountedRef.current && !isVisible) translateY.value = 0;
      }, 1.5 * ANIMATION_TIME);
    }
    return () => {
      isMountedRef.current = false;
    };
  }, [isVisible, translateY]);

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

  return (
    <RNModal
      {...(Platform.OS === 'android'
        ? { deviceHeight: getRealWindowHeight() }
        : {})}
      statusBarTranslucent
      isVisible={isVisible}
      animationInTiming={ANIMATION_TIME}
      animationOutTiming={ANIMATION_TIME}
      backdropTransitionInTiming={ANIMATION_TIME}
      backdropTransitionOutTiming={ANIMATION_TIME}
      backdropOpacity={OPACITY}
      hideModalContentWhileAnimating
      useNativeDriver={
        Platform.select({ web: false, default: true })
        // Either native driver or swipe
        //https://github.com/react-native-modal/react-native-modal/issues/692
        // swipeDirection="down"
        // onSwipeComplete={() => showHelp(undefined)}
      }
      onBackdropPress={handleClose}
      useNativeDriverForBackdrop={Platform.select({
        web: false,
        default: true
      })}
      animationIn={Platform.select({ web: 'fadeIn', default: 'slideInUp' })}
      animationOut={Platform.select({
        web: 'fadeOut',
        default: 'slideOutDown'
      })}
      style={{
        ...(Platform.OS !== 'web' ? { justifyContent: 'flex-end' } : {}),
        margin: 0,
        padding: 0
        //https://github.com/react-native-modal/react-native-modal/issues/147
        //statusBarTranslucent does the trick
        //backgroundColor: 'red'
      }}
    >
      <KeyboardAvoidingView behavior="position">
        {/*behavior="padding" makes it randomly flicker on android(1px up & down) when the keyboard is dismissed*/}
        <GestureHandlerRootView>
          <PanGestureHandler onGestureEvent={gestureHandler}>
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
                        fontSize: 120,
                        paddingLeft: 30,
                        paddingTop: 15
                      }}
                      name={icon.name}
                    />
                  ) : null}
                  <Text
                    className={`${ubuntuLoaded ? "font-['Ubuntu700Bold']" : ''} uppercase opacity-90 absolute ${subTitle ? 'top-[30%]' : 'top-[60%]'} pl-4 text-xl mobmed:text-2xl mobmed:px-8 text-white overflow-hidden whitespace-nowrap overflow-ellipsis w-full`}
                  >
                    {title}
                  </Text>
                  {subTitle && (
                    <Text
                      className={`${ubuntuLoaded ? "font-['Ubuntu500Medium']" : ''} opacity-85 absolute top-[60%] w-full left-0 px-4 mobmed:px-8 text-white`}
                    >
                      {subTitle}
                    </Text>
                  )}
                  {
                    //A bar as a hint to the user this is draggable
                    //Don't show on web
                    Platform.select({
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
                    })
                  }
                </View>

                <ScrollView
                  keyboardShouldPersistTaps="handled"
                  style={{ alignSelf: 'stretch' }}
                  contentContainerStyle={{
                    flexGrow: 1,
                    paddingVertical: scrollViewPaddingVertical,
                    paddingHorizontal: 8,
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
          </PanGestureHandler>
        </GestureHandlerRootView>
      </KeyboardAvoidingView>
    </RNModal>
  );
};

export { Modal };
