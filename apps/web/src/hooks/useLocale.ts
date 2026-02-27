"use client";

import { useSyncExternalStore, useCallback } from "react";
import { getCurrentLocale, setLocale as setI18nLocale, t, type Locale } from "@/lib/i18n";

// Store for managing locale state
let listeners: Array<() => void> = [];

function subscribe(listener: () => void) {
  listeners.push(listener);
  
  // Also listen for the custom locale change event
  window.addEventListener('localechange', listener);
  
  return () => {
    listeners = listeners.filter(l => l !== listener);
    window.removeEventListener('localechange', listener);
  };
}

function getSnapshot(): Locale {
  return getCurrentLocale();
}

function getServerSnapshot(): Locale {
  // Return default locale for SSR to avoid hydration mismatch
  return 'zh';
}

export const useLocale = () => {
  const locale = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setLocale = useCallback((newLocale: Locale) => {
    setI18nLocale(newLocale);
    // Notify all listeners
    listeners.forEach(listener => listener());
  }, []);

  const translate = useCallback((key: string) => t(key, locale), [locale]);

  return { locale, setLocale, t: translate };
};
