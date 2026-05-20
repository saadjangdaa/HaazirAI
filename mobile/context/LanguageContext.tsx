import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import t, { Language, LANGUAGE_LABELS } from '../constants/translations';

const STORAGE_KEY = '@haazir_language';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  tr: typeof t['roman_urdu'];
  isRTL: boolean;
  langReady: boolean;
}

const LanguageContext = createContext<LanguageContextType>({} as LanguageContextType);

const RTL_LANGUAGES: Language[] = ['urdu', 'sindhi', 'pashto', 'balochi'];

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>('roman_urdu');
  const [langReady, setLangReady] = useState(false);

  // Load persisted language on mount
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((saved) => {
      if (saved && saved in LANGUAGE_LABELS) {
        setLanguageState(saved as Language);
      }
      setLangReady(true);
    }).catch(() => setLangReady(true));
  }, []);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    AsyncStorage.setItem(STORAGE_KEY, lang).catch(() => {});
  };

  const tr = t[language] as typeof t['roman_urdu'];
  const isRTL = RTL_LANGUAGES.includes(language);

  return (
    <LanguageContext.Provider value={{ language, setLanguage, tr, isRTL, langReady }}>
      {children}
    </LanguageContext.Provider>
  );
}

export const useLang = () => useContext(LanguageContext);
export { LANGUAGE_LABELS };
export type { Language };
