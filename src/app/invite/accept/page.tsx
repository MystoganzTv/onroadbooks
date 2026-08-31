import type { Metadata } from "next";

import { InviteAcceptance } from "@/components/auth/invite-acceptance";

export const metadata: Metadata = { title: "Accept invitation" };

export default function AcceptInvitationPage() {
  return <InviteAcceptance />;
}
