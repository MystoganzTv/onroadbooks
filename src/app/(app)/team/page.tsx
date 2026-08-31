import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/shared/page-header";
import { TeamManager } from "@/components/team/team-manager";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requireSession } from "@/lib/auth";
import { getAuthStore, getRepository } from "@/lib/db";
import { hasFleetAccess } from "@/lib/plans";
import { roleCan } from "@/lib/roles";

export const metadata: Metadata = { title: "Team" };

export default async function TeamPage() {
  const session = await requireSession();
  const { subscription } = await getRepository(session.businessId).getDataset();
  const hasFleet = hasFleetAccess(subscription);

  if (!hasFleet) {
    return (
      <div className="space-y-5 p-4 lg:p-6">
        <PageHeader title="Team" description="Give each person their own sign-in and the minimum access they need." />
        <Card className="mx-auto max-w-2xl">
          <CardContent className="space-y-3 p-6 text-sm text-muted-foreground">
            <p>Multiple members and role-based access are included with an active OnRoad Fleet workspace.</p>
            {(session.role ?? "VIEWER") === "OWNER" ? (
              <Button asChild><Link href="/plans">View Fleet plan</Link></Button>
            ) : (
              <p className="font-medium text-foreground">Ask the workspace owner to restore Fleet access.</p>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  const members = await getAuthStore().listMembers(session.businessId);
  return (
    <div className="space-y-5 p-4 lg:p-6">
      <PageHeader
        title="Team"
        description="Every person gets an individual sign-in. Roles are enforced on the server for every change."
      />
      <TeamManager
        members={members.map(({ id, email, name, role, joinedAt, invitedAt }) => ({
          id,
          email,
          name,
          role,
          joinedAt,
          invitedAt,
        }))}
        canManage={roleCan(session.role ?? "VIEWER", "manage_team")}
      />
    </div>
  );
}
