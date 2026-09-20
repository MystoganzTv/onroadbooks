import type { User } from "./types";

type InvitationState = Pick<User, "role" | "invitedAt" | "joinedAt">;

/**
 * The application member row is the invitation authority. A verified
 * invitation token never chooses a workspace or role.
 */
export function isPendingMemberInvitation(
  member: InvitationState | null | undefined,
): member is InvitationState {
  return Boolean(
    member
      && member.role !== "OWNER"
      && member.invitedAt
      && !member.joinedAt,
  );
}
