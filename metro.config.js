// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);
const { transformer, resolver } = config;

config.transformer = {
  ...transformer,
  inlineRequires: true,
  babelTransformerPath: require.resolve('react-native-svg-transformer')
};
config.resolver = {
  ...resolver,
  assetExts: resolver.assetExts.filter(ext => ext !== 'svg'),
  sourceExts: [...resolver.sourceExts, 'svg'],
  extraNodeModules: {
    net: require.resolve('react-native-tcp-socket'),
    tls: require.resolve('react-native-tcp-socket')
  },
  resolveRequest: (context, moduleName, platform) => {
    if (platform === 'web') {
      // The Git fork has source files but no compiled lib/module entrypoint.
      if (moduleName === 'react-native-libsodium') {
        return {
          type: 'sourceFile',
          filePath: require.resolve('react-native-libsodium/src/index.ts')
        };
      }
      // The 0.7.x ESM wrappers import missing sibling .mjs files; CJS works.
      if (
        moduleName === 'libsodium-wrappers' ||
        moduleName === 'libsodium-wrappers-sumo'
      ) {
        return { type: 'sourceFile', filePath: require.resolve(moduleName) };
      }
    }
    return context.resolveRequest(context, moduleName, platform);
  }
};

module.exports = withNativeWind(config, {
  input: './global.css',
  inlineRem: 16

  //https://www.nativewind.dev/v4/tailwind/typography/font-size#rem-scaling
  //14 is actually the default value. We explicitelly set it. It only sets iOs and Android. For Web, we must use a css rule
  //inlineRem: 14
});
