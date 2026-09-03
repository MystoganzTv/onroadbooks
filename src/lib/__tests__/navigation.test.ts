import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  navAvailability,
  isNavVisibleToRole,
  PRIMARY_NAV,
  type NavigationReadiness,
} from "../../components/shell/nav-items";

const empty: NavigationReadiness = {
  hasLoads: false,
  hasFinancialActivity: false,
  hasDriverPayActivity: false,
  hasIftaActivity: false,
  hasIftaDecisionPending: false,
  iftaApplicability: "UNKNOWN",
};

function item(href: string) {
  const found = PRIMARY_NAV.find((candidate) => candidate.href === href);
  if (!found) throw new Error(`Missing navigation item ${href}`);
  return found;
}

describe("progressive navigation", () => {
  it("keeps first-entry workflows available in an empty workspace", () => {
    for (const href of ["/loads", "/calculator", "/expenses", "/fuel", "/financing", "/reserves", "/truck"]) {
      assert.equal(navAvailability(item(href), empty).enabled, true, href);
    }
  });

  it("holds result screens until their prerequisite exists", () => {
    assert.equal(navAvailability(item("/invoices"), empty).badge, "Add load");
    assert.equal(navAvailability(item("/settlements"), empty).badge, "No activity");
    assert.equal(navAvailability(item("/analytics/cost-per-mile"), empty).enabled, false);
    assert.equal(navAvailability(item("/reports"), empty).enabled, false);
  });

  it("explains whether IFTA needs setup or is not indicated", () => {
    assert.equal(navAvailability(item("/ifta"), empty).badge, "Set up");
    assert.equal(
      navAvailability(item("/ifta"), {
        ...empty,
        iftaApplicability: "LIKELY_NOT_REQUIRED",
      }).badge,
      "Not needed",
    );
    assert.equal(
      navAvailability(item("/ifta"), {
        ...empty,
        iftaApplicability: "LIKELY_REQUIRED",
      }).enabled,
      true,
    );
  });

  it("keeps owner planning and driver pay out of unrelated roles", () => {
    assert.equal(isNavVisibleToRole(item("/reserves"), "OWNER"), true);
    assert.equal(isNavVisibleToRole(item("/reserves"), "BOOKKEEPER"), false);
    assert.equal(isNavVisibleToRole(item("/settlements"), "ADMIN"), false);
    assert.equal(isNavVisibleToRole(item("/driver-settlements"), "ADMIN"), true);
    assert.equal(isNavVisibleToRole(item("/driver-settlements"), "BOOKKEEPER"), false);
    assert.equal(isNavVisibleToRole(item("/financing"), "BOOKKEEPER"), true);
    assert.equal(isNavVisibleToRole(item("/financing"), "DISPATCHER"), false);
    assert.equal(PRIMARY_NAV.some((candidate) => candidate.href === "/team"), false);
  });
});
