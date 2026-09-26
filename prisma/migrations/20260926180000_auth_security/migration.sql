ALTER TABLE "public"."User" ADD COLUMN "authVersion" integer DEFAULT 0 NOT NULL;
CREATE SCHEMA IF NOT EXISTS "onroad_auth";
REVOKE ALL ON SCHEMA "onroad_auth" FROM PUBLIC;
CREATE TABLE "onroad_auth"."PasswordReset" (
  "tokenHash" text PRIMARY KEY,
  "userId" text NOT NULL REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "authVersion" integer NOT NULL,
  "expiresAt" timestamptz NOT NULL
);
CREATE UNIQUE INDEX "PasswordReset_user_key" ON "onroad_auth"."PasswordReset" ("userId");
CREATE INDEX "PasswordReset_expiry_idx" ON "onroad_auth"."PasswordReset" ("expiresAt");
CREATE TABLE "onroad_auth"."RateLimit" (
  "key" text PRIMARY KEY,
  "attempts" integer NOT NULL,
  "resetAt" timestamptz NOT NULL
);
CREATE INDEX "RateLimit_expiry_idx" ON "onroad_auth"."RateLimit" ("resetAt");
REVOKE ALL ON ALL TABLES IN SCHEMA "onroad_auth" FROM PUBLIC;
