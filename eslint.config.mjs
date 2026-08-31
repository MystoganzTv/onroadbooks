import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

const configuredNext = nextVitals.map((config) => {
  const rules = { ...config.rules };

  if ("react-hooks/immutability" in rules) {
    // React Compiler is not enabled. Existing forms intentionally reset when
    // dialogs open, and print SVGs use deterministic accumulators.
    rules["react-hooks/immutability"] = "off";
    rules["react-hooks/purity"] = "off";
    rules["react-hooks/set-state-in-effect"] = "off";
  }

  if ("@next/next/no-location-assign-relative-destination" in rules) {
    // Authentication changes intentionally force a full reload so no
    // client-side state survives logout or account deletion.
    rules["@next/next/no-location-assign-relative-destination"] = "off";
  }

  return { ...config, rules };
});

const configuredTypeScript = nextTypeScript.map((config) =>
  config.rules?.["@typescript-eslint/no-unused-vars"]
    ? {
        ...config,
        rules: {
          ...config.rules,
          "@typescript-eslint/no-explicit-any": "warn",
          "@typescript-eslint/no-unused-vars": [
            "warn",
            { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
          ],
        },
      }
    : config,
);

export default defineConfig([
  ...configuredNext,
  ...configuredTypeScript,
  {
    files: ["tailwind.config.cjs"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "src/generated/**",
    "node_modules/**",
    "data/**",
  ]),
]);
