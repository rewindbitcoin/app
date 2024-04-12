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
*   It's specially important to install Ruby using this manager (similar to nvm for node):
    https://rvm.io/rvm/install
    Then install fastlane gem:
    fastlane (depends on ruby) -> This tool is used to quick deploy on android/ios
        -> More info:https://docs.fastlane.tools/
*   TLDR:
    sudo port install rbenv ruby-build
    rbenv install -l
        #pick a version avilable:
    #add this at the end of the .zshrc or (.bashrc)
    export PATH="$HOME/.rbenv/shims:$PATH"
    eval "$(rbenv init -)"
    #restart a terminal

    rbenv install 3.3.0
    rbenv global 3.3.0
        #to activate it
    which gem
        #make sure its the one installed above
    gem install fastlane



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
#this will compile a release version
npx eas build --platform android --local #optinally with --clear-cache
#install it into a device
adb devices
#then, which generates an apk:
npx eas build --profile preview --platform android --local #optinally with --clear-cache
#install it:
adb -s 988674333331524734 install build-1702395889086.apk
```

There are different "profiles":
```bash
#To compile "locally" and using expo and dev server (this creates the image that is installed on simulators):
npx eas build --profile development --platform android --local #optinally with --clear-cache
#To compile "locally" and using expo and not using a dev server (your App can
#work without a computer in the same network):
npx eas build --profile preview --platform android --local #optinally with --clear-cache
#To install in the simulator manually
adb install ThunderDen/build-1702360280369.apk
npx expo start -c --dev-client #-c clears caches and -dev-client uses the Non-Expo client
#Or, even this other command which lets you chooose device
npx expo run:android -d
```
but now click on "s" ->
› Press s │ switch to development build
Then click on "a" to run it in the Android simulator us usual:


## Building locally and developing on a simulator (normal operation)
Normally, while developing, you would only run, which creates a development
profile and automatically installs it on your simulator and creates andconnets
to expo server on your computer:
```bash
npm run android
```

Alternativelly, you can do it manually:
```bash
npx eas build --profile development --platform android --local #optinally with --clear-cache



### iOS on real device
npx eas credentials
    #prepares the real device (connected with USB) so that you'll be able to install Apps
    #if need to know the UUID of the iphone: Connect with USB, got to XCODE->window->devices
# This now creates a provisionin profile that you must install in the iphone (real device)
npx eas device:create
# This builds and installs a "production" version into the iphone USB connected:
npx eas build --platform ios --local --profile preview #optinally with --clear-cache
    #the --profile preview let's you use "distribution: internal" from the eas.json,
    #the --local compiles it using this machine (not using EXPO servers)
    #which means installation using usb to certain registewred devices

    #If get this error:
        #Error: Distribution certificate with fingerprint 816325B1ED940A13EE42D71A229D1F914925961F hasn't been imported successfully
        #then, install this certificate:
            https://www.apple.com/certificateauthority/AppleWWDRCAG3.cer
        #More info: https://github.com/expo/eas-cli/issues/1331

#If you want to run Expo on the real device (so you can reload after a few Js changes) you can run this:
npx expo run:ios -d
#which will  let you choose the device to run and install
#If you get this error: CommandError: No code signing certificates are available to use.
#open ios/ThunderDen.xcodeproj
# -> Signing and capabilities -> Add ACcount - More info: https://github.com/expo/fyi/blob/main/setup-xcode-signing.md

Install the ipa file using XCode->Window->Devices and Simulators and drag the ipa file to the "Installed Apps" of the device

## AsyncStorage fix

To force apply the android fix that the plugin/* files you can do:

So I run:
```bash
npx expo prebuild
```

## mmkv

mmkv storage uses a managed build (same as the one needed for electtrum)

```bash
npx expo install react-native-mmkv
npx expo prebuild
```

## Electrum native client

read this too in cause of trouble:
https://expo.canny.io/feature-requests/p/support-raw-tcp-sockets


