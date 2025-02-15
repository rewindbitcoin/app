import React, { useEffect, useRef } from 'react';
import { Animated, View, StyleSheet } from 'react-native';

export default function AutoScrollWrapper({
  children,
  enabled,
  duration = 3000,
  delay = 1000
}: {
  children: React.ReactNode;
  enabled: boolean;
  duration?: number;
  delay?: number;
}) {
  const scrollX = useRef(new Animated.Value(0)).current;
  const contentWidth = useRef(0);
  const containerWidth = useRef(0);

  useEffect(() => {
    if (enabled && contentWidth.current > containerWidth.current) {
      const animate = () => {
        Animated.sequence([
          Animated.timing(scrollX, {
            toValue: -(contentWidth.current - containerWidth.current),
            duration: duration,
            useNativeDriver: true,
            delay: delay
          }),
          Animated.timing(scrollX, {
            toValue: 0,
            duration: duration,
            useNativeDriver: true,
            delay: delay
          })
        ]).start(() => animate());
      };
      animate();
    }
  }, [enabled, scrollX, duration, delay]);

  if (!enabled) return <>{children}</>;

  return (
    <View
      style={styles.container}
      onLayout={(e) => {
        containerWidth.current = e.nativeEvent.layout.width;
      }}
    >
      <Animated.View
        style={[styles.content, { transform: [{ translateX: scrollX }] }]}
        onLayout={(e) => {
          contentWidth.current = e.nativeEvent.layout.width;
        }}
      >
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    flex: 1
  },
  content: {
    flexDirection: 'row'
  }
});
