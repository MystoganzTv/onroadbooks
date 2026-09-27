import { NextResponse } from "next/server";
import { getMobileSession } from "@/lib/auth/mobile";
import { getRepository } from "@/lib/db";
import { planOf, PLAN_IDS, PLANS, trialState, canWrite } from "@/lib/plans";
import { todayISO } from "@/lib/periods";
import { ROLE_DEFINITIONS } from "@/lib/roles";

export async function GET(request: Request) {
  const session = await getMobileSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { business, subscription, trucks } = await getRepository(session.businessId).getDataset();
  const plan = planOf(subscription);
  const trial = trialState(subscription, todayISO());
  return NextResponse.json({
    trucks: trucks.map(truck => ({ id: truck.id, name: truck.name })),
    businessName: business.name, email: session.email, role: ROLE_DEFINITIONS[session.role ?? "VIEWER"].label,
    planName: plan.name, status: subscription.status, currentPeriodEnd: subscription.currentPeriodEnd,
    canWrite: canWrite(subscription), trialEndsOn: trial?.endsOn ?? null,
    plans: PLAN_IDS.map(id => ({ id, name: PLANS[id].name, priceMonthly: PLANS[id].priceMonthly, features: PLANS[id].features })),
  }, { headers: { "Cache-Control": "private, no-store" } });
}

/** Ownership controls remain available even when the subscription has expired. */
export async function POST(request: Request) {
  const session = await getMobileSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { roleCan } = await import("@/lib/roles");
  if (!roleCan(session.role ?? "VIEWER", "manage_account")) return NextResponse.json({ error: "Solo el propietario puede restablecer o eliminar la cuenta." }, { status: 403 });
  const { z } = await import("zod");
  const parsed = z.object({ intent: z.enum(["reset", "delete"]), confirmation: z.string().max(254) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Confirma la operación." }, { status: 422 });
  const { intent, confirmation } = parsed.data;
  if (confirmation.trim() !== (intent === "reset" ? "RESET" : session.email)) return NextResponse.json({ error: intent === "reset" ? "Escribe RESET para confirmar." : "Escribe tu email exactamente para confirmar." }, { status: 422 });
  const { getAuthStore } = await import("@/lib/db");
  const { getDocumentStorage } = await import("@/lib/storage");
  const { revalidatePath } = await import("next/cache");
  try {
    const storageKeys = intent === "reset"
      ? await getAuthStore().resetBusinessData(session.userId, session.businessId)
      : (await getAuthStore().deleteAccount(session.userId, session.businessId)).storageKeys;
    await Promise.allSettled(storageKeys.map(key => getDocumentStorage().remove(key)));
    revalidatePath("/", "layout");
    return NextResponse.json({ id: intent === "reset" ? "reset" : "deleted" }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo completar la operación." }, { status: 400 });
  }
}
