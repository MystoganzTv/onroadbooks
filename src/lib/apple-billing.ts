import "server-only";
import { randomUUID } from "node:crypto";
import { AppStoreServerAPIClient, Environment, SignedDataVerifier, type JWSTransactionDecodedPayload, type JWSRenewalInfoDecodedPayload } from "@apple/app-store-server-library";
import { securityPool, withSecurityLock } from "@/lib/auth/security-store";
import { APPLE_ROOT_CERTIFICATES } from "./apple-root-certificates";
import { APPLE_APP_ID, APPLE_BUNDLE_ID, APPLE_GROUP_ID, appleEntitlement, appleProviderId, validateAppleTransaction, type AppleEnvironment } from "./apple-products";

export function appleBillingConfigured() {
  return Boolean(process.env.APPLE_IAP_PRIVATE_KEY && process.env.APPLE_IAP_KEY_ID && process.env.APPLE_IAP_ISSUER_ID && securityPool());
}
export function appleVerifier(environment: AppleEnvironment) {
  return new SignedDataVerifier(APPLE_ROOT_CERTIFICATES, true, environment as Environment, APPLE_BUNDLE_ID, APPLE_APP_ID);
}
export function appleClient(environment: AppleEnvironment) {
  if (!appleBillingConfigured()) throw new Error("Las compras de Apple no están disponibles. Inténtalo más tarde.");
  return new AppStoreServerAPIClient(process.env.APPLE_IAP_PRIVATE_KEY!.replace(/\\n/g, "\n"), process.env.APPLE_IAP_KEY_ID!, process.env.APPLE_IAP_ISSUER_ID!, APPLE_BUNDLE_ID, environment as Environment);
}
async function appleRequest<T>(request: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([request, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("Apple no respondió a tiempo. Reintenta la restauración.")), 20_000);
    })]);
  } finally { clearTimeout(timer); }
}
export async function appleAccountToken(businessId: string) {
  if (!appleBillingConfigured()) return null;
  const result = await securityPool()!.query(`INSERT INTO "AppleBillingAccount" ("businessId", "appAccountToken") VALUES ($1,$2) ON CONFLICT ("businessId") DO UPDATE SET "businessId"=EXCLUDED."businessId" RETURNING "appAccountToken"`, [businessId, randomUUID()]);
  return result.rows[0].appAccountToken as string;
}

export async function refreshAppleSubscription(businessId: string) {
  if (!appleBillingConfigured()) return;
  const result = await securityPool()!.query(`SELECT s."providerSubscriptionId", p."checkedAt" AT TIME ZONE 'UTC' AS "checkedAt" FROM "Subscription" s LEFT JOIN "ApplePurchase" p ON p.id=s."providerSubscriptionId" WHERE s."businessId"=$1`, [businessId]);
  const row = result.rows[0];
  const match = /^apple:(Production|Sandbox):(\d+)$/.exec(row?.providerSubscriptionId ?? "");
  if (!match || (row.checkedAt && Date.now() - new Date(row.checkedAt).getTime() < 60_000)) return;
  await syncAppleSubscription(businessId, match[2], match[1] as AppleEnvironment);
}

export async function verifyAppleTransaction(signed: string) {
  // No unverified environment, product, or account data is trusted for routing.
  for (const environment of ["Production", "Sandbox"] as const) {
    try { return { transaction: await appleVerifier(environment).verifyAndDecodeTransaction(signed), environment }; }
    catch { /* A production receipt cannot pass the sandbox verifier, or vice versa. */ }
  }
  throw new Error("Apple no pudo verificar la compra.");
}

/** Re-read canonical Apple state under the same workspace lock used by Stripe.
 * Repeated/restored receipts and delayed notifications cannot resurrect refunds.
 * SQL claim + entitlement update commit together; StoreKit finishes only afterwards.
 */
export async function syncAppleSubscription(businessId: string, originalId: string, environment: AppleEnvironment) {
  return withSecurityLock(`billing:${businessId}`, async client => {
    if (!client) throw new Error("Las compras necesitan almacenamiento persistente.");
    const accounts = await client.query(`SELECT "appAccountToken" FROM "AppleBillingAccount" WHERE "businessId"=$1`, [businessId]);
    const token = accounts.rows[0]?.appAccountToken as string | undefined;
    if (!token) throw new Error("La compra no está vinculada a esta cuenta.");
    const subscriptions = await client.query(`SELECT *, "currentPeriodEnd" AT TIME ZONE 'UTC' AS "currentPeriodEnd" FROM "Subscription" WHERE "businessId"=$1 FOR UPDATE`, [businessId]);
    const current = subscriptions.rows[0];
    if (!current) throw new Error("Cuenta no disponible.");
    if (current.providerSubscriptionId && !current.providerSubscriptionId.startsWith("apple:") && current.status !== "CANCELED")
      throw new Error("Esta cuenta tiene una suscripción web. Gestiona esa suscripción antes de comprar otra.");
    if (environment === "Sandbox" && current.providerSubscriptionId && !current.providerSubscriptionId.startsWith("apple:Sandbox:"))
      throw new Error("Una compra de prueba no puede sustituir una suscripción real.");
    if (environment === "Sandbox") {
      const allowed = (process.env.APPLE_SANDBOX_ACCOUNT_EMAILS ?? "").split(",").map(value => value.trim().toLowerCase()).filter(Boolean);
      const owner = await client.query(`SELECT email FROM "User" WHERE "businessId"=$1 AND role='OWNER'`, [businessId]);
      if (!owner.rows.some(row => allowed.includes(row.email.toLowerCase())))
        throw new Error("Las compras de prueba solo están habilitadas en cuentas de revisión.");
    }
    const verifier = appleVerifier(environment);
    const response = await appleRequest(appleClient(environment).getAllSubscriptionStatuses(originalId));
    if (response.bundleId !== APPLE_BUNDLE_ID || response.environment !== environment) throw new Error("Respuesta de Apple inválida.");
    const candidates: { tx: JWSTransactionDecodedPayload; renewal?: JWSRenewalInfoDecodedPayload; status: number }[] = [];
    for (const group of response.data ?? []) {
      if (group.subscriptionGroupIdentifier !== APPLE_GROUP_ID) continue;
      for (const item of group.lastTransactions ?? []) {
        if (!item.signedTransactionInfo || !item.status) continue;
        const tx = await verifier.verifyAndDecodeTransaction(item.signedTransactionInfo);
        if (tx.appAccountToken?.toLowerCase() !== token.toLowerCase()) continue;
        validateAppleTransaction(tx, token, environment);
        const renewal = item.signedRenewalInfo ? await verifier.verifyAndDecodeRenewalInfo(item.signedRenewalInfo) : undefined;
        candidates.push({ tx, renewal, status: item.status });
      }
    }
    candidates.sort((a, b) => (b.tx.purchaseDate ?? 0) - (a.tx.purchaseDate ?? 0) || Number(a.tx.isUpgraded ?? false) - Number(b.tx.isUpgraded ?? false));
    const latest = candidates[0];
    if (!latest) throw new Error("No se encontró una suscripción de Apple para esta cuenta.");
    const { tx, renewal, status } = latest;
    const id = appleProviderId(environment, tx.originalTransactionId!);
    const claim = await client.query(`INSERT INTO "ApplePurchase" (id,"businessId","transactionId","productId","checkedAt") VALUES ($1,$2,$3,$4,NOW() AT TIME ZONE 'UTC') ON CONFLICT (id) DO UPDATE SET "transactionId"=EXCLUDED."transactionId", "productId"=EXCLUDED."productId", "checkedAt"=NOW() AT TIME ZONE 'UTC' WHERE "ApplePurchase"."businessId"=EXCLUDED."businessId" RETURNING id`, [id, businessId, tx.transactionId, tx.productId]);
    if (!claim.rowCount) throw new Error("Esta suscripción pertenece a otra cuenta.");
    // An old Apple ID's notification cannot overwrite a newer Apple subscription.
    if (current.providerSubscriptionId?.startsWith("apple:") && current.providerSubscriptionId !== id) {
      const previous = await client.query(`SELECT "checkedAt" FROM "ApplePurchase" WHERE id=$1 AND "businessId"=$2`, [current.providerSubscriptionId, businessId]);
      if (current.status === "ACTIVE" && current.currentPeriodEnd > new Date() && previous.rowCount)
        throw new Error("Ya existe otra suscripción activa en esta cuenta.");
    }
    const entitlement = appleEntitlement(tx, status, renewal);
    const plan = validateAppleTransaction(tx, token, environment);
    await client.query(`UPDATE "Subscription" SET plan=$1, status=$2, "currentPeriodEnd"=$3, "providerSubscriptionId"=$4, "updatedAt"=NOW() AT TIME ZONE 'UTC' WHERE "businessId"=$5`, [plan, entitlement.status, new Date(entitlement.expiresAt).toISOString(), id, businessId]);
    return { id: tx.transactionId!, status: entitlement.status, plan };
  });
}

export async function syncAppleReceipt(businessId: string, signed: string) {
  const { transaction, environment } = await verifyAppleTransaction(signed);
  const row = await securityPool()!.query(`SELECT "appAccountToken" FROM "AppleBillingAccount" WHERE "businessId"=$1`, [businessId]);
  validateAppleTransaction(transaction, row.rows[0]?.appAccountToken ?? "", environment);
  return syncAppleSubscription(businessId, transaction.originalTransactionId!, environment);
}

export async function handleAppleNotification(signedPayload: string) {
  let notification;
  let environment: AppleEnvironment = "Production";
  for (const candidate of ["Production", "Sandbox"] as const) {
    try { notification = await appleVerifier(candidate).verifyAndDecodeNotification(signedPayload); environment = candidate; break; }
    catch { /* Try the other Apple environment; never bypass signature checks. */ }
  }
  if (!notification) throw new Error("Invalid Apple notification");
  if (notification.notificationType === "TEST") return;
  const signed = notification.data?.signedTransactionInfo;
  if (!signed) return;
  const tx = await appleVerifier(environment).verifyAndDecodeTransaction(signed);
  if (!tx.appAccountToken) return;
  const account = await securityPool()!.query(`SELECT "businessId" FROM "AppleBillingAccount" WHERE "appAccountToken"=$1`, [tx.appAccountToken]);
  // Deleted or unrelated accounts never gain access through a webhook.
  if (!account.rows[0]) return;
  validateAppleTransaction(tx, tx.appAccountToken, environment);
  await syncAppleSubscription(account.rows[0].businessId, tx.originalTransactionId!, environment);
}
