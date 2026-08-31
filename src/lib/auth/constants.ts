/**
 * Runtime-agnostic auth constants.
 *
 * Kept apart from session.ts so the route proxy remains a small, runtime-
 * independent cookie-presence gate and never pulls in session verification.
 */
export const SESSION_COOKIE = "onroad_books_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days
