import React, { useEffect, useRef, useState } from 'react';
import { View, Animated, Easing, ScrollView } from 'react-native';

export default function AutoScrollWrapper({
  children
}: {
  children: React.ReactNode;
}) {
  const scrollRef = useRef<ScrollView>(null);
  const [measurements, setMeasurements] = useState({
    contentWidth: 0,
    containerWidth: 0
  });
  const scrollX = useRef(new Animated.Value(0)).current;

  // Only scroll if content is wider than container (with a small tolerance)
  const shouldScroll =
    measurements.contentWidth > measurements.containerWidth + 8;

  useEffect(() => {
    let scrolling = true;

    if (shouldScroll) {
      const animateScroll = async () => {
        const delay = 1500;
        const duration = 2000;
        while (scrolling) {
          // Wait initial delay before scrolling
          await new Promise(resolve => setTimeout(resolve, delay));

          // Animate scroll to the end (offset = contentWidth - containerWidth)
          await new Promise(resolve => {
            Animated.timing(scrollX, {
              toValue: measurements.contentWidth - measurements.containerWidth,
              duration,
              easing: Easing.linear,
              useNativeDriver: false
            }).start(() => resolve(true));
          });

          // Wait at end
          await new Promise(resolve => setTimeout(resolve, delay));

          // Animate scroll back to start (offset = 0)
          await new Promise(resolve => {
            Animated.timing(scrollX, {
              toValue: 0,
              duration,
              easing: Easing.linear,
              useNativeDriver: false
            }).start(() => resolve(true));
          });
        }
      };

      animateScroll();
    }

    return () => {
      scrolling = false;
    };
  }, [shouldScroll, measurements, scrollX]);

  // Listen to the animated value and update the scroll position accordingly.
  useEffect(() => {
    const listenerId = scrollX.addListener(({ value }) => {
      scrollRef.current?.scrollTo({ x: value, animated: false });
    });
    return () => {
      scrollX.removeListener(listenerId);
    };
  }, [scrollX]);

  return (
    <Animated.ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      scrollEventThrottle={16}
      onLayout={e => {
        if (e.nativeEvent) {
          const event = e.nativeEvent;
          setMeasurements(prev => ({
            ...prev,
            containerWidth: event.layout.width
          }));
        }
      }}
    >
      <View
        className="justify-center"
        onLayout={e => {
          if (e.nativeEvent) {
            const event = e.nativeEvent;
            setMeasurements(prev => ({
              ...prev,
              contentWidth: event.layout.width
            }));
          }
        }}
      >
        {children}
      </View>
    </Animated.ScrollView>
  );
}
