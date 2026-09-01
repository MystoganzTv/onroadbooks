import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ASSIGNABLE_ROLES, PERMISSION_IDS, roleCan, type Permission } from "../roles";
import { isPendingMemberInvitation } from "../team";
import type { MemberRole } from "../types";

describe("workspace roles", () => {
  it("keeps ownership and owner planning exclusive to the owner", () => {
    for (const role of ["ADMIN", "BOOKKEEPER", "DISPATCHER", "VIEWER"] as const) {
      assert.equal(roleCan(role, "manage_billing"), false);
      assert.equal(roleCan(role, "manage_team"), false);
      assert.equal(roleCan(role, "manage_account"), false);
      assert.equal(roleCan(role, "manage_owner_finances"), false);
    }
    assert.equal(roleCan("OWNER", "manage_billing"), true);
    assert.equal(roleCan("OWNER", "manage_team"), true);
    assert.equal(roleCan("OWNER", "manage_account"), true);
    assert.equal(roleCan("OWNER", "manage_owner_finances"), true);
  });

  it("separates bookkeeping from dispatch and keeps viewer read-only", () => {
    assert.equal(roleCan("BOOKKEEPER", "manage_expenses"), true);
    assert.equal(roleCan("BOOKKEEPER", "manage_finances"), true);
    assert.equal(roleCan("BOOKKEEPER", "manage_loads"), false);
    assert.equal(roleCan("BOOKKEEPER", "manage_driver_settlements"), false);
    assert.equal(roleCan("BOOKKEEPER", "manage_ifta"), false);
    assert.equal(roleCan("DISPATCHER", "manage_loads"), true);
    assert.equal(roleCan("DISPATCHER", "manage_maintenance"), true);
    assert.equal(roleCan("DISPATCHER", "manage_finances"), false);
    assert.equal(roleCan("VIEWER", "manage_loads"), false);
    assert.equal(roleCan("VIEWER", "manage_expenses"), false);
  });

  it("matches the complete permission matrix", () => {
    const expected: Record<MemberRole, readonly Permission[]> = {
      OWNER: PERMISSION_IDS,
      ADMIN: [
        "manage_business",
        "manage_fleet",
        "manage_drivers",
        "manage_driver_settlements",
        "manage_loads",
        "manage_expenses",
        "manage_fuel",
        "manage_maintenance",
        "manage_finances",
        "manage_ifta",
      ],
      BOOKKEEPER: [
        "manage_expenses",
        "manage_fuel",
        "manage_finances",
      ],
      DISPATCHER: [
        "manage_loads",
        "manage_fuel",
        "manage_maintenance",
        "manage_drivers",
        "manage_ifta",
      ],
      VIEWER: [],
    };

    for (const role of Object.keys(expected) as MemberRole[]) {
      for (const permission of PERMISSION_IDS) {
        assert.equal(
          roleCan(role, permission),
          expected[role].includes(permission),
          `${role} / ${permission}`,
        );
      }
    }
  });
});

describe("member invitations", () => {
  const invitation = {
    role: "DISPATCHER" as const,
    invitedAt: "2026-08-31T12:00:00.000Z",
    joinedAt: null,
  };

  it("accepts only an unclaimed non-owner invitation", () => {
    assert.equal(isPendingMemberInvitation(invitation), true);
    assert.equal(isPendingMemberInvitation({ ...invitation, role: "OWNER" }), false);
    assert.equal(isPendingMemberInvitation({ ...invitation, invitedAt: null }), false);
    assert.equal(
      isPendingMemberInvitation({ ...invitation, joinedAt: "2026-08-31T12:05:00.000Z" }),
      false,
    );
    assert.equal(isPendingMemberInvitation(null), false);
  });

  it("does not offer Viewer or Driver as assignable app roles", () => {
    assert.deepEqual(ASSIGNABLE_ROLES, ["ADMIN", "BOOKKEEPER", "DISPATCHER"]);
  });
});
