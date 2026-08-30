import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

function authConfig(): { url: string; key: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error("Supabase Auth is not configured.");
  }

  return { url, key };
}

/** Cookie-backed Supabase Auth client used only during the Google OAuth flow. */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  const { url, key } = authConfig();

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        for (const cookie of cookiesToSet) {
          cookieStore.set(cookie.name, cookie.value, cookie.options);
        }
      },
    },
  });
}
