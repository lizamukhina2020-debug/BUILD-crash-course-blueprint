import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';
import AsyncStorage from '@react-native-async-storage/async-storage';

import en from './locales/en.json';
import ru from './locales/ru.json';

const LANGUAGE_STORAGE_KEY = 'seedmind_language';

const normalizeLang = (lang?: string | null): 'en' | 'ru' => (lang === 'ru' ? 'ru' : 'en');
const isSupportedLang = (lang?: string | null): lang is 'en' | 'ru' => lang === 'en' || lang === 'ru';

// Get the device's preferred language
const getDeviceLanguage = (): string => {
  try {
    const locales = Localization.getLocales();
    if (locales && locales.length > 0) {
      const languageCode = locales[0].languageCode;
      // Support Russian and Ukrainian users with Russian
      if (languageCode === 'ru' || languageCode === 'uk') {
        return 'ru';
      }
    }
  } catch (error) {
    console.warn('[i18n] Could not get device language:', error);
  }
  return 'en';
};

const resources = {
  en: { translation: en },
  ru: { translation: ru },
};

const detectedLang = getDeviceLanguage();
console.log('[i18n] Initializing with language:', detectedLang);

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: detectedLang,
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false, // React already escapes values
    },
    compatibilityJSON: 'v4', // For React Native compatibility
    initImmediate: true, // Ensure synchronous initialization
    react: {
      useSuspense: false, // Disable suspense to prevent loading issues
    },
  });

console.log('[i18n] Initialized successfully, isInitialized:', i18n.isInitialized);

export const getCurrentLanguage = (): string => i18n.language;

// Apply stored language (if the user manually selected one before) after initialization.
// We intentionally do this asynchronously to avoid blocking app startup.
void (async () => {
  try {
    const stored = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (isSupportedLang(stored)) {
      const normalized = normalizeLang(stored);
      if (normalized !== i18n.language) {
        console.log('[i18n] Applying stored language:', normalized);
        await i18n.changeLanguage(normalized);
      }
    }
  } catch (e) {
    console.warn('[i18n] Failed to load stored language:', e);
  }
})();

// Persist user language choice so it survives app restarts.
export const changeLanguage = async (lang: string): Promise<any> => {
  const normalized = normalizeLang(lang);
  try {
    await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, normalized);
  } catch (e) {
    console.warn('[i18n] Failed to persist language:', e);
  }
  return i18n.changeLanguage(normalized);
};
export const isRussian = (): boolean => i18n.language === 'ru';

export default i18n;




