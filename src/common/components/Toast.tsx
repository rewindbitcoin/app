// Copyright (C) 2025 Jose-Luis Landabaso - https://rewindbitcoin.com
// Licensed under the GNU GPL v3 or later. See the LICENSE file for details.

import React from 'react';
import { StyleProps } from 'react-native-reanimated';

import {
  Toast,
  useToast,
  ToastProvider as ToastProviderOriginal
} from 'react-native-toast-notifications';

const defaultPlacement = 'top';
const textStyle = {
  maxWidth:
    '100%' /*solves an issue with long words in text which were not beig correctly broken*/
} as StyleProps;

const ToastProvider: React.FC<{ children: React.ReactNode }> = ({
  children
}) => {
  return (
    <ToastProviderOriginal
      duration={6000}
      placement={defaultPlacement}
      offsetBottom={30}
      textStyle={textStyle}
    >
      {children}
    </ToastProviderOriginal>
  );
};
export { Toast, ToastProvider, useToast };
