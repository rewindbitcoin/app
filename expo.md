## Motivation

This is the distribution certificate for RewindBitcoin:
427C9665FA69A6BD7C1B7E9CCF9C4D7
(It's different than the one for La Bolsa Virtual: 5CB88186EE187942EEA701FA98104BEF)

I needed to add a plugin for Android in app.json
Motives:
This is a fix for Android (AsyncStorage has a limitation of 2MB per row)
Vaults reach a max limit
<https://github.com/react-native-async-storage/async-storage/issues/617#issuecomment-1508418734>

Thus, I need to be able to compile Android .java files

This means I cannot use Expo Go iOs/Android Apps anymore.

Also, not using Expo Go is also the case when using Electrum client.

## How

Still, it is possible to use expo tools without ejecting completelly.

For that, builds must be done locally, though.

For Macos, install android and xcode among other.

- It's specially important to install Ruby using this manager (similar to nvm for node):
  <https://rvm.io/rvm/install>
  Then install fastlane gem:
  fastlane (depends on ruby) -> This tool is used to quick deploy on android/ios
  -> More info:<https://docs.fastlane.tools/>
- TLDR:
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
<https://docs.expo.dev/build-reference/local-builds/>

Now install eas command line:

```bash
npm install -g eas-cli
```

So, it is needed to use eas tools (installed as eas-cli).
eas-cli by default tries to compile con Expo servers which is slow and has
quotas. But you can compile them locally too.

See: <https://docs.expo.dev/build-reference/local-builds/>

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

Now, (following this instructions <https://docs.expo.dev/build-reference/local-builds/>):

Build locally for Android using (1st call will take a lot of time to complete,
DON'T CTRL-C):

```bash
#this will compile a release version
npx eas build --platform android --local #optionally with --clear-cache
#install it into a device
adb devices
#then, which generates an apk:
npx eas build --profile preview --platform android --local #optionally with --clear-cache
#install it:
adb -s 988674333331524734 install build-1702395889086.apk
```

There are different "profiles":

```bash
#To compile "locally" and using expo and dev server (this creates the image that is installed on simulators):
npx eas build --profile development --platform android --local #optionally with --clear-cache
#To compile "locally" and using expo and not using a dev server (your App can
#work without a computer in the same network):
npx eas build --profile preview --platform android --local #optionally with --clear-cache
#To install in the simulator manually
adb install app/build-1702360280369.apk
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

Alternatively, you can do it manually:

````bash
npx eas build --profile development --platform android --local #optionally with --clear-cache



### iOS on real device
npx eas credentials
    #prepares the real device (connected with USB) so that you'll be able to install Apps
    #if need to know the UUID of the iphone: Connect with USB, got to XCODE->window->devices

# This now creates a provisionin profile that you must install in the iphone (real device)
npx eas device:create

# This builds and installs a "production" version into the iphone USB connected:
npx eas build --platform ios --local --profile preview #optionally with --clear-cache
    #the --profile preview let's you use "distribution: internal" from the eas.json,
    #the --local compiles it using this machine (not using EXPO servers)
    #which means installation using usb to certain registewred devices

    #If get this error:
        #Error: Distribution certificate with fingerprint 816325B1ED940A13EE42D71A229D1F914925961F hasn't been imported successfully
        #then, install this certificate:
            https://www.apple.com/certificateauthority/AppleWWDRCAG3.cer
        #More info: https://github.com/expo/eas-cli/issues/1331
    # If you run into 65 code errors by fastlane, then read this: https://github.com/expo/eas-cli/issues/1201#issuecomment-1446997753

#If you want to run Expo on the real device (so you can reload after a few Js changes) you can run this:
npx expo run:ios -d
#which will  let you choose the device to run and install
#If you get errors, try to open on xcode the project once and build. For some reason it will work then even if you clean the project.
#If you get this error: CommandError: No code signing certificates are available to use.
#open ios/RewindBitcoin.xcodeproj
# -> Signing and capabilities -> Add Account - More info: https://github.com/expo/fyi/blob/main/setup-xcode-signing.md

Install the ipa file using XCode->Window->Devices and Simulators and drag the ipa file to the "Installed Apps" of the device

## AsyncStorage fix

To force apply the android fix that the plugin/* files you can do:

So I run:
```bash
npx expo prebuild
````

## Run iOS release version on a simulator

```bash
npx expo run:ios -d --configuration Release
```

## Record videos showing taps on ios

To record a video on the simulator using taps. Using this project:
<https://github.com/KaneCheshire/ShowTime>

Go to ios/RewindBitcoin/
then: `wget https://raw.githubusercontent.com/KaneCheshire/ShowTime/main/Sources/ShowTime/ShowTime.swift`
To fine tune colors adapt:

```swift
@objc public static var strokeColor = UIColor(red: 1.0, green: 0.145, blue: 0.047, alpha: 1)
```

Then open xcode and click on the + symbol at the bottom of the folders and make sure to add the `ShowTime.swift` file

Then open it on a simulator running version of iOS 17 (not 18 because there are rendering artifacts). For example iphone 15 on ios 17 is fine.
It's been fixed for ios > 17? See: https://github.com/KaneCheshire/ShowTime/issues/63#issuecomment-2571424733

VERY IMPORTANT! When done, remember to remove the compiled project when releasing a new production version or
all the users will get the tap feedback thing in production:

```bash
npx expo  prebuild --clean #to reset the Swift package thing above
```

## TestFlight

```bash
eas build --profile production --platform ios --clear-cache --local
eas submit --platform ios --profile production
#then select the ipa file created on first command
```

## Generating a production apk for Android

```bash
eas build --profile production --platform android --clear-cache --local
```

having this in eas.json:

```json
  "build": {
    "production": {
      "distribution": "store",
      "ios": {
        "buildConfiguration": "Release"
      }
    }
  },
  "submit": {
    "production": {}
  }
```

## mmkv

mmkv storage uses a managed build (same as the one needed for electtrum)

```bash
npx expo install react-native-mmkv
npx expo prebuild
```

## Electrum native client

read this too in cause of trouble:
<https://expo.canny.io/feature-requests/p/support-raw-tcp-sockets>

## push notifications setup:
https://docs.expo.dev/push-notifications/push-notifications-setup/
  -> Android: https://docs.expo.dev/push-notifications/fcm-credentials/
