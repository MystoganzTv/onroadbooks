import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";

import { fieldErrorsFrom } from "@/lib/actions/types";
import { getMobileSession, requireMobileTeamManage } from "@/lib/auth/mobile";
import { getAuthStore, getRepository } from "@/lib/db";
import { hasFleetAccess } from "@/lib/plans";
import { roleCan } from "@/lib/roles";
import { memberInviteSchema } from "@/lib/schemas";
import { applicationUrl } from "@/lib/stripe";
import { inviteSupabaseAuthUser } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Who has an app sign-in, and what they can do with it -- the mobile twin of
 * `/settings#access-roles`. Access & Roles is a Fleet-plan capability on the
 * web (`hasFleetAccess`), so a Solo/Pro business gets the same locked
 * sentence a phone would get from Reserves, not a second, looser rule.
 *
 * Every role can read this section (to see who has access); only the owner
 * (`manage_team`) can change it, exactly like `TeamManager`'s `canManage`.
 */
export async function GET(request: NextRequest) {
  const session = await getMobileSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const repository = getRepository(session.businessId);
  const { subscription } = await repository.getDataset();
  if (!hasFleetAccess(subscription)) {
    return NextResponse.json(
      { error: "Access & Roles is included with an active OnRoad Fleet plan." },
      { status: 403 },
    );
  }

  const role = session.role ?? "VIEWER";
  const members = await getAuthStore().listMembers(session.businessId);

  return NextResponse.json(
    {
      canManage: roleCan(role, "manage_team"),
      members: members.map(({ id, email, name, role: memberRole, joinedAt, invitedAt }) => ({
        id,
        email,
        name,
        role: memberRole,
        joinedAt,
        invitedAt,
      })),
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}

/**
 * Invite a collaborator from the phone -- same `memberInviteSchema`, same
 * `createMember` + `inviteSupabaseAuthUser` pair, same rollback if the email
 * never sends, as `inviteMemberAction` in `lib/actions/team.ts`.
 */
export async function POST(request: NextRequest) {
  const gate = await requireMobileTeamManage(request);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  const parsed = memberInviteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Check the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error.issues) },
      { status: 422 },
    );
  }

  if (parsed.data.email.toLowerCase() === gate.session.email.toLowerCase()) {
    return NextResponse.json({ error: "You are already the workspace owner." }, { status: 422 });
  }

  const store = getAuthStore();
  let member;
  try {
    member = await store.createMember({
      businessId: gate.session.businessId,
      email: parsed.data.email,
      name: parsed.data.name ?? null,
      role: parsed.data.role,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not invite that member." },
      { status: 400 },
    );
  }

  try {
    await inviteSupabaseAuthUser(member.email, `${applicationUrl()}/invite/accept`);
  } catch (error) {
    // A failed email must not leave behind a ghost member that blocks a retry.
    await store.removeMember(member.id, gate.session.businessId);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "The invitation could not be completed." },
      { status: 400 },
    );
  }

  revalidatePath("/settings");
  return NextResponse.json({ id: member.id }, { status: 201 });
}
