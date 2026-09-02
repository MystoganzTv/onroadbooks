import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { LANDING_COPY } from "../marketing/copy";
import { TRIAL_DAYS } from "../plans";
import { APP_LOCALES, SHELL_COPY, appText, isAppLocale } from "../i18n";

describe("landing trial promise", () => {
  it("uses the product trial duration in both languages", () => {
    assert.match(LANDING_COPY.en.banner.text, new RegExp(`\\b${TRIAL_DAYS} days\\b`));
    assert.match(LANDING_COPY.en.cta.checks[0], new RegExp(`\\b${TRIAL_DAYS}-day\\b`));
    assert.match(LANDING_COPY.en.pricing.sub, new RegExp(`\\b${TRIAL_DAYS} days\\b`));

    assert.match(LANDING_COPY.es.banner.text, new RegExp(`\\b${TRIAL_DAYS} días\\b`));
    assert.match(LANDING_COPY.es.cta.checks[0], new RegExp(`\\b${TRIAL_DAYS} días\\b`));
    assert.match(LANDING_COPY.es.pricing.sub, new RegExp(`\\b${TRIAL_DAYS} días\\b`));
  });
});

describe("signed-in app language", () => {
  it("offers the same two explicit languages across the shell", () => {
    assert.deepEqual(APP_LOCALES.map((locale) => locale.id), ["en", "es"]);
    assert.equal(appText("en", "Settings", "Configuración"), "Settings");
    assert.equal(appText("es", "Settings", "Configuración"), "Configuración");
    assert.equal(SHELL_COPY.es.dashboard, "Resumen");
  });

  it("rejects an unknown cookie value instead of inventing a locale", () => {
    assert.equal(isAppLocale("en"), true);
    assert.equal(isAppLocale("es"), true);
    assert.equal(isAppLocale("fr"), false);
    assert.equal(isAppLocale(undefined), false);
  });
});
