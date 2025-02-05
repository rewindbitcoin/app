//Guide:
//https://docs.expo.dev/guides/localization/

//Package:
//https://docs.expo.dev/versions/latest/sdk/localization/

import { i18n } from '../../i18n-locales/init';
import { useLocales, getLocales } from 'expo-localization';
import { useSettings } from './useSettings';
import { Currency, defaultSettings } from '../lib/settings';
import { useCallback } from 'react';

let lastLanguageSet: undefined | string = undefined;
//This will be called as quick as possible,
//before any settings info is load from disk
export const i18nLanguageInit = () => {
  if (defaultSettings.LOCALE === 'default') {
    const locales = getLocales();
    if (
      locales[0]?.languageCode &&
      lastLanguageSet !== locales[0]?.languageCode
    ) {
      lastLanguageSet = locales[0]?.languageCode;
      i18n.changeLanguage(lastLanguageSet);
    }
  } else i18n.changeLanguage(defaultSettings.LOCALE);
};

export const useLocalization = () => {
  //useLocales triggers a re-render if the user changes the language
  const locales = useLocales();
  const { settings, setSettings } = useSettings();
  const systemLanguage = locales[0]?.languageCode;
  const selectedLanguage =
    settings?.LOCALE === 'default' ? systemLanguage : settings?.LOCALE;

  if (selectedLanguage && lastLanguageSet !== selectedLanguage) {
    lastLanguageSet = selectedLanguage;
    i18n.changeLanguage(lastLanguageSet);
  }

  const setCurrency = useCallback(
    (currency: Currency) => {
      if (!settings)
        throw new Error('Cannot set currency with unloaded settings');
      setSettings({ ...settings, CURRENCY: currency });
    },
    [setSettings, settings]
  );

  const setLocale = useCallback(
    (locale: string) => {
      if (!settings)
        throw new Error('Cannot set locale with unloaded settings');
      setSettings({ ...settings, LOCALE: locale });
    },
    [settings, setSettings]
  );

  return {
    locale: settings?.LOCALE || defaultSettings.LOCALE,
    currency: settings?.CURRENCY || defaultSettings.CURRENCY,
    setCurrency,
    setLocale
  };
};
