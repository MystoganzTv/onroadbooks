import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";

import { requireMobileTeamManage } from "@/lib/auth/mobile";
import { getAuthStore } from "@/lib/db";
import { memberRoleSchema } from "@/lib/schemas";
import { deleteSupabaseAuthUserByEmail } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Change a member's role -- same `memberRoleSchema` and `updateMemberRole`
 * as `updateMemberRoleAction`, and the same owner-with-Fleet gate as every
 * other write under `/api/mobile/team`.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  const gate = await requireMobileTeamManage(request);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const { userId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  const parsed = memberRoleSchema.safeParse({ ...(body as Record<string, unknown>), userId });
  if (!parsed.success) {
    return NextResponse.json({ error: "Choose a valid role." }, { status: 422 });
  }

  try {
    const member = await getAuthStore().updateMemberRole(
      parsed.data.userId,
      gate.session.businessId,
      parsed.data.role,
    );
    revalidatePath("/settings");
    return NextResponse.json({ id: member.id });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not update that role." },
      { status: 400 },
    );
  }
}

/**
 * Remove a member -- same order as `removeMemberAction`: drop the app row
 * first (that alone revokes access, since every request revalidates
 * membership), then best-effort clean up the Supabase identity so the email
 * can be invited again and any existing session is revoked too.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  const gate = await requireMobileTeamManage(request);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const { userId } = await params;
  const store = getAuthStore();
  const member = (await store.listMembers(gate.session.businessId)).find((row) => row.id === userId);
  if (!member) return NextResponse.json({ error: "That team member was not found." }, { status: 404 });

  try {
    const removed = await store.removeMember(userId, gate.session.businessId);
    try {
      await deleteSupabaseAuthUserByEmail(removed.email);
    } catch (error) {
      console.error("[mobile-team-remove] Supabase identity cleanup failed", error);
    }
    revalidatePath("/settings");
    return NextResponse.json({ id: userId });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not remove that member." },
      { status: 400 },
    );
  }
}
