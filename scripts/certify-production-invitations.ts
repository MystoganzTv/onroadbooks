import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";

import { PrismaClient } from "../src/generated/prisma";

const appUrl = (process.env.CERTIFICATION_APP_URL || "https://onroadbooks.com").replace(/\/$/, "");
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SECRET_KEY;
const publishableKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;

const prisma = new PrismaClient();
let businessId: string | null = null;
let authUserId: string | null = null;

function required(value: string | undefined, name: string): string {
  assert.ok(value, `${name} is required`);
  return value;
}

async function main() {
  const url = required(supabaseUrl, "SUPABASE_URL");
  const adminKey = required(serviceKey, "SUPABASE_SECRET_KEY");
  const publicKey = required(publishableKey, "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  const admin = createClient(url, adminKey, { auth: { persistSession: false } });
  const client = createClient(url, publicKey, { auth: { persistSession: false } });
  const email = `cert.invite.${randomUUID()}@example.com`;

  const business = await prisma.business.create({
    data: { name: "Invitation Certification", currency: "USD" },
    select: { id: true },
  });
  businessId = business.id;
  const member = await prisma.user.create({
    data: {
      businessId,
      email,
      name: "Invitation Certification",
      passwordHash: "invite$supabase",
      role: "VIEWER",
      invitedAt: new Date(),
      joinedAt: null,
    },
    select: { id: true },
  });

  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: "invite",
    email,
    options: { redirectTo: `${appUrl}/invite/accept` },
  });
  assert.ifError(linkError);
  assert.ok(link.properties.hashed_token, "Supabase generated an invite token");
  authUserId = link.user.id;

  const { data: verification, error: verificationError } = await client.auth.verifyOtp({
    type: "invite",
    token_hash: link.properties.hashed_token,
  });
  assert.ifError(verificationError);
  assert.equal(verification.user?.email, email);
  assert.ok(verification.session?.access_token);
  assert.ok(verification.session?.refresh_token);

  const response = await fetch(`${appUrl}/api/auth/invite/accept`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: appUrl },
    body: JSON.stringify({
      accessToken: verification.session.access_token,
      refreshToken: verification.session.refresh_token,
    }),
  });
  assert.equal(response.status, 200, await response.text());
  assert.ok(
    response.headers.get("set-cookie")?.includes("onroad_books_session="),
    "the application session cookie was issued alongside Supabase cookies",
  );

  const joined = await prisma.user.findUniqueOrThrow({ where: { id: member.id } });
  assert.ok(joined.joinedAt, "the pending application member was activated");
  assert.equal(joined.businessId, businessId);
  assert.equal(joined.role, "VIEWER", "Supabase metadata did not change the invited role");

  const replay = await fetch(`${appUrl}/api/auth/invite/accept`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: appUrl },
    body: JSON.stringify({
      accessToken: verification.session.access_token,
      refreshToken: verification.session.refresh_token,
    }),
  });
  assert.equal(replay.status, 403, "an accepted application invitation cannot be replayed");

  console.log("Production invitation certification: passed", {
    generatedBySupabase: true,
    verifiedBySupabase: true,
    acceptedByApplication: true,
    rolePreserved: "VIEWER",
    replayRejected: true,
  });
}

main()
  .catch((error) => {
    console.error("Production invitation certification failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (supabaseUrl && serviceKey && authUserId) {
      const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
      await admin.auth.admin.deleteUser(authUserId).catch(() => undefined);
    }
    if (businessId) {
      await prisma.user.deleteMany({ where: { businessId } });
      await prisma.business.deleteMany({ where: { id: businessId } });
    }
    await prisma.$disconnect();
  });
