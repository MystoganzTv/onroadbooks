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
    assert.equal(PRIMARY_NAV.some((candidate) => candidate.href === "/invoices"), false);
    assert.equal(PRIMARY_NAV.some((candidate) => candidate.href === "/settlements"), false);
    assert.equal(navAvailability(item("/analytics/cost-per-mile"), empty).enabled, false);
    assert.equal(navAvailability(item("/reports"), empty).enabled, false);
  });

  it("shows IFTA only when reporting is explicitly enabled", () => {
    assert.equal(navAvailability(item("/ifta"), empty).enabled, false);
    for (const iftaApplicability of ["UNKNOWN", "LIKELY_NOT_REQUIRED", "LIKELY_REQUIRED"] as const) {
      assert.equal(navAvailability(item("/ifta"), {
        ...empty, iftaApplicability, hasIftaDecisionPending: true,
      }).enabled, false);
    }
    assert.equal(navAvailability(item("/ifta"), {
      ...empty, hasIftaActivity: true,
    }).enabled, true);
  });

  it("keeps owner planning out of unrelated roles, and Fleet surfaces out of the owner-operator menu", () => {
    assert.equal(isNavVisibleToRole(item("/reserves"), "OWNER"), true);
    assert.equal(isNavVisibleToRole(item("/reserves"), "BOOKKEEPER"), false);
    // ADR 0031: Fleet and Driver Pay are hidden; Drivers is on every plan.
    assert.equal(PRIMARY_NAV.some((candidate) => candidate.href === "/driver-settlements"), false);
    assert.equal(PRIMARY_NAV.some((candidate) => candidate.href === "/fleet"), false);
    assert.equal(item("/drivers").fleetOnly ?? false, false);
    assert.equal(isNavVisibleToRole(item("/financing"), "BOOKKEEPER"), true);
    assert.equal(isNavVisibleToRole(item("/financing"), "DISPATCHER"), false);
    assert.equal(PRIMARY_NAV.some((candidate) => candidate.href === "/team"), false);
  });
});
