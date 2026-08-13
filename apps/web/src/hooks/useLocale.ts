"use client";

import { useSyncExternalStore, useCallback, useEffect } from "react";
import { getCurrentLocale, localeToHtmlLang, setLocale as setI18nLocale, t, type Locale, type TranslationKey } from "@/lib/i18n";

function subscribe(listener: () => void) {
  window.addEventListener('localechange', listener);
  return () => {
    window.removeEventListener('localechange', listener);
  };
}

function getSnapshot(): Locale {
  return getCurrentLocale();
}

function getServerSnapshot(): Locale {
  return 'zh';
}

export const useLocale = () => {
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
