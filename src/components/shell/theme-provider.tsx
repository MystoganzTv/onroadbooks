"use client";

import * as React from "react";

type Theme = "dark" | "light";

/** Interface zoom. Every size in the app is rem based, so this scales
 *  text, padding, control heights and table rows together. */
export type UiScale = "compact" | "default" | "large" | "xlarge";

export const UI_SCALES: { id: UiScale; label: string; value: number; hint: string }[] = [
  { id: "compact", label: "Compact", value: 0.94, hint: "Maximum rows on screen" },
  { id: "default", label: "Default", value: 1, hint: "Balanced density" },
  { id: "large", label: "Large", value: 1.1, hint: "Easier reading" },
  { id: "xlarge", label: "Largest", value: 1.2, hint: "Most readable" },
];

export function scaleValue(scale: UiScale): number {
  return UI_SCALES.find((s) => s.id === scale)?.value ?? 1;
}

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggle: () => void;
  scale: UiScale;
  setScale: (scale: UiScale) => void;
}

const ThemeContext = React.createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = "onroadbooks.theme";
const SCALE_KEY = "onroadbooks.scale";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Dark is the product default: this is an operations console, not a
  // marketing site. Light is available and fully supported.
  const [theme, setThemeState] = React.useState<Theme>("dark");
  const [scale, setScaleState] = React.useState<UiScale>("default");

  React.useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark") setThemeState(stored);

    const storedScale = window.localStorage.getItem(SCALE_KEY) as UiScale | null;
    if (storedScale && UI_SCALES.some((s) => s.id === storedScale)) setScaleState(storedScale);
  }, []);

  React.useEffect(() => {
    document.documentElement.style.setProperty("--ui-scale", String(scaleValue(scale)));
  }, [scale]);

  React.useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    root.style.colorScheme = theme;
  }, [theme]);

  const setTheme = React.useCallback((next: Theme) => {
    setThemeState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Storage can be unavailable (private mode) -- theme still applies.
    }
  }, []);

  const setScale = React.useCallback((next: UiScale) => {
    setScaleState(next);
    try {
      window.localStorage.setItem(SCALE_KEY, next);
    } catch {
      // Storage can be unavailable (private mode) -- the scale still applies.
    }
  }, []);

  const value = React.useMemo<ThemeContextValue>(
    () => ({
      theme,
      setTheme,
      toggle: () => setTheme(theme === "dark" ? "light" : "dark"),
      scale,
      setScale,
    }),
    [theme, setTheme, scale, setScale],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = React.useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used inside ThemeProvider");
  return context;
}
