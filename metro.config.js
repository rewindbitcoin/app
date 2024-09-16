// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);
const { transformer, resolver } = config;

config.transformer = {
  ...transformer,
  babelTransformerPath: require.resolve('react-native-svg-transformer')
};
config.resolver = {
  ...resolver,
  assetExts: resolver.assetExts.filter(ext => ext !== 'svg'),
  sourceExts: [...resolver.sourceExts, 'svg'],
  extraNodeModules: {
    net: require.resolve('react-native-tcp-socket'),
    tls: require.resolve('react-native-tcp-socket')
  }
};

module.exports = withNativeWind(config, {
  input: './global.css',

  //https://www.nativewind.dev/v4/tailwind/typography/font-size#rem-scaling
  //14 is actually the default value. We explicitelly set it. It only sets iOs and Android. For Web, we must use a css rule
  inlineRem: 14
});
