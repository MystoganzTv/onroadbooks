import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it, mock } from "node:test";
import { randomUUID } from "node:crypto";
import { AppStoreServerAPIClient, SignedDataVerifier, type JWSTransactionDecodedPayload } from "@apple/app-store-server-library";
import { getAuthStore, getRepository } from "../db";
import { securityPool } from "../auth/security-store";
import { appleAccountToken, syncAppleReceipt, syncAppleSubscription, handleAppleNotification } from "../apple-billing";
import { APPLE_BUNDLE_ID, APPLE_GROUP_ID, APPLE_PRODUCTS } from "../apple-products";
import { canWrite } from "../plans";
import type { User } from "../types";

describe("Apple billing SQL contract (disposable database only)", { skip: process.env.ONROAD_DISPOSABLE_DATABASE !== "1" }, () => {
  let owner: User;
  let original: JWSTransactionDecodedPayload;
  let canonical: JWSTransactionDecodedPayload;
  let status = 1;
  before(() => {
    process.env.DATA_SOURCE = process.env.ONROAD_TEST_BACKEND === "drizzle" ? "neon" : "postgres";
    process.env.APPLE_IAP_PRIVATE_KEY = "test-double-no-network";
    process.env.APPLE_IAP_KEY_ID = "test";
    process.env.APPLE_IAP_ISSUER_ID = "test";
    // Only Apple's network/signature boundary is substituted. SQL and account isolation are real.
    mock.method(SignedDataVerifier.prototype, "verifyAndDecodeTransaction", async (signed: string) => signed === "canonical" ? canonical : original);
    mock.method(SignedDataVerifier.prototype, "verifyAndDecodeNotification", async () => ({ notificationType: "REFUND", data: { signedTransactionInfo: "old-receipt" } }));
    mock.method(AppStoreServerAPIClient.prototype, "getAllSubscriptionStatuses", async () => ({
      bundleId: APPLE_BUNDLE_ID, environment: canonical.environment,
      data: [{ subscriptionGroupIdentifier: APPLE_GROUP_ID, lastTransactions: [{ status, signedTransactionInfo: "canonical" }] }],
    }));
  });
  beforeEach(async () => {
    owner = await getAuthStore().createOwner({ email: `apple-${randomUUID()}@example.test`, name: "Apple test", businessName: "Disposable purchase test", passwordHash: "not-a-password", plan: "OWNER" });
    const token = await appleAccountToken(owner.businessId);
    const id = String(Date.now()) + String(Math.floor(Math.random() * 100000));
    original = { appAccountToken: token!, originalTransactionId: id, transactionId: id, bundleId: APPLE_BUNDLE_ID, environment: "Production", subscriptionGroupIdentifier: APPLE_GROUP_ID, productId: Object.keys(APPLE_PRODUCTS)[0], type: "Auto-Renewable Subscription", inAppOwnershipType: "PURCHASED", purchaseDate: Date.now(), expiresDate: Date.now() + 3600000 };
    canonical = { ...original }; status = 1;
  });
  after(async () => { mock.restoreAll(); await securityPool()?.end(); });
  it("creates one stable account token and atomically claims duplicate deliveries once", async () => {
    assert.equal(await appleAccountToken(owner.businessId), original.appAccountToken);
    await syncAppleReceipt(owner.businessId, "old-receipt");
    await syncAppleReceipt(owner.businessId, "old-receipt");
    const { subscription } = await getRepository(owner.businessId).getDataset();
    assert.equal(subscription.plan, "SOLO"); assert.equal(subscription.status, "ACTIVE");
    assert.equal(subscription.currentPeriodEnd, new Date(canonical.expiresDate!).toISOString());
    const claims = await securityPool()!.query(`SELECT id FROM "ApplePurchase" WHERE "businessId"=$1`, [owner.businessId]);
    assert.equal(claims.rowCount, 1);
  });
  it("never lets another workspace restore an existing purchase", async () => {
    await syncAppleReceipt(owner.businessId, "old-receipt");
    const other = await getAuthStore().createOwner({ email: `other-${randomUUID()}@example.test`, name: "Other", businessName: "Other", passwordHash: "not-a-password", plan: "OWNER" });
    await appleAccountToken(other.businessId);
    await assert.rejects(syncAppleReceipt(other.businessId, "old-receipt"), /no pertenece/);
    assert.equal((await getRepository(other.businessId).getDataset()).subscription.status, "TRIALING");
  });
  it("re-reads refunds so replaying an old active receipt and delayed notifications cannot reactivate access", async () => {
    await syncAppleReceipt(owner.businessId, "old-receipt");
    canonical = { ...canonical, revocationDate: Date.now() }; status = 5;
    await handleAppleNotification("signed-notification-test-double");
    await syncAppleReceipt(owner.businessId, "old-receipt");
    const { subscription } = await getRepository(owner.businessId).getDataset();
    assert.equal(subscription.status, "CANCELED"); assert.equal(canWrite(subscription), false);
  });
  it("keeps the newer plan when an old Starter receipt arrives after a Pro upgrade", async () => {
    await syncAppleReceipt(owner.businessId, "old-receipt");
    canonical = { ...canonical, productId: Object.keys(APPLE_PRODUCTS)[1], transactionId: canonical.transactionId! + "1", purchaseDate: Date.now() + 1 };
    await syncAppleReceipt(owner.businessId, "old-receipt");
    assert.equal((await getRepository(owner.businessId).getDataset()).subscription.plan, "OWNER");
  });
  it("preserves a web subscription and rolls back the Apple claim on conflict", async () => {
    await getRepository(owner.businessId).updateSubscription({ plan: "OWNER", status: "ACTIVE", providerSubscriptionId: `sub_${randomUUID()}` });
    await assert.rejects(syncAppleReceipt(owner.businessId, "old-receipt"), /suscripción web/);
    const claims = await securityPool()!.query(`SELECT id FROM "ApplePurchase" WHERE "businessId"=$1`, [owner.businessId]);
    assert.equal(claims.rowCount, 0);
  });
  it("never grants sandbox access to an ordinary production account", async () => {
    original.environment = "Sandbox"; canonical.environment = "Sandbox";
    await assert.rejects(syncAppleSubscription(owner.businessId, original.originalTransactionId!, "Sandbox"), /cuentas de revisión/);
    assert.equal((await getRepository(owner.businessId).getDataset()).subscription.status, "TRIALING");
  });
});
