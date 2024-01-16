import React, { useEffect, useRef } from 'react';
import { View, Platform } from 'react-native';
import RNModal from 'react-native-modal';
import { Button } from './Button';
import { Text } from './Text';
import {
  GestureHandlerRootView,
  PanGestureHandler,
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
  isVisible: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

const Modal: React.FC<ModalProps> = ({
  isVisible,
  onClose,
  title,
  children
}) => {
  const translateY = useSharedValue(0);

  const onCloseTriggered = useRef<boolean>(false);

  const gestureHandler = useAnimatedGestureHandler({
    onStart: (_, ctx: { startY: number }) => {
      console.log('onStart');
      ctx.startY = translateY.value;
    },
    onActive: (event, ctx) => {
      translateY.value = ctx.startY + event.translationY;
      if (translateY.value > 50 && onClose) {
        runOnJS(onClose)();
      }
    },
    onEnd: _ => {
      if (!onCloseTriggered.current)
        translateY.value = withSpring(0, {
          damping: 30, // Higher for less bounce
          stiffness: 500 // Higher for faster animation
        });
    },
    onCancel: _ => {
      if (!onCloseTriggered.current)
        translateY.value = withSpring(0, {
          damping: 30, // Higher for less bounce
          stiffness: 500 // Higher for faster animation
        });
    }
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
    onClose();
    window.setTimeout(() => {
      translateY.value = 0;
    }, 300);
  };
  useEffect(() => {
    if (isVisible) {
      onCloseTriggered.current = false;
      translateY.value = 0;
      console.log('setting translate to 0');
    }
  }, [isVisible]);
  return (
    <RNModal
      {...(Platform.OS === 'android'
        ? { deviceHeight: getRealWindowHeight() }
        : {})}
      statusBarTranslucent
      isVisible={isVisible}
      avoidKeyboard={true}
      animationInTiming={150}
      animationOutTiming={150}
      backdropTransitionInTiming={150}
      backdropOpacity={0.3}
      backdropTransitionOutTiming={150}
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
      <GestureHandlerRootView>
        <PanGestureHandler onGestureEvent={gestureHandler}>
          <Animated.View style={animatedStyle}>
            <View
              style={{
                maxHeight: 200,
                padding: 20,
                //flex: 0.5, //50% height
                borderRadius: 5,
                margin: 30,
                maxWidth: 400,
                alignSelf: 'center',
                backgroundColor: 'white',
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
              <Text>{title}</Text>
              <ScrollView>{children}</ScrollView>
              <Button onPress={handleClose}>Close</Button>
            </View>
          </Animated.View>
        </PanGestureHandler>
      </GestureHandlerRootView>
    </RNModal>
  );
};

export { Modal };
