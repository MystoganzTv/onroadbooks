import "server-only";

import { createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

import { dataDirectory } from "@/lib/data-directory";
import { SESSION_MAX_AGE_SECONDS as MAX_AGE } from "./constants";
import type { MemberRole } from "@/lib/types";

const scrypt = promisify(scryptCb) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
) => Promise<Buffer>;

/**
 * Session and password primitives.
 *
 * Deliberately dependency-free: sessions are a signed, self-describing cookie
 * rather than a server-side store, so the same code runs on the JSON store and
 * on Postgres with nothing extra to provision.
 */

export { SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } from "./constants";

export interface SessionPayload {
  userId: string;
  businessId: string;
  email: string;
  /** Replaced with the authoritative database value on every request. */
  role?: MemberRole;
  /** Unix seconds. */
  exp: number;
}

/* ---- Signing key ------------------------------------------------------ */

const secretFile = () => path.join(dataDirectory(), ".auth-secret");
let cachedSecret: string | null = null;

/**
 * AUTH_SECRET from the environment in any real deployment. Locally, a random
 * secret is generated once into data/.auth-secret so the app works with zero
 * setup without ever shipping a hardcoded default.
 */
export async function getAuthSecret(): Promise<string> {
  if (cachedSecret) return cachedSecret;

  const fromEnv = process.env.AUTH_SECRET;
  if (fromEnv && fromEnv.length >= 32) {
    cachedSecret = fromEnv;
    return cachedSecret;
  }

  try {
    const existing = (await fs.readFile(secretFile(), "utf8")).trim();
    if (existing.length >= 32) {
      cachedSecret = existing;
      return cachedSecret;
    }
  } catch {
    // Not created yet.
  }

  const generated = randomBytes(48).toString("base64url");
  await fs.mkdir(path.dirname(secretFile()), { recursive: true });
  await fs.writeFile(secretFile(), generated, { mode: 0o600 });
  cachedSecret = generated;
  return cachedSecret;
}

/* ---- Passwords -------------------------------------------------------- */

/** scrypt with a per-password salt. Format: scrypt$<salt>$<hash>. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scrypt(password.normalize("NFKC"), salt, 64);
  return `scrypt$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltPart, hashPart] = stored.split("$");
  if (scheme !== "scrypt" || !saltPart || !hashPart) return false;

  const salt = Buffer.from(saltPart, "base64url");
  const expected = Buffer.from(hashPart, "base64url");
  const derived = await scrypt(password.normalize("NFKC"), salt, expected.length);

  // Constant time: a length mismatch must not short-circuit either.
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}

/* ---- Cookie value ----------------------------------------------------- */

function sign(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("base64url");
}

export async function encodeSession(payload: SessionPayload): Promise<string> {
  const secret = await getAuthSecret();
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${body}.${sign(body, secret)}`;
}

/** Returns null for anything tampered with, malformed or expired. */
export async function decodeSession(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null;
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;

  const secret = await getAuthSecret();
  const expected = sign(body, secret);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SessionPayload;
    if (!payload?.userId || !payload?.businessId) return null;
    if (typeof payload.exp !== "number" || payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export function sessionExpiry(): number {
  return Math.floor(Date.now() / 1000) + MAX_AGE;
}

export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: MAX_AGE,
  // Set automatically when served over TLS; left off so localhost works.
  secure: process.env.NODE_ENV === "production",
};
