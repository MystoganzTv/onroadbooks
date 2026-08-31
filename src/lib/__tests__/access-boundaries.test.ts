import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { documentOwnerExists } from "../documents";
import {
  IMAGE_SIZE_FLOOR,
  MAX_IMAGE_EDGE,
  PDF_SIZE_FLOOR,
  keepSmaller,
  renamedAs,
  shouldOptimizeImage,
  shouldOptimizePdf,
  targetDimensions,
} from "../document-optimization";
import { invitationSessionFromUrl, invitationSessionSchema } from "../invitation-session";
import { isPlatformAdminEmail, platformAdminEmails } from "../platform-admin";
import { isSameOriginRequest } from "../request-origin";
import type { Dataset } from "../types";

describe("invitation session boundary", () => {
  it("accepts a PKCE code without requiring a browser Supabase connection", () => {
    assert.deepEqual(invitationSessionFromUrl("?code=pkce-code", ""), {
      ok: true,
      session: { code: "pkce-code" },
    });
  });

  it("supports legacy hash sessions and rejects incomplete credentials", () => {
    assert.deepEqual(
      invitationSessionFromUrl("", "#access_token=access&refresh_token=refresh"),
      { ok: true, session: { accessToken: "access", refreshToken: "refresh" } },
    );
    assert.equal(invitationSessionFromUrl("", "#access_token=access").ok, false);
    assert.equal(invitationSessionSchema.safeParse({ code: "ok", unexpected: true }).success, false);
  });

  it("surfaces an identity-provider error instead of spinning forever", () => {
    assert.deepEqual(invitationSessionFromUrl("?error_description=Invite%20expired", ""), {
      ok: false,
      error: "Invite expired",
    });
  });
});

describe("platform admin allowlist", () => {
  it("normalizes a comma-separated environment value", () => {
    const configured = platformAdminEmails(" OWNER@Example.com, second@example.com , ");
    assert.equal(isPlatformAdminEmail("owner@example.com", configured), true);
    assert.equal(isPlatformAdminEmail(" SECOND@example.com ", configured), true);
    assert.equal(isPlatformAdminEmail("outsider@example.com", configured), false);
  });

  it("denies everyone when no platform admins are configured", () => {
    assert.equal(isPlatformAdminEmail("owner@example.com", platformAdminEmails("")), false);
  });
});

describe("document ownership boundary", () => {
  const dataset = {
    loads: [{ id: "load-1" }],
    expenses: [{ id: "expense-1" }],
    maintenanceRecords: [{ id: "maintenance-1" }],
    trucks: [{ id: "truck-primary" }, { id: "truck-secondary" }, { id: "truck-third" }],
  } as unknown as Pick<Dataset, "loads" | "expenses" | "maintenanceRecords" | "trucks">;

  it("accepts every truck owned by the Fleet, including secondary units", () => {
    assert.equal(documentOwnerExists(dataset, "TRUCK", "truck-primary"), true);
    assert.equal(documentOwnerExists(dataset, "TRUCK", "truck-secondary"), true);
    assert.equal(documentOwnerExists(dataset, "TRUCK", "truck-third"), true);
  });

  it("rejects another workspace's truck and preserves other owner checks", () => {
    assert.equal(documentOwnerExists(dataset, "TRUCK", "foreign-truck"), false);
    assert.equal(documentOwnerExists(dataset, "LOAD", "load-1"), true);
    assert.equal(documentOwnerExists(dataset, "EXPENSE", "expense-1"), true);
    assert.equal(documentOwnerExists(dataset, "MAINTENANCE", "maintenance-1"), true);
  });
});

describe("document upload origin boundary", () => {
  it("uses Host when a proxy or dev server rewrites Request.url", () => {
    const request = new Request("http://localhost:4173/api/documents", {
      headers: { host: "127.0.0.1:4173", origin: "http://127.0.0.1:4173" },
    });
    assert.equal(isSameOriginRequest(request), true);
  });

  it("refuses a different browser origin and malformed origins", () => {
    assert.equal(
      isSameOriginRequest(new Request("https://onroadbooks.com/api/documents", {
        headers: { host: "onroadbooks.com", origin: "https://attacker.example" },
      })),
      false,
    );
    assert.equal(
      isSameOriginRequest(new Request("https://onroadbooks.com/api/documents", {
        headers: { host: "onroadbooks.com", origin: "not a url" },
      })),
      false,
    );
  });
});

describe("browser document optimization", () => {
  const fake = (type: string, size: number) => ({ type, size }) as Pick<File, "type" | "size">;

  it("keeps the original unless a candidate is meaningfully smaller", () => {
    assert.equal(keepSmaller(6_200, 2_271_000), false);
    assert.equal(keepSmaller(1_000, 950), false);
    assert.equal(keepSmaller(1_000, 899), true);
    assert.equal(keepSmaller(54_900_000, 3_080_000), true);
  });

  it("only optimizes large supported images and PDFs", () => {
    assert.equal(shouldOptimizeImage(fake("image/jpeg", IMAGE_SIZE_FLOOR + 1)), true);
    assert.equal(shouldOptimizeImage(fake("image/png", IMAGE_SIZE_FLOOR)), false);
    assert.equal(shouldOptimizeImage(fake("image/gif", 9_000_000)), false);
    assert.equal(shouldOptimizePdf(fake("application/pdf", PDF_SIZE_FLOOR + 1)), true);
    assert.equal(shouldOptimizePdf(fake("application/pdf", PDF_SIZE_FLOOR)), false);
  });

  it("resizes proportionally without ever enlarging", () => {
    assert.deepEqual(targetDimensions(800, 600), { width: 800, height: 600, resized: false });
    assert.deepEqual(targetDimensions(4_000, 3_000), {
      width: MAX_IMAGE_EDGE,
      height: 1_200,
      resized: true,
    });
    assert.equal(targetDimensions(0, 0), null);
  });

  it("renames optimized files without damaging dotted names", () => {
    assert.equal(renamedAs("truck.insurance.scan.PDF", "pdf"), "truck.insurance.scan.pdf");
    assert.equal(renamedAs("registration", "webp"), "registration.webp");
  });
});
