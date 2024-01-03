import React, { useRef, useEffect } from 'react';
import { StyleSheet, Animated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

const AnimatedLinearGradient = Animated.createAnimatedComponent(LinearGradient);

type BackgroundProps = {
  children: React.ReactNode;
};

const DURATION = 10000;
const PURPLE = '#6E27C5';
const MAGENTA = '#A734C4';
const RED = '#F76D57';
const YELLOW = '#FFD166';
export default function Background({ children }: BackgroundProps) {
  const opacity1 = useRef(new Animated.Value(1)).current; // Initially visible
  const opacity2 = useRef(new Animated.Value(0)).current; // Initially hidden
  const rotate1 = useRef(new Animated.Value(0)).current; // In degrees

  useEffect(() => {
    const fadeInFirstGradient = Animated.timing(opacity1, {
      toValue: 1,
      duration: DURATION,
      useNativeDriver: true
    });
    const fadeOutFirstGradient = Animated.timing(opacity1, {
      toValue: 0,
      duration: DURATION,
      useNativeDriver: true
    });
    const rotateInFirstGradient = Animated.timing(rotate1, {
      toValue: 180,
      duration: DURATION,
      useNativeDriver: true
    });
    const rotateOutFirstGradient = Animated.timing(rotate1, {
      toValue: 360,
      duration: DURATION,
      useNativeDriver: true
    });

    const fadeInSecondGradient = Animated.timing(opacity2, {
      toValue: 1,
      duration: DURATION,
      useNativeDriver: true
    });
    const fadeOutSecondGradient = Animated.timing(opacity2, {
      toValue: 0,
      duration: DURATION,
      useNativeDriver: true
    });

    // Looping the animation continuously
    Animated.loop(
      Animated.sequence([
        Animated.parallel([
          fadeOutFirstGradient,
          fadeInSecondGradient,
          rotateInFirstGradient
        ]),
        Animated.parallel([
          fadeInFirstGradient,
          fadeOutSecondGradient,
          rotateOutFirstGradient
        ])
      ])
    ).start();
  }, []);

  return (
    <>
      <AnimatedLinearGradient
        colors={[YELLOW, PURPLE, RED, MAGENTA]}
        style={[
          styles.background,
          { opacity: opacity1 },
          {
            transform: [
              {
                rotate: rotate1.interpolate({
                  inputRange: [0, 360],
                  outputRange: ['0deg', '360deg']
                })
              }
            ]
          }
        ]}
      />
      <AnimatedLinearGradient
        colors={[RED, YELLOW, MAGENTA, PURPLE]}
        style={[styles.background, { opacity: opacity2 }]}
      />
      {children}
    </>
  );
}

const styles = StyleSheet.create({
  background: {
    position: 'absolute',
    left: '-100%',
    right: '-100%',
    top: '-100%',
    bottom: '-100%'
    //left: 0,
    //right: 0,
    //top: 0,
    //bottom: 0
  }
});
