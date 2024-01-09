// As of dec 2023, i18next assumes a fully-complient Intl implementation,
// which is not 100% ready in react-native
// So use this polyfill to avoid this error:
//  ERROR  i18next::pluralResolver: Your environment seems not to be Intl API compatible, use an Intl.PluralRules polyfill. Will fallback to the compatibilityJSON v3 format handling.
import 'intl-pluralrules';

//shims for react-native
import { Buffer } from 'buffer';
global.Buffer = Buffer;
import 'react-native-get-random-values';
import 'react-native-url-polyfill/auto';

//import { Platform } from 'react-native';
//import KeyboardManager from 'react-native-keyboard-manager';
//if (Platform.OS === 'ios') {
//  KeyboardManager.setEnable(true);
//  //KeyboardManager.setEnableAutoToolbar(false); //Disables Toolbar ("done" button)
//  KeyboardManager.setToolbarPreviousNextButtonEnable(true); //This one will not show if toolbar disabled
//}
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
