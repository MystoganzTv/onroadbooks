import { NextResponse } from "next/server";
import { z } from "zod";
import { getMobileSession } from "@/lib/auth/mobile";
import { roleCan } from "@/lib/roles";
import { consumeLimit } from "@/lib/auth/security-store";
import { appleBillingConfigured, syncAppleReceipt } from "@/lib/apple-billing";

export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request) {
  const session = await getMobileSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!roleCan(session.role ?? "VIEWER", "manage_billing")) return NextResponse.json({ error: "Solo el propietario puede gestionar las compras." }, { status: 403 });
  if (!appleBillingConfigured()) return NextResponse.json({ error: "Compras temporalmente no disponibles. Inténtalo más tarde." }, { status: 503 });
  const limit = await consumeLimit(`apple-purchases:${session.userId}`, 30, 60_000);
  if (!limit.allowed) return NextResponse.json({ error: "Espera un minuto antes de reintentar." }, { status: 429 });
  if (Number(request.headers.get("content-length") ?? 0) > 32_000) return new Response(null, { status: 413 });
  const parsed = z.object({ signedTransaction: z.string().min(1).max(25_000) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Compra inválida." }, { status: 422 });
  try {
    const result = await syncAppleReceipt(session.businessId, parsed.data.signedTransaction);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "No se pudo vincular la compra. Usa la cuenta de OnRoad Books con la que compraste, comprueba que no tenga otra suscripción activa y pulsa Restaurar compras para reintentar. Si persiste, contacta con soporte." }, { status: 409 });
  }
}
