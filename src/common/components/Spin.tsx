//import React from 'react';
//import { Svg, Path, Circle } from 'react-native-svg';
//
//const Spin = ({ className }: { className?: string }) => (
//  <Svg
//    className={`animate-spin ${className}`}
//    width={20}
//    height={20}
//    fill="none"
//    viewBox="0 0 24 24"
//  >
//    <Circle
//      opacity={0.25}
//      cx="12"
//      cy="12"
//      r="10"
//      stroke="currentColor"
//      strokeWidth="4"
//    ></Circle>
//    <Path
//      opacity={0.75}
//      fill="currentColor"
//      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
//    ></Path>
//  </Svg>
//);
//
//export default Spin;

import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Platform } from 'react-native';
import { Svg, Path, Circle } from 'react-native-svg';

const AnimatedSvg = Animated.createAnimatedComponent(Svg);

const Spin = ({ className }: { className?: string }) => {
  const rot = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(rot, {
        toValue: 1,
        duration: 900,
        easing: Easing.linear,
        useNativeDriver: Platform.OS !== 'web',
        isInteraction: false
      })
    );
    loop.start();
    return () => loop.stop();
  }, [rot]);

  const spin = rot.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg']
  });

  return (
    <AnimatedSvg
      {...(className ? { className } : {})}
      width={20}
      height={20}
      fill="none"
      viewBox="0 0 24 24"
      style={{ transform: [{ rotate: spin }] }} // rotamos el propio SVG
    >
      <Circle
        opacity={0.25}
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <Path
        opacity={0.75}
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </AnimatedSvg>
  );
};

export default Spin;
