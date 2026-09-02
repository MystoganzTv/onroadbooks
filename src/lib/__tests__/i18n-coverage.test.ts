import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, it } from "node:test";

import { SHELL_COPY } from "../i18n";
import { WEB_DICTIONARIES } from "../i18n/dictionaries";
import { localizeError } from "../i18n/errors";
import { LANDING_COPY } from "../marketing/copy";

function strings(value: unknown, prefix = ""): Map<string, string> {
  const result = new Map<string, string>();
  if (!value || typeof value !== "object") return result;
  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof child === "string") result.set(path, child);
    else for (const entry of strings(child, path)) result.set(...entry);
  }
  return result;
}

function placeholders(value: string): string[] {
  return [...value.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
}

function filesUnder(root: string, predicate: (path: string) => boolean): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(root)) {
    const path = join(root, entry);
    if (statSync(path).isDirectory()) files.push(...filesUnder(path, predicate));
    else if (predicate(path)) files.push(path);
  }
  return files;
}

describe("typed web dictionaries", () => {
  it("keeps every locale complete, non-empty and interpolation-compatible", () => {
    for (const [area, locales] of Object.entries({
      app: WEB_DICTIONARIES,
      shell: SHELL_COPY,
      marketing: LANDING_COPY,
    })) {
      const english = strings(locales.en);
      const spanish = strings(locales.es);
      assert.deepEqual([...spanish.keys()].sort(), [...english.keys()].sort(), `${area} locale keys differ`);

      for (const [key, source] of english) {
        const translated = spanish.get(key);
        assert.ok(source.trim(), `${area}.${key} is empty in English`);
        assert.ok(translated?.trim(), `${area}.${key} is empty in Spanish`);
        assert.deepEqual(
          placeholders(translated ?? ""),
          placeholders(source),
          `${area}.${key} changed placeholders`,
        );
      }
    }
  });

  it("localizes known server errors and never leaks an English fallback in Spanish", () => {
    assert.equal(localizeError("Load not found.", "es"), "No se encontró la carga.");
    assert.equal(
      localizeError("Bringing that truck back would put you over your plan's limit of 8.", "es"),
      "Devolver ese camión al servicio superaría el límite de 8 de tu plan.",
    );
    assert.equal(localizeError("Unexpected internal detail", "es"), "No pudimos completar esa acción. Inténtalo otra vez.");
  });
});

describe("web i18n regression guard", () => {
  const root = process.cwd();

  it("requires every authenticated page to resolve the app locale", () => {
    const appRoot = join(root, "src/app/(app)");
    const pages = filesUnder(appRoot, (path) => path.endsWith("/page.tsx"));
    const missing = pages
      .filter((path) => {
        const source = readFileSync(path, "utf8");
        return !source.includes("getAppLocale") && !source.includes("redirect(");
      })
      .map((path) => relative(root, path));
    assert.deepEqual(missing, [], `Authenticated pages without locale resolution:\n${missing.join("\n")}`);
  });

  it("forbids legacy inline translation helpers and raw action-error rendering", () => {
    const roots = [join(root, "src/app"), join(root, "src/components")];
    const files = roots.flatMap((dir) => filesUnder(dir, (path) => /\.(ts|tsx)$/.test(path)))
      .filter((path) => !path.includes("/api/mobile/") && !path.includes("/components/mobile/"));
    const violations: string[] = [];
    for (const path of files) {
      const source = readFileSync(path, "utf8");
      if (/\bappText\s*\(/.test(source)) violations.push(`${relative(root, path)}: appText`);
      if (/locale\s*===\s*["']es["']\s*\?\s*["'][^"']+["']/.test(source)) {
        violations.push(`${relative(root, path)}: inline locale copy`);
      }
      if (/toast\.error\(result\.error\)/.test(source)) violations.push(`${relative(root, path)}: raw toast error`);
      if (/set(?:Form)?Error\(result\.error\)/.test(source)) violations.push(`${relative(root, path)}: raw inline error`);
    }
    assert.deepEqual(violations, [], `i18n regressions:\n${violations.join("\n")}`);
  });
});
