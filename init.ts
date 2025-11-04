// Copyright (C) 2025 Jose-Luis Landabaso - https://rewindbitcoin.com
// Licensed under the GNU GPL v3 or later. See the LICENSE file for details.

import React from 'react';
import { Text, TextInput, TextInputProps, TextProps } from 'react-native';

/*
 * Fix Android text clipping bug when the Accessibility "Bold text" setting is
 * on.
 * RN may measure text with one font while Android renders with another
 * (OEM font swaps or synthesized bold). Metric mismatches
 * (ascent/descent/advance) can clip some words or letters.
 * Forcing `fontFamily: 'sans-serif'` makes measurement and rendering use the same
 * family, stabilizing metrics across devices and OEM skins.
 *
 * Note: on certified Android devices, 'sans-serif' maps to Roboto.
 * OEMs may ship different UI fonts, but the system sans remains available.
 *
 * See some related issues:
 * https://github.com/facebook/react-native/issues/15114
 * https://github.com/facebook/react-native/issues/53286
 * https://github.com/facebook/react-native/issues/21729
 *
 * How to reproduce:
 * 1) On a TCL T610K device, set the system text size to the second-largest
 * option.
 * 2) Enable the system "Bold text" accessibility setting.
 * 3) Open the app (Spanish locale). The string "Aprende qué son las Bóvedas"
 *    gets clipped; "Bóvedas" is not fully visible. Many other strings clip too.
 */
if (Platform.OS === 'android') {
  type RenderableHost = {
    render: (...args: unknown[]) => React.ReactElement;
  };

  const TextHost = Text as unknown as RenderableHost;
  const oldTextRender = TextHost.render;
  (Text as unknown as RenderableHost).render = function (...args) {
    const origin = oldTextRender.call(
      this,
      ...args
    ) as React.ReactElement<TextProps>;
    return React.cloneElement(origin, {
      style: [{ fontFamily: 'sans-serif' }, origin.props.style]
    });
  };

  const TextInputHost = TextInput as unknown as RenderableHost;
  const oldTextInputRender = TextInputHost.render;
  (TextInput as unknown as RenderableHost).render = function (...args) {
    const origin = oldTextInputRender.call(
      this,
      ...args
    ) as React.ReactElement<TextInputProps>;
    return React.cloneElement(origin, {
      style: [{ fontFamily: 'sans-serif' }, origin.props.style]
    });
  };
}

//import { LogBox } from 'react-native';
//LogBox.ignoreAllLogs();
//console.warn('WARNING: ignoring all logs');

console.log(`Running in ${__DEV__ ? 'dev' : 'prod'} mode`);
//import rnfe from 'react-native-fast-encoder';
//const uint = new rnfe().encode('This is a test');
//const str = new rnfe().decode(uint, { stream: false });
//console.log({ str, uint });

//I made some tests, and this does not get included in production, so
//it's safe to include it. This is needed for web Fast-Refresh when editting
//code (see immediate changes on the web)
if (__DEV__) require('@expo/metro-runtime');
// As of dec 2023, i18next assumes a fully-complient Intl implementation,
// which is not 100% ready in react-native
// So use this polyfill to avoid this error:
//  ERROR  i18next::pluralResolver: Your environment seems not to be Intl API compatible, use an Intl.PluralRules polyfill. Will fallback to the compatibilityJSON v3 format handling.
import 'intl-pluralrules';
if (!('PluralRules' in Intl)) require('intl-pluralrules');

import { Dimensions, Platform, TurboModuleRegistry } from 'react-native';
console.log('React Native version: ', Platform?.constants?.reactNativeVersion);
console.log(
  'Hermes enabled: ',
  !!(global as { HermesInternal?: typeof HermesInternal }).HermesInternal
);
console.log(
  'Using Fabric: ',
  !!(global as { nativeFabricUIManager?: unknown }).nativeFabricUIManager
);
console.log(
  'Using TurboModules:',
  typeof TurboModuleRegistry?.getEnforcing === 'function'
);
console.log('Device dimensions: ', Dimensions.get('window'));

//shims for react-native
if (typeof Buffer === 'undefined') global.Buffer = require('buffer').Buffer;

import 'react-native-get-random-values';
import 'react-native-url-polyfill/auto';

//polyfill AbortSignal.timeout if necessary
if (typeof AbortSignal !== 'undefined' && !AbortSignal.timeout) {
  AbortSignal.timeout = function (ms) {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), ms);
    return controller.signal;
  };
}

//polyfill for react 'Hermes' TextEncoder
//This is needed in storage.ts for import { utf8ToBytes, bytesToUtf8 } from '@noble/ciphers/utils';
//Also for fflate strFromU8, strToU8
//Non native text encoder is slow as hell. React Native 74 will implement it
//Better not set it, then strToU8 and strFromU8 use some other implementation
//automatically which does not require TextEncoder. Internal implementation
//is faster than  fast-text-encoding
//import 'fast-text-encoding';

//import rnfe from 'react-native-fast-encoder';
//const uint = new rnfe().encode('This is a test');
//const str = new rnfe().decode(uint, { stream: false });

//If planning to use React Animated:
//import { NativeModules } from 'react-native';
//const { UIManager } = NativeModules;
//UIManager.setLayoutAnimationEnabledExperimental?.(true);

//For electrum support in react native
global.net = require('react-native-tcp-socket');
global.tls = require('react-native-tcp-socket');

//if (typeof __dirname === 'undefined') global.__dirname = '/';
//if (typeof __filename === 'undefined') global.__filename = '';
//if (typeof process === 'undefined') {
//  global.process = require('process');
//} else {
//  const bProcess = require('process');
//  for (const p in bProcess) {
//    if (!(p in process)) {
//      process[p] = bProcess[p];
//    }
//  }
//}
//process.browser = false;
//process.execPath = '/';

// @ts-expect-error Polyfill for environments missing process.version
if (global.process.version === undefined) global.process.version = '';

//import './electrumSupport'

//       import { NativeModules } from 'react-native';
//
//       // In dev mode, reload the app on unhandled promise rejections
//       global.Promise = require('promise');
//       require('promise/lib/rejection-tracking').enable({
//         allRejections: true,
//         onUnhandled: (id: number, error: Error) => {
//           console.error('Restarting for: Unhandled Rejection:', id, error);
//           if (NativeModules['DevSettings']) NativeModules['DevSettings'].reload();
//         }
//       });
//
//       // In dev mode, reload the app on error
//       ErrorUtils.setGlobalHandler((error, isFatal) => {
//         console.error('Restarting for error:', error, isFatal);
//         if (NativeModules['DevSettings']) NativeModules['DevSettings'].reload();
//       });

//Suppress warning messages from Slider component until they fix it.
//This was showing up in the web version when moving the Slider:
//import { LogBox } from 'react-native';
//LogBox.ignoreLogs([
//  'StyleSheet.compose(a, b) is deprecated; use array syntax, i.e., [a,b]'
//]);
