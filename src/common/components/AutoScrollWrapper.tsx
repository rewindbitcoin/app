import React, { useEffect, useRef } from 'react';
import { ScrollView } from 'react-native';

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
  const scrollRef = useRef<ScrollView>(null);
  const contentWidth = useRef(0);
  const containerWidth = useRef(0);

  useEffect(() => {
    console.log(contentWidth.current, containerWidth.current);
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
    return;
  }, [enabled, duration, delay]);

  if (!enabled) return <>{children}</>;

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      scrollEventThrottle={16}
      contentContainerClassName="min-w-full"
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
