import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { APPLE_PRODUCTS, APPLE_BUNDLE_ID, APPLE_GROUP_ID, appleEntitlement, applePurchaseBlocked, validateAppleTransaction } from "../apple-products";
import { appleVerifier, verifyAppleTransaction } from "../apple-billing";
import { canWrite } from "../plans";
import type { Subscription } from "../types";
import type { JWSTransactionDecodedPayload } from "@apple/app-store-server-library";

const token = "ebd729a8-2a6a-4354-a0d8-bcbfe9b042c2";
const now = Date.now();
const tx: JWSTransactionDecodedPayload = {
  appAccountToken: token, environment: "Production", bundleId: APPLE_BUNDLE_ID,
  subscriptionGroupIdentifier: APPLE_GROUP_ID, productId: Object.keys(APPLE_PRODUCTS)[0],
  originalTransactionId: "10000001", transactionId: "10000002", inAppOwnershipType: "PURCHASED",
  type: "Auto-Renewable Subscription", purchaseDate: now - 10000, expiresDate: now + 10000,
};
const subscription: Subscription = {
  id: "sub", businessId: "business", plan: "SOLO", status: "ACTIVE", currentPeriodEnd: new Date(now + 10000).toISOString(),
  providerCustomerId: null, providerSubscriptionId: "apple:Production:10000001", startedAt: new Date(now).toISOString(), updatedAt: new Date(now).toISOString(),
};
describe("Apple subscription trust and entitlement boundaries", () => {
  it("offers only the two configured products and maps verified receipts to their plan", () => {
    assert.deepEqual(Object.values(APPLE_PRODUCTS), ["SOLO", "OWNER"]);
    assert.equal(validateAppleTransaction(tx, token.toUpperCase(), "Production"), "SOLO");
    assert.equal(validateAppleTransaction({ ...tx, productId: Object.keys(APPLE_PRODUCTS)[1] }, token, "Production"), "OWNER");
  });
  it("rejects cross-account restore, wrong app/group, unrecognized products, family sharing and wrong environments", () => {
    for (const patch of [
      { appAccountToken: undefined }, { appAccountToken: "another-owner" }, { bundleId: "another.app" },
      { environment: "Sandbox" }, { environment: "Xcode" }, { productId: "fleet" },
      { subscriptionGroupIdentifier: "other-group" }, { inAppOwnershipType: "FAMILY_SHARED" },
      { type: "Consumable" }, { originalTransactionId: undefined }, { expiresDate: undefined },
    ]) assert.throws(() => validateAppleTransaction({ ...tx, ...patch }, token, "Production"));
  });
  it("does not grant on forged JWS, including a claimed sandbox environment", async () => {
    const fake = `${Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url")}.${Buffer.from(JSON.stringify(tx)).toString("base64url")}.`;
    await assert.rejects(verifyAppleTransaction(fake));
    await assert.rejects(appleVerifier("Sandbox").verifyAndDecodeTransaction(fake));
  });
  it("expires access at the signed instant even when a notification is delayed", () => {
    assert.equal(canWrite(subscription), true);
    assert.equal(canWrite({ ...subscription, currentPeriodEnd: new Date(now - 1).toISOString() }), false);
    assert.equal(canWrite({ ...subscription, currentPeriodEnd: null }), false);
  });
  it("honors active paid time and removes revoked, refunded, upgraded and expired rights", () => {
    assert.equal(appleEntitlement(tx, 1, undefined, now).status, "ACTIVE");
    assert.equal(appleEntitlement({ ...tx, revocationDate: now - 1 }, 1, undefined, now).status, "CANCELED");
    assert.equal(appleEntitlement({ ...tx, isUpgraded: true }, 1, undefined, now).status, "CANCELED");
    assert.equal(appleEntitlement(tx, 5, undefined, now).status, "CANCELED");
    assert.equal(appleEntitlement({ ...tx, expiresDate: now }, 1, undefined, now).status, "CANCELED");
    assert.equal(appleEntitlement(tx, 3, undefined, now).status, "PAST_DUE");
  });
  it("accepts grace only for its own signed renewal chain", () => {
    const expired = { ...tx, expiresDate: now - 1 };
    const renewal = { originalTransactionId: tx.originalTransactionId, gracePeriodExpiresDate: now + 10000 };
    assert.equal(appleEntitlement(expired, 4, renewal, now).status, "ACTIVE");
    assert.equal(appleEntitlement(expired, 4, { ...renewal, originalTransactionId: "other" }, now).status, "CANCELED");
    assert.equal(appleEntitlement(expired, 2, renewal, now).status, "CANCELED");
  });
  it("blocks duplicate purchases for existing web subscriptions and pending web checkouts", () => {
    assert.equal(applePurchaseBlocked(subscription), false);
    assert.equal(applePurchaseBlocked({ ...subscription, providerSubscriptionId: "sub_stripe" }), true);
    assert.equal(applePurchaseBlocked({ ...subscription, providerSubscriptionId: null, providerCustomerId: "cus_pending" }), true);
    assert.equal(applePurchaseBlocked({ ...subscription, providerSubscriptionId: "sub_stripe", status: "CANCELED" }), false);
  });
});
