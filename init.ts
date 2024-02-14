//I made some tests, and this does not get included in production, so
//it's safe to include it. This is needed for web Fast-Refresh when editting
//code (see immediate changes on the web)
import '@expo/metro-runtime';
// As of dec 2023, i18next assumes a fully-complient Intl implementation,
// which is not 100% ready in react-native
// So use this polyfill to avoid this error:
//  ERROR  i18next::pluralResolver: Your environment seems not to be Intl API compatible, use an Intl.PluralRules polyfill. Will fallback to the compatibilityJSON v3 format handling.
import 'intl-pluralrules';

import { Platform } from 'react-native';
console.log('React Native version: ', Platform?.constants?.reactNativeVersion);
console.log(
  'Hermes enabled: ',
  !!(global as { HermesInternal?: typeof HermesInternal }).HermesInternal
);

//shims for react-native
if (typeof Buffer === 'undefined') global.Buffer = require('buffer').Buffer;

import 'react-native-get-random-values';
import 'react-native-url-polyfill/auto';

//polyfill for react 'Hermes' TextEncoder
//This is needed in storage.ts for import { utf8ToBytes, bytesToUtf8 } from '@noble/ciphers/utils';
import 'fast-text-encoding';

//If planning to use React Animated:
import { NativeModules } from 'react-native';
const { UIManager } = NativeModules;
UIManager.setLayoutAnimationEnabledExperimental?.(true);

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

//global.process.version = "";

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
