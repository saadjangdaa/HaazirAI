import React, { createContext, useContext, useState } from 'react';
import t, { Language, LANGUAGE_LABELS } from '../constants/translations';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  tr: typeof t['roman_urdu'];
  isRTL: boolean;
}

const LanguageContext = createContext<LanguageContextType>({} as LanguageContextType);

const RTL_LANGUAGES: Language[] = ['urdu', 'sindhi', 'pashto', 'balochi'];

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguage] = useState<Language>('roman_urdu');
  const tr = t[language] as typeof t['roman_urdu'];
  const isRTL = RTL_LANGUAGES.includes(language);

  return (
    <LanguageContext.Provider value={{ language, setLanguage, tr, isRTL }}>
      {children}
    </LanguageContext.Provider>
  );
}

export const useLang = () => useContext(LanguageContext);
export { LANGUAGE_LABELS };
export type { Language };
