module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo']
    //should go with:
    // npx expo install @babel/plugin-proposal-export-namespace-from react-native-reanimated
    //plugins: [
    //  '@babel/plugin-proposal-export-namespace-from',
    //  'react-native-reanimated/plugin'
    //]
  };
};
