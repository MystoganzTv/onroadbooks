import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fieldErrorsFrom } from "@/lib/actions/types";
import { getMobileSession, requireMobileWrite } from "@/lib/auth/mobile";
import { getRepository } from "@/lib/db";
import { canReadManagement, deleteManagement, managementCapability, managementCollection, managementPermission, managementWriteSchema, resourceSchema, saveManagement } from "@/lib/mobile/management";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ resource: string }> };
const headers = { "Cache-Control": "no-store, max-age=0" };

export async function GET(request: NextRequest, context: Context) {
  const session = await getMobileSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  const parsed = resourceSchema.safeParse((await context.params).resource);
  if (!parsed.success) return NextResponse.json({ error: "Unknown section." }, { status: 404, headers });
  if (!canReadManagement(parsed.data, session.role ?? "VIEWER")) return NextResponse.json({ error: "Tu rol no permite acceder a esta sección." }, { status: 403, headers });
  const quarter = request.nextUrl.searchParams.get("quarter") ?? undefined;
  if (quarter && !/^\d{4}-Q[1-4]$/.test(quarter)) return NextResponse.json({ error: "Trimestre inválido." }, { status: 422, headers });
  const dataset = await getRepository(session.businessId).getDataset();
  return NextResponse.json(managementCollection(parsed.data, dataset, session.role ?? "VIEWER", quarter), { headers });
}

async function mutate(request: NextRequest, context: Context, remove: boolean) {
  const parsed = resourceSchema.safeParse((await context.params).resource);
  if (!parsed.success) return NextResponse.json({ error: "Unknown section." }, { status: 404, headers });
  const resource = parsed.data;
  const gate = await requireMobileWrite(request, managementPermission(resource), managementCapability(resource));
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status, headers });
  if (Number(request.headers.get("content-length") ?? 0) > 128 * 1024) return NextResponse.json({ error: "Request too large." }, { status: 413, headers });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Expected JSON." }, { status: 400, headers }); }
  try {
    let id: string;
    if (remove) {
      id = z.object({ id: z.string().min(1).max(300) }).parse(body).id;
      await deleteManagement(gate.repository, resource, id);
    } else {
      id = await saveManagement(gate.repository, resource, managementWriteSchema.parse(body));
    }
    revalidatePath("/", "layout");
    return NextResponse.json({ id }, { headers });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: error.issues[0]?.message ?? "Revisa los campos.", fieldErrors: fieldErrorsFrom(error.issues) }, { status: 422, headers });
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo guardar." }, { status: 400, headers });
  }
}
export async function POST(request: NextRequest, context: Context) { return mutate(request, context, false); }
export async function DELETE(request: NextRequest, context: Context) { return mutate(request, context, true); }
