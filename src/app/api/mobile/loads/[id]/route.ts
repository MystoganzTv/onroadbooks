import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";

import { fieldErrorsFrom } from "@/lib/actions/types";
import { getMobileSession, requireMobileWrite } from "@/lib/auth/mobile";
import { getRepository } from "@/lib/db";
import { loadSchema } from "@/lib/schemas";
import type { Load } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * One load, in the exact shape `loadSchema` accepts back.
 *
 * The list endpoint returns derived figures (contribution, score, allocated
 * cost); an edit needs the raw record, because `updateLoad` is a full replace
 * and anything not sent would be blanked.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getMobileSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const dataset = await getRepository(session.businessId).getDataset();
  const load = dataset.loads.find((row) => row.id === id);
  if (!load) return NextResponse.json({ error: "Load not found." }, { status: 404 });

  return NextResponse.json(
    {
      load: {
        id: load.id,
        truckId: load.truckId,
        driverId: load.driverId,
        date: load.date,
        deliveryDate: load.deliveryDate,
        broker: load.broker,
        loadNumber: load.loadNumber,
        originCity: load.originCity,
        originState: load.originState,
        destinationCity: load.destinationCity,
        destinationState: load.destinationState,
        grossRate: load.grossRate,
        loadedMiles: load.loadedMiles,
        deadheadMiles: load.deadheadMiles,
        fuelCost: load.fuelCost,
        tolls: load.tolls,
        dispatchFee: load.dispatchFee,
        factoringFee: load.factoringFee,
        otherExpenses: load.otherExpenses,
        status: load.status,
        notes: load.notes,
        invoiceNumber: load.invoiceNumber,
      },
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}

/** The stored load as `loadSchema` wants it back -- every field, so a merge
 *  cannot silently drop one. */
function loadFormShape(load: Load) {
  return {
    truckId: load.truckId,
    driverId: load.driverId,
    date: load.date,
    deliveryDate: load.deliveryDate,
    endingOdometer: load.endingOdometer,
    originCity: load.originCity,
    originState: load.originState,
    destinationCity: load.destinationCity,
    destinationState: load.destinationState,
    broker: load.broker,
    loadNumber: load.loadNumber,
    equipmentType: load.equipmentType,
    loadCapacity: load.loadCapacity,
    equipmentLengthFt: load.equipmentLengthFt,
    weightLbs: load.weightLbs,
    commodity: load.commodity,
    loadedMiles: load.loadedMiles,
    deadheadMiles: load.deadheadMiles,
    grossRate: load.grossRate,
    fuelCost: load.fuelCost,
    tolls: load.tolls,
    dispatchFee: load.dispatchFee,
    factoringFee: load.factoringFee,
    otherExpenses: load.otherExpenses,
    costsPosted: load.costsPosted,
    status: load.status,
    jurisdictionMiles: load.jurisdictionMiles,
    notes: load.notes,
  };
}

const TOUCHED = ["/dashboard", "/loads", "/reports", "/truck", "/invoices", "/ifta"];

/**
 * Fix a load from the phone.
 *
 * A mistyped rate is not a small thing here: it moves the load's own score,
 * the true cost per mile, and through that the Safe to Pay figure on the
 * dashboard. Until this route existed the only cure was a laptop.
 *
 * `repository.updateLoad` is a FULL REPLACE, not a patch. So the body is
 * merged onto the load as it stands and the MERGED object is validated by the
 * same `loadSchema` the browser posts through -- exactly how
 * `PATCH /api/mobile/truck` handles the same hazard. Sending a partial body
 * straight through would blank whatever the phone does not show: the IFTA
 * jurisdiction miles, the equipment, the commodity, the ending odometer. A
 * phone screen is a smaller window onto the record, not a smaller record.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireMobileWrite(request, "manage_loads");
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  const repository = getRepository(gate.session.businessId);
  const current = (await repository.getDataset()).loads.find((row) => row.id === id);
  if (!current) return NextResponse.json({ error: "Load not found." }, { status: 404 });

  const parsed = loadSchema.safeParse({ ...loadFormShape(current), ...(body as object) });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Check the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error.issues) },
      { status: 422 },
    );
  }

  try {
    await repository.updateLoad(id, parsed.data);
    for (const path of TOUCHED) revalidatePath(path);
    revalidatePath(`/loads/${id}`);
    return NextResponse.json({ id });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not update the load." },
      { status: 400 },
    );
  }
}

/**
 * Delete a load. Money spent stays spent: `deleteLoad` unlinks its expenses
 * and fuel entries rather than taking them down with it, and removes exactly
 * the derived trip-cost rows the load itself posted.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireMobileWrite(request, "manage_loads");
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const { id } = await params;

  try {
    await getRepository(gate.session.businessId).deleteLoad(id);
    for (const path of TOUCHED) revalidatePath(path);
    return NextResponse.json({ id });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not delete the load." },
      { status: 400 },
    );
  }
}
