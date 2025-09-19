//import React from 'react';
//import { ActivityIndicator as RNAI } from 'react-native';
//import { useTheme } from '../theme';
//
//const ActivityIndicator = ({
//  size = 'small'
//}: {
//  size?: 'large' | 'small';
//}) => {
//  const theme = useTheme();
//  return <RNAI size={size} color={theme.colors.primary} />;
//};
//
//export default ActivityIndicator;

////The problem with the implementation below is that it runs as a JS task
////and in old devices the animation is stuck when doing expensive background
////taks in the background
//
//import React from 'react';
//import { View } from 'react-native';
//import { Svg, Path, Circle } from 'react-native-svg';
//const ActivityIndicator = ({
//  size = 'small'
//}: {
//  size?: 'large' | 'small';
//}) => {
//  return (
//    //See the View container style of the native ActivityIndicator component.
//    //Also the sizes:
//    //https://github.com/facebook/react-native/blob/19971092b6fe3ff0d2f1e7666d6adb8018ab68a9/packages/react-native/Libraries/Components/ActivityIndicator/ActivityIndicator.js#L162
//    <View className="items-center justify-center">
//      <Svg
//        className={`animate-spin text-primary`}
//        width={size === 'small' ? 20 : 36}
//        height={size === 'small' ? 20 : 36}
//        fill="none"
//        viewBox="0 0 24 24"
//      >
//        <Circle
//          opacity={0.25}
//          cx="12"
//          cy="12"
//          r="10"
//          stroke="currentColor"
//          strokeWidth="4"
//        ></Circle>
//        <Path
//          opacity={0.75}
//          fill="currentColor"
//          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
//        ></Path>
//      </Svg>
//    </View>
//  );
//};
//
//export default React.memo(ActivityIndicator);

import React, { useEffect, useMemo, useRef } from 'react';
import { View, Animated, Easing } from 'react-native';
import { useTheme } from '../theme';
import { rgba } from 'polished';

export default function RNAnimatedSpinner({
  size = 'small'
}: {
  size?: 'small' | 'large';
}) {
  const theme = useTheme();
  const rotate = useRef(new Animated.Value(0)).current;
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const loop = Animated.loop(
      Animated.timing(rotate, {
        toValue: 1,
        duration: 900,
        easing: Easing.linear,
        useNativeDriver: true,
        isInteraction: false // doesn't block gestures/transitions
      })
    );
    loop.start();

    return () => loop.stop();
  }, [rotate]);

  const spin = rotate.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg']
  });

  const px = size === 'small' ? 20 : 36;
  const primary = theme.colors.primary;
  // Track tenue según tema (puedes cambiarlo por tu color de “outline/border” si lo tienes en el theme)
  const activeColor = useMemo(() => rgba(primary, 0.75), [primary]);
  const trackColor = useMemo(() => rgba(primary, 0.25), [primary]);

  return (
    <View
      style={{ alignItems: 'center', justifyContent: 'center' }}
      pointerEvents="none"
    >
      <Animated.View
        style={{
          width: px,
          height: px,
          borderRadius: px / 2,
          borderWidth: 4,
          // “donut” style ActivityIndicator
          borderTopColor: activeColor,
          borderRightColor: trackColor,
          borderBottomColor: trackColor,
          borderLeftColor: trackColor,
          transform: [{ rotate: spin }]
        }}
      />
    </View>
  );
}
