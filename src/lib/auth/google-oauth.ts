export const GOOGLE_OAUTH_NEXT_COOKIE = "onroad_google_oauth_next";

const GOOGLE_OAUTH_MAX_AGE_SECONDS = 10 * 60;

export function googleOAuthCookie(maxAge = GOOGLE_OAUTH_MAX_AGE_SECONDS) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}
