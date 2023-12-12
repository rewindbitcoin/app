```bash
npx create-expo-app ThunderDen -t expo-template-blank-typescript
```

```bash
#shims and compatibility stuff:
#note we are using react-native-get-random-values@1.8.0 until this is resolved:
#https://github.com/LinusU/react-native-get-random-values/issues/49
npm install buffer\
    stream\
    events\
    react-native-get-random-values@1.8.0\
    react-native-url-polyfill
#If you want to use electrum client on react-native:
#npm install react-native-tcp-socket
#uncomment this line in init.js: //import './electrumSupport'
#npx expo prebuild
#cd ios && pod install && cd ..
```

```bash
npm install @react-native-async-storage/async-storage
```

```bash
npm install bip39 bip68\
    bitcoinjs-lib \
    @bitcoinerlab/secp256k1 \
    @bitcoinerlab/descriptors \
    @bitcoinerlab/miniscript \
    @bitcoinerlab/explorer \
    @bitcoinerlab/discovery
```

```bash
#QR codes
npm install react-native-qrcode-svg
npx expo install react-native-svg
```

```bash
#memoize
npm install lodash.memoize
npm i --save-dev @types/lodash.memoize
#clipboard
npx expo install expo-clipboard
#share
npx expo install expo-sharing
#deals with SafeAreaView (correct padding for devices with notch)
npx expo install react-native-safe-area-context
#Slider:
npx expo install @react-native-community/slider
#fonts (monospace)
npx expo install expo-font @expo-google-fonts/roboto-mono
```

```bash
npm install --save-dev bitcoinerlab/configs
```
Then add in package.json:
```
  "prettier": "@bitcoinerlab/configs/prettierConfig.json",
  "eslintConfig": {
    "extends": "./node_modules/@bitcoinerlab/configs/eslintConfig"
  },
  "jest": {
    "preset": "@bitcoinerlab/configs"
  },
```
TODO: This does not use the tsconfig.json yet

## Run on Expo

```bash
npx expo start -c
```



## Expo

Read expo.md for more detailed instructions on how to build locally and
depart from Expo Go for using Electrum client / apply fix to async-storage
