"use client";

import * as React from "react";
import Script from "next/script";
import { Loader2 } from "lucide-react";

type CredentialResponse = { credential?: string };

type GoogleIdentityApi = {
  initialize(options: {
    client_id: string;
    callback(response: CredentialResponse): void;
    nonce: string;
    ux_mode: "popup";
    use_fedcm_for_prompt: boolean;
  }): void;
  renderButton(
    parent: HTMLElement,
    options: {
      type: "standard";
      theme: "outline_dark";
      size: "large";
      text: "continue_with";
      shape: "rectangular";
      logo_alignment: "left";
      width: number;
    },
  ): void;
};

declare global {
  interface Window {
    google?: { accounts: { id: GoogleIdentityApi } };
  }
}

async function hashNonce(nonce: string): Promise<string> {
  const encoded = new TextEncoder().encode(nonce);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function AuthOptions({ next = null }: { next?: string | null }) {
  const buttonRef = React.useRef<HTMLDivElement>(null);
  const initializedRef = React.useRef(false);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

  const initializeGoogle = React.useCallback(async () => {
    if (initializedRef.current || !buttonRef.current || !window.google || !clientId) return;
    initializedRef.current = true;

    try {
      const nonceResponse = await fetch("/api/auth/google", {
        cache: "no-store",
        credentials: "same-origin",
      });
      const nonceData = (await nonceResponse.json().catch(() => null)) as { nonce?: string } | null;
      if (!nonceResponse.ok || !nonceData?.nonce) {
        throw new Error("Could not initialize Google sign-in.");
      }

      const hashedNonce = await hashNonce(nonceData.nonce);
      window.google.accounts.id.initialize({
        client_id: clientId,
        nonce: hashedNonce,
        ux_mode: "popup",
        use_fedcm_for_prompt: true,
        callback: async ({ credential }) => {
          if (!credential) {
            setError("Google did not return a sign-in credential.");
            return;
          }

          setPending(true);
          setError(null);
          try {
            const response = await fetch("/api/auth/google", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "same-origin",
              body: JSON.stringify({ credential }),
            });
            const result = (await response.json().catch(() => null)) as {
              error?: string;
              redirectTo?: string;
            } | null;
            if (!response.ok || !result?.redirectTo) {
              throw new Error(result?.error ?? "Google sign-in could not be completed.");
            }
            window.location.assign(next ?? result.redirectTo);
          } catch (callbackError) {
            setError(
              callbackError instanceof Error
                ? callbackError.message
                : "Google sign-in could not be completed.",
            );
            setPending(false);
          }
        },
      });

      window.google.accounts.id.renderButton(buttonRef.current, {
        type: "standard",
        theme: "outline_dark",
        size: "large",
        text: "continue_with",
        shape: "rectangular",
        logo_alignment: "left",
        // Google renders a fixed-width iframe and adds its own chrome on top
        // of whatever number it is given, so it must be clamped to the range
        // Google accepts AND contained by CSS -- see `.gis-button-host` in
        // globals.css. Unclamped, the button came out ~20px wider than its slot
        // and shoved the whole sign-in page sideways inside the iOS app's
        // sign-in sheet, which is narrower than a browser tab.
        width: Math.min(400, Math.max(200, Math.floor(buttonRef.current.clientWidth) || 280)),
      });
    } catch (initializationError) {
      initializedRef.current = false;
      setError(
        initializationError instanceof Error
          ? initializationError.message
          : "Could not initialize Google sign-in.",
      );
    }
  }, [clientId, next]);

  return (
    <div className="space-y-3">
      <Script
        src="https://accounts.google.com/gsi/client"
        strategy="afterInteractive"
        onReady={() => void initializeGoogle()}
        onError={() => setError("Could not load Google sign-in. Try again.")}
      />
      <div className="relative min-h-9 w-full" aria-busy={pending}>
        <div
          ref={buttonRef}
          className={`gis-button-host${pending ? " pointer-events-none opacity-60" : ""}`}
        />
        {pending ? (
          <div
            className="absolute inset-0 flex items-center justify-center"
            aria-label="Signing in with Google"
          >
            <Loader2 className="size-4 animate-spin" />
          </div>
        ) : null}
      </div>
      {!clientId ? (
        <p className="text-center text-2xs text-neg">Google sign-in is not configured.</p>
      ) : null}
      {error ? (
        <p className="text-center text-2xs text-neg" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex items-center gap-3 text-2xs uppercase tracking-[0.12em] text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        Or continue with email
        <span className="h-px flex-1 bg-border" />
      </div>
    </div>
  );
}
