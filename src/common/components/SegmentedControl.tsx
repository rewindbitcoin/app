// Forked from: https://github.com/Karthik-B-06/react-native-segmented-control
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring
} from 'react-native-reanimated';
import { useTheme, Theme } from '../theme';

interface SegmentedControlProps {
  /**
   * The Segments Text Array
   */
  segments: Array<string>;
  /**
   * The Current Active Segment Index
   */
  currentIndex: number;
  /**
   * A callback onPress of a Segment
   */
  onChange: (index: number) => void;
  /**
   * Is right-to-left mode.
   */
  isRTL?: boolean;
  /**
   * Active Segment Text Style
   */
  activeTextStyle?: TextStyle;
  /**
   * InActive Segment Text Style
   */
  inactiveTextStyle?: TextStyle;
  /**
   * Segment Container Styles
   */
  style?: ViewStyle;
  /**
   * Pressable Container Styles
   */
  pressableWrapper?: ViewStyle;
  /**
   * The moving Tile Container Styles
   */
  tileStyle?: ViewStyle;
  /**
   * Active Badge Styles
   */
  activeBadgeStyle?: ViewStyle;
  /**
   * Inactive Badge Styles
   */
  inactiveBadgeStyle?: ViewStyle;
  /**
   * Badge Text Styles
   */
  badgeTextStyle?: TextStyle;
}

const defaultShadowStyle = {
  shadowColor: '#000',
  shadowOffset: {
    width: 1,
    height: 1
  },
  shadowOpacity: 0.025,
  shadowRadius: 1,

  elevation: 1
};

const DEFAULT_SPRING_CONFIG = {
  stiffness: 150,
  damping: 20,
  mass: 1,
  overshootClamping: false,
  restSpeedThreshold: 0.001,
  restDisplacementThreshold: 0.001
};

const SegmentedControl: React.FC<SegmentedControlProps> = ({
  segments,
  currentIndex,
  onChange,
  isRTL = false,
  activeTextStyle,
  inactiveTextStyle,
  style,
  pressableWrapper,
  tileStyle
}: SegmentedControlProps) => {
  const theme = useTheme();
  const [width, setWidth] = useState<number>(0);
  //const width = widthPercentageToDP('100%') - containerMargin * 2;
  const translateValue = width / segments.length;
  const tabTranslateValue = useSharedValue(0);

  // useCallBack with an empty array as input, which will call inner lambda only once and memoize the reference for future calls
  const memoizedTabPressCallback = React.useCallback(
    (index: number) => () => {
      if (index !== currentIndex) onChange(index);
    },
    [onChange, currentIndex]
  );
  const prevIndex = useRef<number>(currentIndex);
  useEffect(() => {
    if (prevIndex.current !== currentIndex) {
      prevIndex.current = currentIndex;
      // If phone is set to RTL, make sure the animation does the correct transition.
      const transitionMultiplier = isRTL ? -1 : 1;
      tabTranslateValue.value = withSpring(
        currentIndex * (translateValue * transitionMultiplier),
        DEFAULT_SPRING_CONFIG
      );
    }
  }, [currentIndex, isRTL, tabTranslateValue, translateValue]);

  const tabTranslateAnimatedStyles = useAnimatedStyle(() => {
    return {
      transform: [{ translateX: tabTranslateValue.value }]
    };
  });

  const finalisedActiveTextStyle: TextStyle = {
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    color: theme.colors.text, //'#111827',
    //color: theme.colors.white,
    ...activeTextStyle
  };

  const finalisedInActiveTextStyle: TextStyle = {
    fontSize: 16,
    textAlign: 'center',
    color: '#4b5563',
    ...inactiveTextStyle
  };

  const styles = useMemo(() => getStyles(theme), [theme]);
  return (
    <Animated.View
      style={[styles.defaultSegmentedControlWrapper, style]}
      onLayout={e => setWidth(e.nativeEvent.layout.width)}
    >
      <Animated.View
        style={[
          styles.movingSegmentStyle,
          defaultShadowStyle,
          tileStyle,
          StyleSheet.absoluteFill,
          {
            width: width / segments.length - 4
          },
          tabTranslateAnimatedStyles
        ]}
      />
      {segments.map((segment, index) => {
        const textStyle =
          currentIndex === index
            ? finalisedActiveTextStyle
            : finalisedInActiveTextStyle;
        return (
          <Pressable
            onPress={memoizedTabPressCallback(index)}
            key={index}
            hitSlop={20}
            style={[styles.touchableContainer, pressableWrapper]}
          >
            <View style={styles.textWrapper}>
              <Text style={textStyle} numberOfLines={1}>
                {segment}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </Animated.View>
  );
};

const getStyles = (theme: Theme) =>
  StyleSheet.create({
    defaultSegmentedControlWrapper: {
      position: 'relative',
      display: 'flex',
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: 8,
      backgroundColor: theme.colors.darkerBackground
    },
    touchableContainer: {
      //flex: 1,
      elevation: 9,
      height: '100%',
      paddingHorizontal: 16
    },
    textWrapper: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center'
    },
    movingSegmentStyle: {
      top: 0,
      marginVertical: 2,
      marginHorizontal: 2,
      borderRadius: 6,
      backgroundColor: theme.colors.white //'#e9e9e9'
    },
    // Badge Styles
    defaultBadgeContainerStyle: {
      alignItems: 'center',
      justifyContent: 'center',
      height: 16,
      width: 16,
      borderRadius: 9999,
      alignContent: 'flex-end'
    }
  });

export default SegmentedControl;
