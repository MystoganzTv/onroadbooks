import { Archivo, Caveat } from "next/font/google";

/**
 * LANDING TYPOGRAPHY
 * ==================
 *
 * The app runs on Barlow (see app/layout.tsx) and the landing page keeps it
 * for body copy. Two faces are added here and nowhere else:
 *
 *   Archivo -- the display face. Tight, heavy, uppercase-friendly grotesque
 *              that carries the headlines the way highway signage does.
 *   Caveat  -- the two handwritten asides in the "profit per mile" section.
 *
 * Both are self-hosted by next/font, so there is no external request at
 * runtime and nothing for the content policy to block. They are attached in
 * app/page.tsx rather than the root layout so that the app bundle never
 * downloads a face it does not use.
 */
export const display = Archivo({
  subsets: ["latin"],
  weight: ["600", "700", "800", "900"],
  variable: "--font-display",
  display: "swap",
  fallback: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
});

export const script = Caveat({
  subsets: ["latin"],
  weight: ["600"],
  variable: "--font-script",
  display: "swap",
  fallback: ["ui-serif", "cursive"],
});
