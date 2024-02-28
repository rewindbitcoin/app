import { locales } from './i18next.config';
export { locales };
import type { Locale } from './i18next.config';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './en';
import es from './es';

const resources = {
  en: {
    translation: en
  },
  es: {
    translation: es
  }
};

// Make sure the keys in resources match exactly the locales in the array
const resourceLocales = Object.keys(resources);
if (
  locales.length !== resourceLocales.length ||
  !locales.every(locale => resourceLocales.includes(locale))
) {
  throw new Error('Mismatch between defined locales and available resources.');
}

export default (locale: Locale) =>
  i18n.use(initReactI18next).init({
    resources,
    lng: locale, // Default locale
    fallbackLng: 'en',

    interpolation: {
      escapeValue: false
    }
  });
