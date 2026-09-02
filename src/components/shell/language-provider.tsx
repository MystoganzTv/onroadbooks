"use client";

import * as React from "react";

import { setAppLocaleAction } from "@/lib/actions/locale";
import {
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
  const [locale, setLocaleState] = React.useState<AppLocale>(initialLocale);
  const confirmedLocale = React.useRef<AppLocale>(initialLocale);
  const [, startLocaleTransition] = React.useTransition();

  React.useEffect(() => {
    confirmedLocale.current = initialLocale;
    setLocaleState(initialLocale);
    document.documentElement.lang = initialLocale;
  }, [initialLocale]);

  const setLocale = React.useCallback(
    (next: AppLocale) => {
      if (next === locale) return;
      const previous = confirmedLocale.current;
      setLocaleState(next);
      document.documentElement.lang = next;
      startLocaleTransition(async () => {
        try {
          const confirmed = await setAppLocaleAction(next);
          confirmedLocale.current = confirmed;
          setLocaleState(confirmed);
          document.documentElement.lang = confirmed;
        } catch {
          // Never leave the client shell in a language the server did not
          // accept. A later attempt can safely retry the preference change.
          setLocaleState(previous);
          document.documentElement.lang = previous;
        }
      });
    },
    [locale],
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
