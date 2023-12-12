## Motivation
I needed to add a plugin for Android in app.json
    Motives:
    This is a fix for Android (AsyncStorage has a limitation of 2MB per row)
    Vaults reach a max limit
    https://github.com/react-native-async-storage/async-storage/issues/617#issuecomment-1508418734


Thus, I need to be able to compile Android .java files

This means I cannot use Expo Go iOs/Android Apps anymore.

Also, not using Expo Go is also the case when using Electrum client.

## How

Still, it is possible to use expo tools without ejecting completelly.

For that, builds must be done locally, though.

For Macos, install android and xcode among other.
It's specially important to install Ruby using this manager (similar to nvm for node):
https://rvm.io/rvm/install
Then install fastlane gem:
fastlane (depends on ruby) -> This tool is used to quick deploy on android/ios
    -> More info:https://docs.fastlane.tools/

The rest of things to install are listed at the end of this doc:
https://docs.expo.dev/build-reference/local-builds/

Now install eas command line:
```bash
npm install -g eas-cli
```

So, it is needed to use eas tools (installed as eas-cli).
eas-cli by default tries to compile con Expo servers which is slow and has
quotas. But you can compile them locally too.

See: https://docs.expo.dev/build-reference/local-builds/



## Using EAS

Sign up in Expo Website

The logins are not per-project but per-system since they are stored in ~/.expo

See if you have already created a login (~/.expo) by
```bash
nxp eas whoami
```

If not:
Then:
```bash
npx eas login
```

Now, (following this instructions https://docs.expo.dev/build-reference/local-builds/):

Build locally for Android using (1st call will take a lot of time to complete,
DON'T CTRL-C):
```bash
npx eas build --platform android --local
```

There are different "profiles":
```bash
#To compile "locally" and using expo and dev server:
npx eas build --profile development --platform android --local
#To compile "locally" and using expo and not using a dev server (your App can
#work without a computer in the same network):
npx eas build --profile preview --platform android --local
#The default is the "production" release:
npx eas build --platform android --local
```

Now run as usual:
```bash
npx eas build --profile development --platform android --local
#To install in the simulator
adb install ThunderDen/build-1702360280369.apk
npx expo start
```
but now click on "s" ->
› Press s │ switch to development build
Then click on "a" to run it in the Android simulator us usual:

## Devices

To register your devices:
```bash
eas device:create
```


## AsyncStorage fix

To force apply the android fix that the plugin/* files you can do:

So I run:
```bash
npx expo prebuild
```

## Electrum native client

read this too in cause of trouble:
https://expo.canny.io/feature-requests/p/support-raw-tcp-sockets


