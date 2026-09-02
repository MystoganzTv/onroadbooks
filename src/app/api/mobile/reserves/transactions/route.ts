import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";

import { fieldErrorsFrom } from "@/lib/actions/types";
import { requireMobileWrite } from "@/lib/auth/mobile";
import { reserveTransactionSchema } from "@/lib/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Move money into or out of a reserve bucket from the phone.
 *
 * Same schema and same `createReserveTransaction` as
 * `createReserveTransactionAction`, behind the same two gates the web uses:
 * the `cockpit` capability AND `manage_owner_finances`, which is owner-only.
 * A balance is always the signed sum of its movements, so this is the only
 * way a bucket ever changes.
 */
export async function POST(request: NextRequest) {
  const gate = await requireMobileWrite(request, "manage_owner_finances", "cockpit");
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  const parsed = reserveTransactionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Check the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error.issues) },
      { status: 422 },
    );
  }

  try {
    const txn = await gate.repository.createReserveTransaction(parsed.data);
    for (const path of ["/reserves", "/dashboard", "/settlements"]) revalidatePath(path);
    return NextResponse.json({ id: txn.id }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not record that movement." },
      { status: 400 },
    );
  }
}
