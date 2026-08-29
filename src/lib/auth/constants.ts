/**
 * Runtime-agnostic auth constants.
 *
 * Kept apart from session.ts because the middleware runs on the edge runtime
 * and must not pull in node:crypto or node:fs.
 */
export const SESSION_COOKIE = "truckledger_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days
