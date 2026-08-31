import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { LANDING_COPY } from "../marketing/copy";
import { TRIAL_DAYS } from "../plans";

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
