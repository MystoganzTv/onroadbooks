import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";

import { fieldErrorsFrom } from "@/lib/actions/types";
import { getMobileSession, requireMobileWrite } from "@/lib/auth/mobile";
import { getRepository } from "@/lib/db";
import { hasFleetAccess, capabilityRefusal } from "@/lib/plans";
import { driverSchema } from "@/lib/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The drivers on the account.
 *
 * A driver is an OPERATIONAL record and nothing else: adding one never
 * creates a sign-in, on any client. App access is a separate thing entirely
 * (`/api/mobile/team`), which is what keeps the Fleet promise honest.
 */
export async function GET(request: NextRequest) {
  const session = await getMobileSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dataset = await getRepository(session.businessId).getDataset();
  if (!hasFleetAccess(dataset.subscription)) {
    return NextResponse.json({ error: capabilityRefusal("fleet") }, { status: 403 });
  }

  const drivers = dataset.drivers.map((driver) => ({
    id: driver.id,
    name: driver.name,
    active: driver.active,
    payType: driver.payType,
    payRate: driver.payRate,
    reference: driver.reference,
    defaultTruckId: driver.defaultTruckId,
  }));

  return NextResponse.json(
    { drivers },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}

export async function POST(request: NextRequest) {
  const gate = await requireMobileWrite(request, "manage_drivers", "fleet");
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  const parsed = driverSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Check the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error.issues) },
      { status: 422 },
    );
  }

  try {
    const driver = await gate.repository.createDriver(parsed.data);
    for (const path of ["/drivers", "/fleet", "/loads"]) revalidatePath(path);
    return NextResponse.json({ id: driver.id }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not save the driver." },
      { status: 400 },
    );
  }
}
