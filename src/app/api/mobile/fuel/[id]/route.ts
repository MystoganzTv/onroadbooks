import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";

import { fieldErrorsFrom } from "@/lib/actions/types";
import { getMobileSession, requireMobileWrite } from "@/lib/auth/mobile";
import { getRepository } from "@/lib/db";
import { fuelSchema } from "@/lib/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** One fill-up, in the shape `fuelSchema` accepts back. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getMobileSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const dataset = await getRepository(session.businessId).getDataset();
  const entry = dataset.fuelEntries.find((row) => row.id === id);
  if (!entry) return NextResponse.json({ error: "Fuel entry not found." }, { status: 404 });

  return NextResponse.json(
    {
      entry: {
        id: entry.id,
        truckId: entry.truckId,
        date: entry.date,
        gallons: entry.gallons,
        pricePerGallon: entry.pricePerGallon,
        totalCost: entry.totalCost,
        odometer: entry.odometer,
        location: entry.location,
        jurisdiction: entry.jurisdiction,
        loadId: entry.loadId,
        notes: entry.notes,
      },
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}

const TOUCHED = ["/dashboard", "/fuel", "/expenses", "/reports", "/truck", "/ifta"];

/**
 * Fix a fill-up from the phone -- the place a wrong number is most likely to
 * be entered in the first place, standing at the pump.
 *
 * The entry owns its mirrored FUEL row in the ledger, so editing it here is
 * what keeps the two in step; editing the mirrored row directly is refused by
 * the store on purpose.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireMobileWrite(request, "manage_fuel");
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  const repository = getRepository(gate.session.businessId);
  const current = (await repository.getDataset()).fuelEntries.find((row) => row.id === id);
  if (!current) return NextResponse.json({ error: "Fuel entry not found." }, { status: 404 });

  const parsed = fuelSchema.safeParse({
    truckId: current.truckId,
    date: current.date,
    gallons: current.gallons,
    pricePerGallon: current.pricePerGallon,
    totalCost: current.totalCost,
    odometer: current.odometer,
    location: current.location,
    jurisdiction: current.jurisdiction,
    loadId: current.loadId,
    notes: current.notes,
    ...(body as object),
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Check the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error.issues) },
      { status: 422 },
    );
  }

  try {
    await repository.updateFuelEntry(id, parsed.data);
    for (const path of TOUCHED) revalidatePath(path);
    return NextResponse.json({ id });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not update the fuel entry." },
      { status: 400 },
    );
  }
}

/** Deleting the entry takes its mirrored ledger row with it, as the web does. */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireMobileWrite(request, "manage_fuel");
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const { id } = await params;

  try {
    await getRepository(gate.session.businessId).deleteFuelEntry(id);
    for (const path of TOUCHED) revalidatePath(path);
    return NextResponse.json({ id });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not delete the fuel entry." },
      { status: 400 },
    );
  }
}
