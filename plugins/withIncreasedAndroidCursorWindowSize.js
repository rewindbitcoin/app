// This is a fix for Android (AsyncStorage has a limitation of 2MB per row)
// Vaults reach a max limit
// https://github.com/react-native-async-storage/async-storage/issues/617#issuecomment-1508418734
Object.defineProperty(exports, '__esModule', { value: true });

const config_plugins_1 = require('expo/config-plugins');
const addImports =
  require('@expo/config-plugins/build/android/codeMod').addImports;
const mergeContents =
  require('@expo/config-plugins/build/utils/generateCode').mergeContents;
const withMainActivity = require('expo/config-plugins').withMainActivity;

function injectCode(src) {
  return mergeContents({
    tag: 'withIncreasedAndroidCursorWindowSize-onCreate',
    src,
    newSrc: `
      try {
        Field field = CursorWindow.class.getDeclaredField("sCursorWindowSize");
        field.setAccessible(true);
        field.set(null, 100 * 1024 * 1024); //the 100MB is the new size
      } catch (Exception e) {
      }
    `,
    anchor: /super\.onCreate\(\w+\);/,
    offset: 1,
    comment: '//'
  });
}

const withIncreasedAndroidCursorWindowSize = config => {
  return withMainActivity(config, async config => {
    const src = addImports(
      config.modResults.contents,
      ['android.database.CursorWindow', 'java.lang.reflect.Field'],
      config.modResults.language === 'java'
    );

    if (config.modResults.language !== 'java') {
      throw new Error(
        'withIncreasedAndroidCursorWindowSize config plugin does not support kotlin MainActivity yet.'
      );
    }

    config.modResults.contents = injectCode(src).contents;

    return config;
  });
};

exports.default = (0, config_plugins_1.createRunOncePlugin)(
  withIncreasedAndroidCursorWindowSize,
  'withIncreasedAndroidCursorWindowSize'
);
