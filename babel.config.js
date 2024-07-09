module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
      'nativewind/babel'
    ],
    //plugins below needed for react-native-reanimated:
    //should go with:
    // npx expo install @babel/plugin-proposal-export-namespace-from react-native-reanimated
    plugins: [
      '@babel/plugin-proposal-export-namespace-from',
      'react-native-reanimated/plugin',
      [
        'module:react-native-dotenv',
        {
          moduleName: '@env',
          path: './node_modules/@rewindbitcoin/env/services.env',
          blacklist: null,
          whitelist: null,
          safe: false,
          allowUndefined: true,
          verbose: true
        }
      ]
    ]
  };
};
