import "server-only";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { and, eq, gt, isNull, ne } from "drizzle-orm";
import { z } from "zod";
import { getNeonDatabase, type NeonDatabase } from "@/db";
import { authIdentity, authInvitation, user } from "@/db/schema";
import { DrizzleAuthStore } from "@/lib/db/drizzle-store";
import { hashPassword } from "./session";
import { isPendingMemberInvitation } from "../team";
import { setupSchema } from "../schemas";

type AuthDatabase = Pick<NeonDatabase, "transaction">;

const googleProfile = z.object({
  sub: z.string().min(1).max(255),
  email: z.string().email().max(200),
  email_verified: z.literal(true),
  name: z.string().max(200).optional(),
});
export const invitationCredentials = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  password: setupSchema.shape.password,
});
export function invitationHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function resolveGoogleIdentity(
  profile: unknown,
  db: AuthDatabase = getNeonDatabase(),
) {
  const verified = googleProfile.parse(profile);
  return db.transaction(async (tx) => {
    const store = new DrizzleAuthStore(async () => tx);
    const [identity] = await tx
      .select()
      .from(authIdentity)
      .where(
        and(
          eq(authIdentity.provider, "google"),
          eq(authIdentity.subject, verified.sub),
        ),
      );
    if (identity) {
      const existing = await store.findUserById(identity.userId);
      if (!existing) throw new Error("This identity no longer has an account.");
      return { ...existing, isNew: false };
    }
    let appUser = await store.findUserByEmail(verified.email);
    const isNew = !appUser;
    if (appUser && !isPendingMemberInvitation(appUser)) {
      // Existing owners are linked by the audited subject import, never email
      // alone. Password accounts require a separately verified linking flow.
      throw new Error(
        "Sign in with your existing account. Google is not linked to it.",
      );
    }
    if (appUser) {
      appUser = await store.markMemberJoined(appUser.id, appUser.businessId);
      await tx
        .delete(authInvitation)
        .where(eq(authInvitation.userId, appUser.id));
    } else {
      appUser = await store.createOwner({
        email: verified.email,
        name: verified.name,
        passwordHash: "oauth$google",
      });
    }
    await tx
      .insert(authIdentity)
      .values({
        id: randomUUID(),
        userId: appUser.id,
        provider: "google",
        subject: verified.sub,
      });
    return { ...appUser, isNew };
  });
}

export async function createInvitation(
  userId: string,
  db: AuthDatabase = getNeonDatabase(),
) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await db.transaction(async (tx) => {
    const member = await new DrizzleAuthStore(async () => tx).findUserById(
      userId,
    );
    if (!isPendingMemberInvitation(member))
      throw new Error("This workspace invitation no longer exists.");
    await tx
      .insert(authInvitation)
      .values({ tokenHash: invitationHash(token), userId, expiresAt })
      .onConflictDoUpdate({
        target: authInvitation.userId,
        set: {
          tokenHash: invitationHash(token),
          expiresAt,
          createdAt: new Date(),
        },
      });
  });
  return { token, expiresAt };
}

export async function acceptInvitation(
  input: unknown,
  db: AuthDatabase = getNeonDatabase(),
) {
  const parsed = invitationCredentials.parse(input);
  const passwordHash = await hashPassword(parsed.password);
  return db.transaction(async (tx) => {
    const [invitation] = await tx
      .delete(authInvitation)
      .where(
        and(
          eq(authInvitation.tokenHash, invitationHash(parsed.token)),
          gt(authInvitation.expiresAt, new Date()),
        ),
      )
      .returning();
    if (!invitation)
      throw new Error("This invitation is invalid, expired or already used.");
    const [member] = await tx
      .update(user)
      .set({ joinedAt: new Date(), passwordHash })
      .where(
        and(
          eq(user.id, invitation.userId),
          isNull(user.joinedAt),
          ne(user.role, "OWNER"),
        ),
      )
      .returning({ id: user.id });
    if (!member) throw new Error("This workspace invitation no longer exists.");
    const result = await new DrizzleAuthStore(async () => tx).findUserById(
      member.id,
    );
    if (!result) throw new Error("This workspace invitation no longer exists.");
    return result;
  });
}
