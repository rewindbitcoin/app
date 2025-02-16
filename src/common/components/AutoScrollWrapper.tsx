import React, { useEffect, useRef, useState } from 'react';
import { View, ScrollView } from 'react-native';

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
  const [measurements, setMeasurements] = useState({
    contentWidth: 0,
    containerWidth: 0
  });

  const shouldScroll = enabled && measurements.contentWidth > measurements.containerWidth + 4;

  useEffect(() => {
    if (shouldScroll) {
      let scrolling = true;
      const scroll = async () => {
        while (scrolling) {
          // Wait initial delay
          await new Promise(resolve => setTimeout(resolve, delay));

          // Scroll to end
          scrollRef.current?.scrollToEnd({ animated: true });

          // Wait at end
          await new Promise(resolve => setTimeout(resolve, delay));

          // Scroll back to start
          scrollRef.current?.scrollTo({ x: 0, animated: true });
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
      contentContainerClassName="grow"
      onLayout={e => {
        const event = e.nativeEvent;
        if (event?.layout) {
          setMeasurements(prev => ({
            ...prev,
            containerWidth: event.layout.width
          }));
        }
      }}
    >
      <View
        className="min-w-full"
        onLayout={e => {
          const event = e.nativeEvent;
          if (event?.layout) {
            setMeasurements(prev => ({
              ...prev,
              contentWidth: event.layout.width
            }));
          }
        }}
      >
        {children}
      </View>
    </ScrollView>
  );
}
