import "server-only";

import { cookies } from "next/headers";

import { APP_LOCALE_COOKIE, isAppLocale, type AppLocale } from "@/lib/i18n";

export async function getAppLocale(): Promise<AppLocale> {
  const store = await cookies();
  const value = store.get(APP_LOCALE_COOKIE)?.value;
  return isAppLocale(value) ? value : "en";
}

