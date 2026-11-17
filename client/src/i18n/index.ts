import { createInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import uk from './locales/uk.json';

export const SUPPORTED_LANGUAGES = ['uk', 'en'] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];

const STORAGE_KEY = 'leakguard.language';

/** Picks the saved language, then the browser language, then Ukrainian. */
function detectLanguage(): Language {
  const candidates = [readStoredLanguage(), ...navigator.languages.map((tag) => tag.slice(0, 2))];
  return candidates.find(isSupported) ?? 'uk';
}

function isSupported(value: string | null | undefined): value is Language {
  return SUPPORTED_LANGUAGES.some((language) => language === value);
}

function readStoredLanguage(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

const i18n = createInstance();

void i18n.use(initReactI18next).init({
  resources: { uk: { translation: uk }, en: { translation: en } },
  lng: detectLanguage(),
  fallbackLng: 'en',
  supportedLngs: SUPPORTED_LANGUAGES,
  interpolation: { escapeValue: false },
});

i18n.on('languageChanged', (language) => {
  document.documentElement.lang = language;
  try {
    localStorage.setItem(STORAGE_KEY, language);
  } catch {
    // Storage may be unavailable (private mode); the choice then lasts for this session only.
  }
});
document.documentElement.lang = i18n.language;

export default i18n;
