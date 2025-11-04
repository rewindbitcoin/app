// Copyright (C) 2025 Jose-Luis Landabaso - https://rewindbitcoin.com
// Licensed under the GNU GPL v3 or later. See the LICENSE file for details.

import { AntDesign } from '@expo/vector-icons';
import React, { useEffect, useMemo, useRef } from 'react';
import { useTheme } from '../../common/ui';
import { Animated, Easing, Platform, View } from 'react-native';

export default function RefreshIconAnimated({
  syncingOrFaucetPendingOrExplorerConnecting,
  hasTouch,
  userTriggeredRefresh,
  size
}: {
  syncingOrFaucetPendingOrExplorerConnecting: boolean;
  hasTouch: boolean;
  userTriggeredRefresh: boolean;
  size: number;
}) {
  const theme = useTheme();
  const shouldSpin = useMemo(
    () =>
      (!hasTouch || !userTriggeredRefresh) &&
      syncingOrFaucetPendingOrExplorerConnecting,
    [hasTouch, userTriggeredRefresh, syncingOrFaucetPendingOrExplorerConnecting]
  );

  const rotate = useRef(new Animated.Value(0)).current;
  const loopRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (shouldSpin) {
      // Reinicia y arranca el loop
      loopRef.current?.stop();
      rotate.setValue(0);
      loopRef.current = Animated.loop(
        Animated.timing(rotate, {
          toValue: 1,
          duration: 900,
          easing: Easing.linear,
          useNativeDriver: Platform.OS !== 'web', // native iOS/Android
          isInteraction: false
        })
      );
      loopRef.current.start();
    } else {
      // Stops and resets at 0deg
      loopRef.current?.stop();
      rotate.stopAnimation();
      rotate.setValue(0);
    }
    return () => {
      loopRef.current?.stop();
    };
  }, [shouldSpin, rotate]);

  const spin = rotate.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg']
  });

  return (
    <View pointerEvents="none">
      {shouldSpin ? (
        <Animated.View style={{ transform: [{ rotate: spin }] }}>
          <AntDesign name="loading1" size={size} color={theme.colors.primary} />
        </Animated.View>
      ) : (
        <AntDesign name="reload1" size={size} color={theme.colors.primary} />
      )}
    </View>
  );
}
