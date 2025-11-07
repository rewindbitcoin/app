import fs from 'fs';

const hasGoogleServices = fs.existsSync('./google-services.json');
if (!hasGoogleServices) {
  console.warn(
    '\n⚠️  Warning: google-services.json not found — Cannot submit to PlayStore.\n'
  );
}

export default {
  expo: {
    newArchEnabled: true,
    name: 'RewindBitcoin',
    jsEngine: 'hermes',
    slug: 'RewindBitcoin',
    version: '2.0.0',
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'light',
    assetBundlePatterns: ['**/*'],
    ios: {
      splash: {
        image: './assets/splash.png',
        resizeMode: 'contain',
        backgroundColor: '#FFFFFF'
      },
      config: {
        usesNonExemptEncryption: false
      },
      infoPlist: {
        README_UIFileSharingEnabled:
          'So that the app reveals to the host its Shared Documents. This is necessary for air-gapped signing.',
        UIFileSharingEnabled: true,
        CFBundleAllowMixedLocalizations: true
      },
      supportsTablet: true,
      bundleIdentifier: 'com.rewindbitcoin.app',
      appleTeamId: 'YLPTXNT537'
    },
    android: {
      README_allowBackup:
        "In android, SecureStore, does not persist data when uninstalling the app. However mmkv data can persist if Google Drive App Data Backups is enabled. So it's better to disable Google Droive App Data Backups altogether since the reinstalled app will report it exists a wallet and then cannot access the encrypted mnemonic - iOS backups both data and encrypted data, which is just fine",
      googleServicesFile: hasGoogleServices
        ? './google-services.json'
        : undefined,
      splash: {
        image: './assets/adaptive-icon.png',
        resizeMode: 'contain',
        backgroundColor: '#FFFFFF'
      },
      allowBackup: false,
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: '#FFFFFF'
      },
      softwareKeyboardLayoutMode: 'resize',
      package: 'com.rewindbitcoin.app',
      permissions: [
        'android.permission.USE_BIOMETRIC',
        'android.permission.USE_FINGERPRINT',
        'android.permission.CAMERA',
        'android.permission.RECEIVE_BOOT_COMPLETED'
      ]
    },
    web: {
      bundler: 'metro',
      favicon: './assets/favicon.png'
    },
    extra: {
      eas: {
        projectId: '0598db8e-d582-4b63-9bf1-3a3fca12dc83'
      }
    },
    locales: {
      es: './src/i18n-locales/app.es.json',
      en: './src/i18n-locales/app.en.json'
    },
    plugins: [
      ['react-native-libsodium', {}],
      'expo-font',
      'expo-local-authentication',
      'expo-secure-store',
      [
        'expo-camera',
        {
          recordAudioAndroid: false
        }
      ],
      'expo-localization',
      [
        'expo-network-security-config',
        {
          networkSecurityConfig:
            './android_allow_http_on_rewindbitcoin_local.xml',
          enable: true,
          README:
            'Why? So that we can use the regtest environment. networkSecurityConfig is set for android so that the http protocol can be used on rewindbitcoin.local. On ios .local domains can be used in http by default - See https://developer.apple.com/documentation/bundleresources/information_property_list/nsapptransportsecurity/nsallowslocalnetworking'
        }
      ],
      [
        'expo-notifications',
        {
          defaultChannel: 'default',
          color: '#007AFF'
        }
      ]
    ]
  }
};
