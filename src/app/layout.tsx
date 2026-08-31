import type { Metadata } from "next";
import { Barlow, IBM_Plex_Mono } from "next/font/google";
import { Toaster } from "sonner";

import { ThemeProvider } from "@/components/shell/theme-provider";
import { APP_NAME } from "@/lib/utils";

import "./globals.css";

/**
 * Typography.
 *
 * tailwind.config.cjs has always asked for `var(--font-sans)`, and nothing ever
 * defined it. An undefined custom property makes the whole `font-family`
 * declaration invalid at computed-value time, so the browser fell back to its
 * default serif -- the entire app, and every printed report, was rendering in
 * Times New Roman.
 *
 * Barlow is the fix rather than a neutral grotesque: it comes out of American
 * highway and transport signage, it holds up at the small sizes this interface
 * runs at, and its lining figures line up in a column. Plex Mono carries VINs,
 * formulas and anything that has to read as machine output. Both are
 * self-hosted by next/font, so there is no external request at runtime and
 * nothing for a content policy to block.
 */
const sans = Barlow({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
  fallback: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
  display: "swap",
  fallback: ["ui-monospace", "SFMono-Regular", "monospace"],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "https://onroadbooks.com"),
  title: {
    default: `${APP_NAME} | Bookkeeping Built for the Road`,
    template: `%s | ${APP_NAME}`,
  },
  description:
    "Bookkeeping and financial performance tools built for independent trucking businesses.",
};

/**
 * Applies the stored theme and interface scale before first paint, so the
 * console never flashes light or resizes after hydration.
 */
const themeScript = `(function(){try{var e=document.documentElement;var t=localStorage.getItem('onroadbooks.theme');var d=t!=='light';e.classList.toggle('dark',d);e.style.colorScheme=d?'dark':'light';var m={compact:.94,'default':1,large:1.1,xlarge:1.2};var s=m[localStorage.getItem('onroadbooks.scale')];if(s)e.style.setProperty('--ui-scale',String(s));}catch(err){document.documentElement.classList.add('dark');}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`dark ${sans.variable} ${mono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <ThemeProvider>
          {children}
          <Toaster
            position="bottom-right"
            toastOptions={{
              classNames: {
                toast:
                  "!bg-card !border-border !text-foreground !rounded-md !text-sm !shadow-lg",
                description: "!text-muted-foreground",
              },
            }}
          />
        </ThemeProvider>
      </body>
    </html>
  );
}
