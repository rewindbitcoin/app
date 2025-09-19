import React, { useEffect, useRef, useCallback } from 'react';
import { Animated, Easing, Platform, AppState, ViewStyle } from 'react-native';

type Props = {
  active: boolean;
  style?: ViewStyle | ViewStyle[];
  color?: string; // default ~ slate-200
  minOpacity?: number; // 0.45
  maxOpacity?: number; // 1
  duration?: number; // 1200
  borderRadius?: number; // 6
  children?: React.ReactNode;
};

export default function SkeletonPulse({
  active,
  style,
  color = 'rgba(226,232,240,1)',
  minOpacity = 0.45,
  maxOpacity = 1,
  duration = 1200,
  borderRadius = 6,
  children
}: Props) {
  const phase = useRef(new Animated.Value(0)).current;
  const loopRef = useRef<Animated.CompositeAnimation | null>(null);

  const start = useCallback(() => {
    loopRef.current?.stop();
    phase.setValue(0);
    loopRef.current = Animated.loop(
      Animated.timing(phase, {
        toValue: 1,
        duration,
        easing: Easing.linear,
        useNativeDriver: Platform.OS !== 'web',
        isInteraction: false
      }),
      { iterations: -1, resetBeforeIteration: true }
    );
    loopRef.current.start();
  }, [phase, duration]);

  const stop = useCallback(() => {
    loopRef.current?.stop();
    phase.stopAnimation();
  }, [phase]);

  useEffect(() => {
    if (active) start();
    else {
      stop();
      phase.setValue(1);
    }
    return () => stop();
  }, [active, start, stop, phase]);

  // Re-arm after Face ID / app inactive → active
  useEffect(() => {
    const sub = AppState.addEventListener('change', s => {
      if (s === 'active' && active) start();
    });
    return () => sub.remove();
  }, [active, start]);

  // Triangle wave: 0..0.5 fades in, 0.5..1 fades out
  const opacity = phase.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [minOpacity, maxOpacity, minOpacity],
    extrapolate: 'clamp'
  });

  return (
    <Animated.View
      style={[
        active ? { backgroundColor: color, borderRadius, opacity } : {},
        style
      ]}
      pointerEvents="none"
    >
      {children}
    </Animated.View>
  );
}
