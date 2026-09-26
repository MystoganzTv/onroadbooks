import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { getAuthStore } from "@/lib/db";
import { hashPassword } from "./session";
import { saveReset, consumeReset } from "./security-store";

export const resetTokenHash = (token: string) => createHash("sha256").update(token).digest("hex");
async function deliverReset(email: string, token: string, locale: "en" | "es") {
  const key = process.env.RESEND_API_KEY;
  const origin = process.env.AUTH_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (!key || !origin) throw new Error("Password recovery email is unavailable");
  const url = new URL("/reset-password", origin);
  if (process.env.NODE_ENV === "production" && url.protocol !== "https:") throw new Error("HTTPS required");
  url.hash = `token=${token}`;
  const spanish = locale === "es";
  const subject = spanish ? "Restablece tu contraseña de OnRoad Books" : "Reset your OnRoad Books password";
  const text = spanish ? `Para crear una contraseña nueva, abre este enlace:\n${url}\n\nCaduca en 30 minutos y solo se puede usar una vez. Si no solicitaste este cambio, ignora este correo.` : `To create a new password, open this link:\n${url}\n\nIt expires in 30 minutes and can only be used once. If you did not request this change, ignore this email.`;
  const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "Idempotency-Key": `password-reset-${resetTokenHash(token)}` }, body: JSON.stringify({ from: process.env.AUTH_EMAIL_FROM || "OnRoad Books <no-reply@onroadbooks.com>", to: email, subject, text }), signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error("Password recovery email delivery failed");
}
export async function requestPasswordReset(email: string, locale: "en" | "es", send = deliverReset) {
  const user = await getAuthStore().findUserByEmail(email);
  if (!user || !user.passwordHash.startsWith("scrypt$") || (user.role !== "OWNER" && !user.joinedAt)) return;
  const token = randomBytes(32).toString("base64url");
  await saveReset(resetTokenHash(token), { userId: user.id, authVersion: user.authVersion ?? 0, expiresAt: Date.now() + 30 * 60_000 });
  await send(user.email, token, locale);
}
export async function resetPassword(token: string, password: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token) || password.length < 10 || password.length > 200) return false;
  return consumeReset(resetTokenHash(token), await hashPassword(password));
}
