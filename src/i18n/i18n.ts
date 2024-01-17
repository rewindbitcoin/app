export type Locale = 'en-US' | 'es-ES';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './en';
import es from './es';

export default (locale: Locale) =>
  i18n.use(initReactI18next).init({
    resources: {
      en: {
        translation: en
      },
      es: {
        translation: es
      }
    },
    lng: locale, // Default locale
    fallbackLng: 'en',

    interpolation: {
      escapeValue: false
    }
  });
