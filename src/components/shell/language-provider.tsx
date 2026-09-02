"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import {
  APP_LOCALE_COOKIE,
  SHELL_COPY,
  type AppLocale,
} from "@/lib/i18n";
import { getWebDictionary, type WebDictionary } from "@/lib/i18n/dictionaries";

interface LanguageContextValue {
  locale: AppLocale;
  setLocale: (locale: AppLocale) => void;
  copy: (typeof SHELL_COPY)[AppLocale];
  dictionary: WebDictionary;
}

const LanguageContext = React.createContext<LanguageContextValue | null>(null);

export function LanguageProvider({
  initialLocale,
  children,
}: {
  initialLocale: AppLocale;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [locale, setLocaleState] = React.useState<AppLocale>(initialLocale);

  React.useEffect(() => {
    setLocaleState(initialLocale);
    document.documentElement.lang = initialLocale;
  }, [initialLocale]);

  const setLocale = React.useCallback(
    (next: AppLocale) => {
      setLocaleState(next);
      document.documentElement.lang = next;
      document.cookie = `${APP_LOCALE_COOKIE}=${next}; Path=/; Max-Age=31536000; SameSite=Lax`;
      router.refresh();
    },
    [router],
  );

  const value = React.useMemo(
    () => ({ locale, setLocale, copy: SHELL_COPY[locale], dictionary: getWebDictionary(locale) }),
    [locale, setLocale],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  const context = React.useContext(LanguageContext);
  if (!context) throw new Error("useLanguage must be used inside LanguageProvider");
  return context;
}
