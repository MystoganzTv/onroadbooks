"use client";

import type { AppLocale } from "@/lib/i18n";
import { getWebDictionary } from "@/lib/i18n/dictionaries";

function GoogleMark() {
  return (
    <svg
      aria-hidden="true"
      className="absolute left-3 size-[18px]"
      viewBox="0 0 18 18"
    >
      <path
        fill="#4285F4"
        d="M17.64 9.205c0-.638-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.797 2.716v2.258h2.909c1.703-1.568 2.684-3.878 2.684-6.614Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.806 5.956-2.181l-2.909-2.258c-.806.54-1.835.859-3.047.859-2.344 0-4.328-1.585-5.037-3.714H.956v2.332A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.963 10.706A5.41 5.41 0 0 1 3.681 9c0-.592.102-1.168.282-1.706V4.962H.956A9 9 0 0 0 0 9c0 1.452.347 2.827.956 4.038l3.007-2.332Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.321 0 2.508.454 3.441 1.346l2.581-2.581C13.463.892 11.426 0 9 0A9 9 0 0 0 .956 4.962l3.007 2.332C4.672 5.165 6.656 3.58 9 3.58Z"
      />
    </svg>
  );
}

export function AuthOptions({
  next = null,
  locale,
}: {
  next?: string | null;
  locale: AppLocale;
}) {
  const copy = getWebDictionary(locale).auth;
  const query = next ? `?next=${encodeURIComponent(next)}` : "";
  const googleConfigured = Boolean(process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID);
  const googleHref = `/api/auth/google/oauth${query}`;

  return (
    <div className="space-y-4">
      <a
        href={googleConfigured ? googleHref : undefined}
        aria-disabled={!googleConfigured}
        tabIndex={googleConfigured ? undefined : -1}
        className="relative flex h-10 w-full items-center justify-center rounded-md border border-[#747775] bg-white px-10 text-sm font-medium text-[#1f1f1f] shadow-sm transition-colors hover:bg-[#f8faff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card aria-disabled:pointer-events-none aria-disabled:opacity-50"
      >
        <GoogleMark />
        <span>{copy.continueGoogle}</span>
      </a>

      {!googleConfigured ? (
        <p className="text-center text-2xs text-neg">{copy.googleNotConfigured}</p>
      ) : null}

      <div className="flex items-center gap-3 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        {copy.continueEmail}
        <span className="h-px flex-1 bg-border" />
      </div>
    </div>
  );
}
