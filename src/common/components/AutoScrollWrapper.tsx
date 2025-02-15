import React, { useEffect, useRef } from 'react';
import { ScrollView, ViewStyle } from 'react-native';

export default function AutoScrollWrapper({
  children,
  enabled,
  duration = 3000,
  delay = 1000,
  style
}: {
  children: React.ReactNode;
  enabled: boolean;
  duration?: number;
  delay?: number;
  style?: ViewStyle;
}) {
  const scrollRef = useRef<ScrollView>(null);
  const contentWidth = useRef(0);
  const containerWidth = useRef(0);

  useEffect(() => {
    if (enabled && contentWidth.current > containerWidth.current) {
      let scrolling = true;
      const scroll = async () => {
        while (scrolling) {
          // Wait initial delay
          await new Promise(resolve => setTimeout(resolve, delay));

          // Scroll to end
          scrollRef.current?.scrollToEnd({ animated: true, duration });

          // Wait at end
          await new Promise(resolve => setTimeout(resolve, delay));

          // Scroll back to start
          scrollRef.current?.scrollTo({ x: 0, animated: true, duration });
        }
      };

      scroll();
      return () => {
        scrolling = false;
      };
    }
  }, [enabled, duration, delay]);

  if (!enabled) return <>{children}</>;

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      style={style}
      showsHorizontalScrollIndicator={false}
      scrollEventThrottle={16}
      onLayout={e => {
        containerWidth.current = e.nativeEvent.layout.width;
      }}
      onContentSizeChange={width => {
        contentWidth.current = width;
      }}
    >
      {children}
    </ScrollView>
  );
}
