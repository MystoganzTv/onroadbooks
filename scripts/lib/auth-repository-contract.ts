import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { DatabaseExecutor } from "../../src/lib/db/drizzle-queries";
import { DrizzleAuthStore } from "../../src/lib/db/drizzle-store";
import { authIdentity, authInvitation } from "../../src/db/schema";
import {
  createInvitation,
  acceptInvitation,
  resolveGoogleIdentity,
  invitationHash,
} from "../../src/lib/auth/identity-store";
import { verifyPassword } from "../../src/lib/auth/session";

export async function authRepositoryContract(db: DatabaseExecutor) {
  const prefix = randomUUID();
  const store = new DrizzleAuthStore(async () => db);
  const profile = {
    sub: `google-${prefix}`,
    email: `google-${prefix}@example.test`,
    email_verified: true,
    name: "Google Owner",
  };
  await assert.rejects(
    resolveGoogleIdentity({ ...profile, email_verified: false }, db),
  );
  const google = await resolveGoogleIdentity(profile, db);
  assert.equal(google.isNew, true);
  assert.equal(google.passwordHash, "oauth$google");
  assert.equal((await resolveGoogleIdentity(profile, db)).id, google.id);
  // The subject, not a mutable email address, owns the existing linkage.
  assert.equal(
    (
      await resolveGoogleIdentity(
        { ...profile, email: `changed-${prefix}@example.test` },
        db,
      )
    ).id,
    google.id,
  );
  await assert.rejects(
    resolveGoogleIdentity({ ...profile, sub: `imposter-${prefix}` }, db),
    /not linked/,
  );
  const owner = await store.createOwner({
    email: `password-${prefix}@example.test`,
    passwordHash: "scrypt$existing-hash-preserved",
  });
  await assert.rejects(
    resolveGoogleIdentity(
      { ...profile, email: owner.email, sub: `password-${prefix}` },
      db,
    ),
    /not linked/,
  );
  await db
    .insert(authIdentity)
    .values({
      id: randomUUID(),
      userId: owner.id,
      provider: "google",
      subject: `migrated-${prefix}`,
    });
  assert.equal(
    (
      await resolveGoogleIdentity(
        { ...profile, email: owner.email, sub: `migrated-${prefix}` },
        db,
      )
    ).id,
    owner.id,
  );
  assert.equal(
    (await store.findUserById(owner.id))?.passwordHash,
    owner.passwordHash,
  );

  const member = await store.createMember({
    businessId: owner.businessId,
    email: `invite-${prefix}@example.test`,
    role: "BOOKKEEPER",
  });
  const first = await createInvitation(member.id, db);
  const [stored] = await db
    .select()
    .from(authInvitation)
    .where(eq(authInvitation.userId, member.id));
  assert.equal(stored.tokenHash, invitationHash(first.token));
  assert.notEqual(stored.tokenHash, first.token);
  assert.ok(stored.expiresAt.getTime() > Date.now());
  const second = await createInvitation(member.id, db);
  await assert.rejects(
    acceptInvitation(
      { token: first.token, password: "test-invite-password" },
      db,
    ),
  );
  await assert.rejects(
    acceptInvitation({ token: second.token, password: "short" }, db),
  );
  assert.equal(
    (
      await db
        .select()
        .from(authInvitation)
        .where(eq(authInvitation.userId, member.id))
    ).length,
    1,
  );
  const joined = await acceptInvitation(
    { token: second.token, password: "test-invite-password" },
    db,
  );
  assert.equal(joined.id, member.id);
  assert.equal(joined.businessId, owner.businessId);
  assert.equal(joined.role, "BOOKKEEPER");
  assert.ok(joined.joinedAt);
  assert.ok(await verifyPassword("test-invite-password", joined.passwordHash));
  await assert.rejects(
    acceptInvitation(
      { token: second.token, password: "test-invite-password" },
      db,
    ),
  );
  await assert.rejects(createInvitation(owner.id, db));
  await assert.rejects(createInvitation(member.id, db));

  const expired = await store.createMember({
    businessId: owner.businessId,
    email: `expired-${prefix}@example.test`,
    role: "VIEWER",
  });
  const expiredToken = await createInvitation(expired.id, db);
  await db
    .update(authInvitation)
    .set({ expiresAt: new Date(Date.now() - 1000) })
    .where(eq(authInvitation.userId, expired.id));
  await assert.rejects(
    acceptInvitation(
      { token: expiredToken.token, password: "test-invite-password" },
      db,
    ),
  );
  assert.equal((await store.findUserById(expired.id))?.joinedAt, null);
  await store.removeMember(expired.id, owner.businessId);
  assert.equal(
    (
      await db
        .select()
        .from(authInvitation)
        .where(eq(authInvitation.userId, expired.id))
    ).length,
    0,
  );

  const googleMember = await store.createMember({
    businessId: owner.businessId,
    email: `google-member-${prefix}@example.test`,
    role: "VIEWER",
  });
  const unused = await createInvitation(googleMember.id, db);
  const linked = await resolveGoogleIdentity(
    { ...profile, sub: `member-${prefix}`, email: googleMember.email },
    db,
  );
  assert.equal(linked.id, googleMember.id);
  assert.equal(linked.role, "VIEWER");
  assert.equal(linked.isNew, false);
  await assert.rejects(
    acceptInvitation(
      { token: unused.token, password: "test-invite-password" },
      db,
    ),
  );
  await store.deleteAccount(owner.id, owner.businessId);
  assert.equal(await store.findUserById(member.id), null);
  assert.equal(
    (
      await db
        .select()
        .from(authIdentity)
        .where(eq(authIdentity.userId, owner.id))
    ).length,
    0,
  );
  assert.equal(
    (
      await db
        .select()
        .from(authIdentity)
        .where(eq(authIdentity.userId, googleMember.id))
    ).length,
    0,
  );
  await store.deleteAccount(google.id, google.businessId);
}
