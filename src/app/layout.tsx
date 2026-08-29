import type { Metadata } from "next";
import { Toaster } from "sonner";

import { ThemeProvider } from "@/components/shell/theme-provider";
import { APP_NAME } from "@/lib/utils";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: `${APP_NAME} - Box Truck Financial Console`,
    template: `%s - ${APP_NAME}`,
  },
  description:
    "Revenue, cost and profit per mile for a single box truck operation, by month and half month.",
};

/**
 * Applies the stored theme and interface scale before first paint, so the
 * console never flashes light or resizes after hydration.
 */
const themeScript = `(function(){try{var e=document.documentElement;var t=localStorage.getItem('truckledger.theme');var d=t!=='light';e.classList.toggle('dark',d);e.style.colorScheme=d?'dark':'light';var m={compact:.94,'default':1,large:1.1,xlarge:1.2};var s=m[localStorage.getItem('truckledger.scale')];if(s)e.style.setProperty('--ui-scale',String(s));}catch(err){document.documentElement.classList.add('dark');}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
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
