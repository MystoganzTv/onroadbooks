import "server-only";
import { Pool, type PoolClient } from "pg";
import { promises as fs } from "node:fs";
import path from "node:path";
import { getNeonPool } from "@/db";
import { dataDirectory } from "@/lib/data-directory";
import { resetJsonPassword } from "@/lib/db/json-store";

type Reset = { userId: string; authVersion: number; expiresAt: number };
type State = { resets: Record<string, Reset>; limits: Record<string, { attempts: number; resetAt: number }> };
let legacyPool: Pool | undefined;
export function securityPool() {
  if (process.env.DATA_SOURCE === "neon") return getNeonPool();
  if (process.env.DATA_SOURCE === "postgres") {
    if (!process.env.DATABASE_URL) throw new Error("Database unavailable");
    return legacyPool ??= new Pool({ connectionString: process.env.DATABASE_URL, max: 3, allowExitOnIdle: true });
  }
  if (process.env.VERCEL_ENV === "production") throw new Error("Persistent security storage required");
  return null;
}
let pending: Promise<unknown> = Promise.resolve();
async function local<T>(work: (state: State) => Promise<T> | T): Promise<T> {
  const result = pending.then(async () => {
    const file = path.join(dataDirectory(), "auth-security.json");
    let state: State;
    try { state = JSON.parse(await fs.readFile(file, "utf8")); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; state = { resets: {}, limits: {} }; }
    const now = Date.now();
    for (const [key, value] of Object.entries(state.resets)) if (value.expiresAt <= now) delete state.resets[key];
    for (const [key, value] of Object.entries(state.limits)) if (value.resetAt <= now) delete state.limits[key];
    const value = await work(state);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(`${file}.tmp`, JSON.stringify(state), { mode: 0o600 });
    await fs.rename(`${file}.tmp`, file);
    return value;
  });
  pending = result.catch(() => {});
  return result;
}
export async function transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
  const pool = securityPool();
  if (!pool) throw new Error("SQL storage required");
  const client = await pool.connect();
  try { await client.query("BEGIN"); const value = await work(client); await client.query("COMMIT"); return value; }
  catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}
export async function consumeLimit(key: string, maximum: number, windowMs: number) {
  if (!securityPool()) return local(state => {
    const row = state.limits[key] ??= { attempts: 0, resetAt: Date.now() + windowMs };
    row.attempts++;
    return { allowed: row.attempts <= maximum, retryAfter: Math.max(1, Math.ceil((row.resetAt - Date.now()) / 1000)) };
  });
  const result = await securityPool()!.query(`INSERT INTO onroad_auth."RateLimit" (key, attempts, "resetAt") VALUES ($1, 1, NOW() + $2 * interval '1 millisecond') ON CONFLICT (key) DO UPDATE SET attempts = CASE WHEN "RateLimit"."resetAt" <= NOW() THEN 1 ELSE "RateLimit".attempts + 1 END, "resetAt" = CASE WHEN "RateLimit"."resetAt" <= NOW() THEN EXCLUDED."resetAt" ELSE "RateLimit"."resetAt" END RETURNING attempts, GREATEST(1, CEIL(EXTRACT(EPOCH FROM ("resetAt" - NOW())))) AS retry`, [key, windowMs]);
  // Bounded opportunistic cleanup keeps random addresses from accumulating forever.
  await securityPool()!.query(`DELETE FROM onroad_auth."RateLimit" WHERE "resetAt" < NOW() AND key IN (SELECT key FROM onroad_auth."RateLimit" WHERE "resetAt" < NOW() LIMIT 100)`);
  return { allowed: result.rows[0].attempts <= maximum, retryAfter: Number(result.rows[0].retry) };
}
export async function saveReset(hash: string, reset: Reset) {
  if (!securityPool()) return local(state => {
    for (const [key, value] of Object.entries(state.resets)) if (value.userId === reset.userId) delete state.resets[key];
    state.resets[hash] = reset;
  });
  await securityPool()!.query(`INSERT INTO onroad_auth."PasswordReset" ("tokenHash", "userId", "authVersion", "expiresAt") VALUES ($1,$2,$3,$4) ON CONFLICT ("userId") DO UPDATE SET "tokenHash"=EXCLUDED."tokenHash", "authVersion"=EXCLUDED."authVersion", "expiresAt"=EXCLUDED."expiresAt"`, [hash, reset.userId, reset.authVersion, new Date(reset.expiresAt)]);
}
export async function consumeReset(hash: string, passwordHash: string): Promise<boolean> {
  if (!securityPool()) return local(async state => {
    const reset = state.resets[hash];
    if (!reset) return false;
    const changed = await resetJsonPassword(reset.userId, reset.authVersion, passwordHash);
    delete state.resets[hash];
    return changed;
  });
  return transaction(async client => {
    const result = await client.query(`DELETE FROM onroad_auth."PasswordReset" WHERE "tokenHash"=$1 AND "expiresAt">NOW() RETURNING "userId", "authVersion"`, [hash]);
    const reset = result.rows[0];
    if (!reset) return false;
    const updated = await client.query(`UPDATE public."User" SET "passwordHash"=$1, "authVersion"="authVersion"+1 WHERE id=$2 AND "authVersion"=$3`, [passwordHash, reset.userId, reset.authVersion]);
    return updated.rowCount === 1;
  });
}
const locks = new Set<string>();
export async function withSecurityLock<T>(key: string, work: (client?: PoolClient) => Promise<T>): Promise<T> {
  if (!securityPool()) {
    if (locks.has(key)) throw new Error("Synchronization already in progress; retry");
    locks.add(key); try { return await work(); } finally { locks.delete(key); }
  }
  return transaction(async client => {
    const result = await client.query("SELECT pg_try_advisory_xact_lock(hashtextextended($1, 0)) AS locked", [key]);
    if (!result.rows[0].locked) throw new Error("Synchronization already in progress; retry");
    return work(client);
  });
}
