import React, { useRef, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  Animated,
  LayoutChangeEvent
} from 'react-native';
import { useTheme } from '../theme';

const TabBar = ({
  tabs,
  activeTab,
  onActiveTab
}: {
  tabs: Array<string>;
  activeTab: number;
  onActiveTab: (activeTab: number) => void;
}) => {
  const theme = useTheme();
  const measurements = useRef<
    Array<{
      width: number;
      x: number;
    }>
  >([]);
  const underlineTranslateX = useRef(new Animated.Value(0)).current;
  const underlineScaleX = useRef(new Animated.Value(1)).current;

  const isInit = useRef<boolean>(false);
  const handleLayout = (index: number) => (event: LayoutChangeEvent) => {
    let { width, x } = event.nativeEvent.layout;
    width -= 2 * 3 * 4; //compoensate for the padding: px-3
    x += 3 * 4; //compoensate for the padding: px-3
    measurements.current[index] = { width, x };
    if (!isInit.current && index === activeTab) {
      const initialTab = tabs[activeTab];
      if (initialTab === undefined) throw new Error('Invalid initial tab');

      updateActiveTab(initialTab);
      isInit.current = true;
    }
  };

  const updateActiveTab = useCallback(
    (tab: string) => {
      const newIndex = tabs.indexOf(tab);
      if (measurements.current[newIndex]) {
        const measurement = measurements.current[newIndex];
        if (!measurement) throw new Error('no measurements for index');
        const newWidth = measurement.width;
        const newX = measurement.x;
        Animated.parallel([
          Animated.timing(underlineTranslateX, {
            toValue: newX,
            duration: 200,
            useNativeDriver: true
          }),
          Animated.timing(underlineScaleX, {
            toValue: newWidth,
            duration: 200,
            useNativeDriver: true
          })
        ]).start();
        onActiveTab(newIndex);
      }
    },
    [tabs, underlineScaleX, underlineTranslateX, onActiveTab]
  );

  return (
    <View>
      <View className="flex-1 flex-row relative">
        {tabs.map((tab, index) => (
          <Pressable
            key={tab}
            onPress={() => updateActiveTab(tab)}
            onLayout={handleLayout(index)}
            className={`px-3 py-4 active:bg-primary-light hover:bg-primary-light`}
          >
            <Text
              className={`font-bold ${activeTab === index ? 'text-primary-dark' : 'text-slate-500'}`}
            >
              {tab}
            </Text>
          </Pressable>
        ))}
      </View>
      <Animated.View
        style={{
          height: 2,
          backgroundColor: theme.colors.primary,
          position: 'absolute',
          bottom: 0,
          width: 1,
          transform: [
            {
              translateX: Animated.add(
                underlineTranslateX,
                Animated.divide(underlineScaleX, 2)
              )
            },

            { scaleX: underlineScaleX }
          ]
        }}
      />
    </View>
  );
};

export default TabBar;
