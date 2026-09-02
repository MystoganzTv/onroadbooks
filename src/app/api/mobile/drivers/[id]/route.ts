import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";

import { fieldErrorsFrom } from "@/lib/actions/types";
import { requireMobileWrite } from "@/lib/auth/mobile";
import { driverSchema } from "@/lib/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Edit a driver, or retire one. `updateDriver` is a full replace. */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireMobileWrite(request, "manage_drivers", "fleet");
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  const input = (body ?? {}) as Record<string, unknown>;

  // A retire/restore is its own small write, not a full driver replace --
  // same split the web has between `updateDriverAction` and
  // `setDriverActiveAction`.
  if (Object.keys(input).length === 1 && typeof input.active === "boolean") {
    try {
      await gate.repository.setDriverActive(id, input.active);
      for (const path of ["/drivers", "/fleet"]) revalidatePath(path);
      return NextResponse.json({ id });
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Could not update the driver." },
        { status: 400 },
      );
    }
  }

  const parsed = driverSchema.safeParse(input);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Check the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error.issues) },
      { status: 422 },
    );
  }

  try {
    await gate.repository.updateDriver(id, parsed.data);
    for (const path of ["/drivers", "/fleet", "/loads"]) revalidatePath(path);
    return NextResponse.json({ id });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not update the driver." },
      { status: 400 },
    );
  }
}
