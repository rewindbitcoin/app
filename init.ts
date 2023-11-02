//shims for react-native
import { Buffer } from "buffer";
global.Buffer = Buffer;
import "react-native-get-random-values";
import "react-native-url-polyfill/auto";
//import './electrumSupport'

import { NativeModules } from "react-native";

// In dev mode, reload the app on unhandled promise rejections
global.Promise = require("promise");
require("promise/lib/rejection-tracking").enable({
  allRejections: true,
  onUnhandled: (id: number, error: Error) => {
    console.error("Restarting for: Unhandled Rejection:", id, error);
    if (NativeModules.DevSettings) NativeModules.DevSettings.reload();
  },
});

// In dev mode, reload the app on error
ErrorUtils.setGlobalHandler((error, isFatal) => {
  console.error("Restarting for error:", error, isFatal);
  if (NativeModules.DevSettings) NativeModules.DevSettings.reload();
});
