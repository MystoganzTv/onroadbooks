import type { JWSTransactionDecodedPayload, JWSRenewalInfoDecodedPayload } from "@apple/app-store-server-library";
import type { Subscription, SubscriptionStatus } from "./types";

export const APPLE_BUNDLE_ID = "com.mystodev.onroadbooks";
export const APPLE_APP_ID = 6806707411;
export const APPLE_GROUP_ID = "22418234";
export const APPLE_PRODUCTS = {
  "com.mystodev.onroadbooks.starter.monthly": "SOLO",
  "com.mystodev.onroadbooks.pro.monthly": "OWNER",
} as const;
export type AppleEnvironment = "Production" | "Sandbox";
export function isAppleSubscription(id: string | null | undefined) { return Boolean(id?.startsWith("apple:")); }
export function appleProviderId(environment: AppleEnvironment, originalId: string) { return `apple:${environment}:${originalId}`; }
export function applePurchaseBlocked(subscription: Subscription) {
  // A previous Stripe customer also represents an in-flight web checkout.
  return !isAppleSubscription(subscription.providerSubscriptionId) &&
    Boolean(subscription.providerCustomerId || subscription.providerSubscriptionId) && subscription.status !== "CANCELED";
}

/** Only call with an Apple-verified payload. Business binding is mandatory, including restores. */
export function validateAppleTransaction(tx: JWSTransactionDecodedPayload, token: string, environment: AppleEnvironment) {
  if (tx.bundleId !== APPLE_BUNDLE_ID || tx.environment !== environment ||
      tx.subscriptionGroupIdentifier !== APPLE_GROUP_ID || tx.type !== "Auto-Renewable Subscription" ||
      tx.inAppOwnershipType !== "PURCHASED" || !tx.productId || !Object.hasOwn(APPLE_PRODUCTS, tx.productId) ||
      !tx.originalTransactionId || !/^\d+$/.test(tx.originalTransactionId) ||
      !tx.transactionId || !/^\d+$/.test(tx.transactionId) ||
      !tx.expiresDate || !Number.isFinite(tx.expiresDate) || !tx.purchaseDate ||
      tx.appAccountToken?.toLowerCase() !== token.toLowerCase()) {
    throw new Error("La compra no pertenece a esta cuenta de OnRoad Books o no es un plan compatible.");
  }
  return APPLE_PRODUCTS[tx.productId as keyof typeof APPLE_PRODUCTS];
}

export function appleEntitlement(tx: JWSTransactionDecodedPayload, status: number, renewal?: JWSRenewalInfoDecodedPayload, now = Date.now()): { status: SubscriptionStatus; expiresAt: number } {
  const grace = status === 4 && renewal?.originalTransactionId === tx.originalTransactionId
    ? renewal?.gracePeriodExpiresDate ?? 0 : 0;
  const expiresAt = Math.max(tx.expiresDate ?? 0, grace);
  if (tx.revocationDate || tx.isUpgraded || status === 5) return { status: "CANCELED", expiresAt: Math.min(now, expiresAt) };
  if ((status === 1 || status === 4) && expiresAt > now) return { status: "ACTIVE", expiresAt };
  return { status: status === 3 ? "PAST_DUE" : "CANCELED", expiresAt };
}
