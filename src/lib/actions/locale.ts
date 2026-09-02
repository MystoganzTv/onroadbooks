"use server";

import { cookies } from "next/headers";

import { requireSession } from "@/lib/auth";
import {
  APP_LOCALE_COOKIE,
  isAppLocale,
  type AppLocale,
} from "@/lib/i18n";

/**
 * Persist the signed-in web app language on the server.
 *
 * Setting the cookie in a Server Action makes Next render the current RSC tree
 * again in the same response, so server-rendered pages and client UI cannot
 * drift into different languages.
 */
export async function setAppLocaleAction(value: unknown): Promise<AppLocale> {
  await requireSession();
  if (!isAppLocale(value)) throw new Error("Unsupported locale");

  const store = await cookies();
  store.set(APP_LOCALE_COOKIE, value, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  return value;
}
