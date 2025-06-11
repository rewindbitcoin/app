Patch for slider corresponds to this: <https://github.com/callstack/react-native-slider/pull/603>
Patch for react-native-reanimated corresponds to allow animations even when the device has set reducedMotion (there is no global option as per current version):
<https://github.com/software-mansion/react-native-reanimated/issues/5253>

See this one for react-native-tcp-socket too: <https://github.com/Rapsssito/react-native-tcp-socket/issues/197#issuecomment-2444376698>

expo-network-security-config:
This is an Expo plugin that allows us to set additional network security directives for Android.

In our case, we use it to enable connections over HTTP (using unencrypted clear text on port 80) to rewindbitcoin.local. By default, Android does not allow HTTP connections for security reasons.

However, in this plugin, this setting was being applied to both the release and debug environments.

This patch ensures that the <network-security-config> directive is applied only in release mode. In debug mode, Android is already less restrictive due to android:usesCleartextTraffic, so it’s better not to interfere with that configuration. We patched this package to prevent the directive from affecting debug builds.

expo-device
https://github.com/expo/expo/commit/a6c1fc09e33d780b6c80a7be0ba6d710f4e2b8db
