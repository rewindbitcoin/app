// Copyright (C) 2025 Jose-Luis Landabaso - https://rewindbitcoin.com
// Licensed under the GNU GPL v3 or later. See the LICENSE file for details.

//This will only affect iOS:

import React, { forwardRef } from 'react';
import { KeyboardAwareScrollView as RNKASV } from 'react-native-keyboard-aware-scroll-view';
import { Platform, ScrollView, ScrollViewProps } from 'react-native';

const KeyboardAwareScrollView = forwardRef<ScrollView, ScrollViewProps>(
  (props, ref) => {
    // RNKASV uses innerRef
    const innerRef = (element: ScrollView): void => {
      const scrollEl = element as unknown as ScrollView;
      if (typeof ref === 'function') ref(scrollEl);
      else if (ref && typeof ref === 'object') ref.current = scrollEl;
    };

    // On iOS use KeyboardAwareScrollView (which uses innerRef)
    if (Platform.OS === 'ios') return <RNKASV {...props} innerRef={innerRef} />;
    // On other platforms use ScrollView with normal ref directly
    else return <ScrollView {...props} ref={ref} />;
  }
);
KeyboardAwareScrollView.displayName = 'KeyboardAwareScrollView';

export { KeyboardAwareScrollView };

import Animated from 'react-native-reanimated';

const KeyboardAwareAnimatedScrollView =
  Platform.OS === 'ios'
    ? Animated.createAnimatedComponent(KeyboardAwareScrollView)
    : Animated.ScrollView;

export { KeyboardAwareAnimatedScrollView };
