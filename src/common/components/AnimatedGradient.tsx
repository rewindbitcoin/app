import React, { useRef, useEffect } from 'react';
import { StyleSheet, Animated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

const AnimatedLinearGradient = Animated.createAnimatedComponent(LinearGradient);

type BackgroundProps = {
  children: React.ReactNode;
};

export default function Background({ children }: BackgroundProps) {
  const opacity1 = useRef(new Animated.Value(1)).current;
  const opacity2 = useRef(new Animated.Value(0)).current;

  const animateGradient = () => {
    // One gradient starts fading out before the other completely fades in
    Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(opacity1, {
            toValue: 0,
            duration: 5000,
            useNativeDriver: true
          }),
          Animated.timing(opacity2, {
            toValue: 1,
            duration: 5000,
            useNativeDriver: true
          })
        ]),
        Animated.parallel([
          Animated.timing(opacity1, {
            toValue: 1,
            duration: 5000,
            useNativeDriver: true
          }),
          Animated.timing(opacity2, {
            toValue: 0,
            duration: 5000,
            useNativeDriver: true
          })
        ])
      ])
    ).start();
  };

  useEffect(() => {
    animateGradient();
  }, []);

  return (
    <>
      <AnimatedLinearGradient
        colors={['#6E27C5', '#A734C4', '#F76D57', '#FFD166']}
        style={[styles.background, { opacity: opacity1 }]}
      />
      <AnimatedLinearGradient
        colors={['#FFD166', '#F76D57', '#A734C4', '#6E27C5']}
        style={[styles.background, { opacity: opacity2 }]}
      />
      {children}
    </>
  );
}

const styles = StyleSheet.create({
  background: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: '100%',
    width: '100%'
  }
});
