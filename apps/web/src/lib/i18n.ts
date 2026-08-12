import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import enTranslation from '../locales/en/translation.json';

i18n.use(initReactI18next).init({
  // enTranslation already has the shape { translation: {...} } that
  // i18next expects at resources[lng] — don't re-wrap it or every key
  // ends up double-nested and every t() call misses.
  resources: {
    en: enTranslation,
  },
  lng: 'en',
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;
