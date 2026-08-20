"use client";

import { useSyncExternalStore, useCallback, useEffect, useContext, createContext, type FC, type ReactNode } from "react";
import { getCurrentLocale, localeToHtmlLang, setLocale as setI18nLocale, t, type Locale, type TranslationKey } from "@/lib/i18n";

const LocaleContext = createContext<Locale>("zh");

export const LocaleProvider: FC<{ initialLocale: Locale; children: ReactNode }> = ({ initialLocale, children }) => {
  return <LocaleContext.Provider value={initialLocale}>{children}</LocaleContext.Provider>;
};

function subscribe(listener: () => void) {
  window.addEventListener('localechange', listener);
  return () => {
    window.removeEventListener('localechange', listener);
  };
}

function getSnapshot(): Locale {
  return getCurrentLocale();
}

export const useLocale = () => {
  const initialLocale = useContext(LocaleContext);
  const getServerSnapshot = useCallback((): Locale => initialLocale, [initialLocale]);
  const locale = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    document.documentElement.lang = localeToHtmlLang(locale);
  }, [locale]);

  const setLocale = useCallback((newLocale: Locale) => {
    setI18nLocale(newLocale);
  }, []);

  const translate = useCallback((key: TranslationKey) => t(key, locale), [locale]);

  return { locale, setLocale, t: translate };
};
