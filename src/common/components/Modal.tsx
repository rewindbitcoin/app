import React, { useEffect, useRef, useState } from 'react';
import { View, Platform, KeyboardAvoidingView } from 'react-native';
import RNModal from 'react-native-modal';
import { Button } from './Button';
import { useTheme } from '../theme';
import { Text } from './Text';
import * as Icons from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { rgba } from 'polished';

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

interface ModalProps {
  title: string;
  subTitle?: string;
  isVisible: boolean;
  icon?: { family: keyof typeof Icons; name: string };
  hideCloseButton?: boolean;
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
  hideCloseButton = false,
  title,
  subTitle,
  children
}) => {
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
      <KeyboardAvoidingView behavior="padding">
        <GestureHandlerRootView>
          <PanGestureHandler onGestureEvent={gestureHandler}>
            <Animated.View style={animatedStyle}>
              <View
                style={{
                  height: Math.min(
                    450,
                    childrenHeight + buttonHeight + headerHeight
                  ),
                  borderRadius: 20,
                  overflow: 'hidden',
                  marginBottom: 20,
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
                        opacity: subTitle ? 0.05 : 0.1,
                        fontSize: 120,
                        paddingLeft: 30,
                        paddingTop: 15
                      }}
                      name={icon.name}
                    />
                  ) : null}
                  <Text
                    style={{
                      color: theme.colors.white,
                      opacity: 0.9,
                      position: 'absolute',
                      top: subTitle ? '30%' : '60%',
                      left: 30,
                      fontSize: 22,
                      fontWeight: 'bold'
                    }}
                  >
                    {title}
                  </Text>
                  {subTitle && (
                    <Text
                      style={{
                        color: theme.colors.white,
                        opacity: 0.8,
                        position: 'absolute',
                        top: '60%',
                        left: 0,
                        paddingLeft: 30,
                        paddingRight: 30,
                        fontSize: 14
                      }}
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
                  <View
                    onLayout={event => {
                      const height = event.nativeEvent.layout.height;
                      setChildrenHeight(height + scrollViewPaddingVertical * 2);
                    }}
                  >
                    {children}
                  </View>
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
                {onClose && !hideCloseButton ? (
                  <View
                    style={{ paddingVertical: 20 }}
                    onLayout={event => {
                      setButtonHeight(event.nativeEvent.layout.height);
                    }}
                  >
                    <Button onPress={handleClose}>
                      {closeButtonText || 'Understood'}
                    </Button>
                  </View>
                ) : null}
              </View>
            </Animated.View>
          </PanGestureHandler>
        </GestureHandlerRootView>
      </KeyboardAvoidingView>
    </RNModal>
  );
};

export { Modal };
