import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    container: { center: true, padding: "1rem" },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        surface: {
          DEFAULT: "hsl(var(--surface))",
          raised: "hsl(var(--surface-raised))",
          sunken: "hsl(var(--surface-sunken))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar))",
          foreground: "hsl(var(--sidebar-foreground))",
          strong: "hsl(var(--sidebar-strong))",
          border: "hsl(var(--sidebar-border))",
          accent: "hsl(var(--sidebar-accent))",
        },
        pos: {
          DEFAULT: "hsl(var(--pos))",
          soft: "hsl(var(--pos-soft))",
        },
        neg: {
          DEFAULT: "hsl(var(--neg))",
          soft: "hsl(var(--neg-soft))",
        },
        warn: {
          DEFAULT: "hsl(var(--warn))",
          soft: "hsl(var(--warn-soft))",
        },
        info: {
          DEFAULT: "hsl(var(--info))",
          soft: "hsl(var(--info-soft))",
        },
        // The public landing page runs its own fixed dark palette rather than
        // the app's theme tokens: it is a sales page with one look, and it
        // must not change when a visitor's system flips to light. Nothing
        // inside the product may use these.
        mkt: {
          ink: "#071426",
          deep: "#061225",
          mid: "#0A1B33",
          mid2: "#0C2440",
          panel: "#0C1F39",
          raised: "#10233F",
          amber: "#F6A81B",
          amberhi: "#FFC24A",
          amberdeep: "#D97C08",
          blue: "#4FA3F7",
          green: "#63D843",
          text: "#E8EEF7",
          sub: "#A9BBD1",
          dim: "#93A7BF",
          faint: "#6C819B",
          paper: "#F1F2F0",
          slate: "#14203a",
        },
      },
      spacing: {
        "4.5": "1.125rem",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
        // Landing page only: Archivo for the display type, Caveat for the two
        // handwritten asides. Loaded in app/page.tsx so the app bundle never
        // pays for them.
        display: ["var(--font-display)", "var(--font-sans)", "ui-sans-serif", "sans-serif"],
        script: ["var(--font-script)", "cursive"],
      },
      fontSize: {
        // Reading scale for a dense financial UI. Everything is rem based so
        // the Text size control in the sidebar zooms the whole interface.
        "2xs": ["0.75rem", { lineHeight: "1rem" }], // 12px
        xs: ["0.8125rem", { lineHeight: "1.125rem" }], // 13px
        sm: ["0.875rem", { lineHeight: "1.25rem" }], // 14px
        md: ["0.9375rem", { lineHeight: "1.375rem" }], // 15px
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
