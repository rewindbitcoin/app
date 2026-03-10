Patch for slider corresponds to this: <https://github.com/callstack/react-native-slider/pull/603>
Basically you need to set:
var sliderStyle={zIndex:1};
instead of var sliderStyle={zIndex:1,width:width};
in node_modules/@react-native-community/slider/dist/Slider.js
Also this: https://github.com/callstack/react-native-slider/pull/746

Patch for react-native-reanimated corresponds to allow animations even when the device has set reducedMotion (there is no global option as per current version):
<https://github.com/software-mansion/react-native-reanimated/issues/5253>
I needed to update the patch for newer versions of reanimated.

See this one for react-native-tcp-socket too: <https://github.com/Rapsssito/react-native-tcp-socket/issues/197#issuecomment-2444376698>

expo-network-security-config:
This is an Expo plugin that allows us to set additional network security directives for Android.

In our case, we use it to enable connections over HTTP (using unencrypted clear text on port 80) to rewindbitcoin.local. By default, Android does not allow HTTP connections for security reasons.

However, in this plugin, this setting was being applied to both the release and debug environments.

This patch ensures that the <network-security-config> directive is applied only in release mode. In debug mode, Android is already less restrictive due to android:usesCleartextTraffic, so it’s better not to interfere with that configuration. We patched this package to prevent the directive from affecting debug builds.

---

## `react-native-fast-encoder` Patch

Android build fails because Gradle looks for codegen files in:

```
android/build/generated/source/codegen/jni/
```

but the package provides them in:

```
android/generated/jni/
```

Patch fixes the path mismatch.

**Remove patch if:**

```bash
npx expo prebuild --clean && npm run android
```

builds successfully without errors in future versions.

---

## `react-native` Patch
Needed for iOS: The refresh control was not showing the spinner:
https://github.com/facebook/react-native/issues/51914#issuecomment-3200609030

In fact i picked this file (a commit corresponding to a release candidate for 0.82):
https://github.com/facebook/react-native/blob/40c60adacf17f3d5fe54cfcbaf70138de1fe0537/packages/react-native/React/Fabric/Mounting/ComponentViews/ScrollView/RCTPullToRefreshViewComponentView.mm
And adapted the path of these imports:
#import <react/renderer/components/rncore/ComponentDescriptors.h>
#import <react/renderer/components/rncore/EventEmitters.h>
#import <react/renderer/components/rncore/Props.h>
#import <react/renderer/components/rncore/RCTComponentViewHelpers.h>

See explanation here:
https://github.com/facebook/react-native/issues/51914#issuecomment-3275606712

---

#react-native-libsodium
implements this PR: https://github.com/serenity-kit/react-native-libsodium/issues/81
I decided to create a fork since patch-package was not working well with binaries: https://github.com/landabaso/react-native-libsodium

#react-native-fast-encoder
https://github.com/maksimlya/react-native-fast-encoder/issues/9#issuecomment-3333723780

--

#react-native-css-interop
https://github.com/nativewind/nativewind/issues/1711#issuecomment-4006761379

---

## `react-native-extra-dimensions-android` Patch

We still keep this package for now because `react-native-modal` explicitly
documents it as the workaround for some Android devices where the backdrop does
not cover the full screen when the navigation bar can hide/show:

https://github.com/Sunhat/react-native-extra-dimensions-android/issues/71

However, the published package is outdated for modern Android/Gradle builds.
With AGP 8 / Gradle 8 it fails with duplicate `R.class` entries.

This patch does two things:

1. Applies the Gradle 8 compatibility fix discussed upstream by adding
   `namespace "ca.jaysoo.extradimensions"` and removing the old manifest
   `package=` declaration:

   https://github.com/Sunhat/react-native-extra-dimensions-android/issues/73

2. Removes the stale prebuilt `android/build/` artifacts that are mistakenly
   shipped inside the npm package and can trigger duplicate-class build errors.

If Android builds start working without this patch in a future upstream version,
the best long-term cleanup is probably to remove this dependency entirely and
replace the usage with built-in React Native dimensions if Android modal
coverage remains correct on the devices we care about.
