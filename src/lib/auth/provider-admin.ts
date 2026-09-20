import "server-only";
import { cookies } from "next/headers";
import { getAuthStore } from "@/lib/db";
import { usingAuthJs } from "./provider";
import { createInvitation, invitationHash } from "./identity-store";
import { SESSION_COOKIE } from "./constants";
import { applicationUrl } from "../stripe";

export async function inviteAuthUser(email: string, redirectTo: string) {
  if (!usingAuthJs()) throw new Error("Invitations require Auth.js authentication.");
  if (process.env.DATA_SOURCE !== "neon")
    throw new Error("Invitations require the Neon backend.");
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key || key === "[SENSITIVE]")
    throw new Error("Invitation email delivery is not configured.");
  const member = await getAuthStore().findUserByEmail(email);
  if (!member) throw new Error("This workspace invitation no longer exists.");
  const destination = new URL(redirectTo);
  if (
    destination.origin !== new URL(applicationUrl()).origin ||
    destination.pathname !== "/invite/accept"
  )
    throw new Error("Invalid invitation destination.");
  const { token } = await createInvitation(member.id);
  // Fragment tokens do not travel in HTTP request targets, referrers or access logs.
  destination.search = "";
  destination.hash = new URLSearchParams({ token }).toString();
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `invite-${member.id}-${invitationHash(token)}`,
    },
    body: JSON.stringify({
      from:
        process.env.AUTH_EMAIL_FROM?.trim() ||
        "OnRoad Books <no-reply@onroadbooks.com>",
      to: [member.email],
      subject: "Join your OnRoad Books workspace",
      text: `You have been invited to an OnRoad Books workspace.\n\nChoose a password and accept your invitation:\n${destination.toString()}\n\nThis link expires in 24 hours and can only be used once. Your workspace role is set by its owner. If you did not expect this invitation, you can ignore this email.`,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok)
    throw new Error(
      "The invitation email could not be sent. Please try again.",
    );
}

export async function clearWebSessions() {
  (await cookies()).set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  if (usingAuthJs()) {
    const { signOut } = await import("@/auth");
    await signOut({ redirect: false });
  }
}
