import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";

import { fieldErrorsFrom } from "@/lib/actions/types";
import { getMobileSession, requireMobileWrite } from "@/lib/auth/mobile";
import { getRepository } from "@/lib/db";
import { expenseMirrorSource, mirrorRefusal } from "@/lib/mirrored-expenses";
import { expenseSchema } from "@/lib/schemas";
import type { ExpenseCategoryId } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** One expense, in the shape `expenseSchema` accepts back for a full replace. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getMobileSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const dataset = await getRepository(session.businessId).getDataset();
  const expense = dataset.expenses.find((row) => row.id === id);
  if (!expense) return NextResponse.json({ error: "Expense not found." }, { status: 404 });

  // A row the app wrote for you is read-only here, and the phone is told so
  // before the owner types anything rather than after they press save.
  const mirrorSource = expenseMirrorSource(dataset, id);

  return NextResponse.json(
    {
      expense: {
        id: expense.id,
        truckId: expense.truckId,
        scope: expense.scope,
        date: expense.date,
        category: expense.category,
        description: expense.description,
        vendor: expense.vendor,
        amount: expense.amount,
        loadId: expense.loadId,
        recurring: expense.recurring,
        receiptNumber: expense.receiptNumber,
        notes: expense.notes,
      },
      readOnly: mirrorSource != null,
      readOnlyReason: mirrorSource ? mirrorRefusal(mirrorSource) : null,
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}

const TOUCHED = ["/dashboard", "/expenses", "/reports", "/truck"];

/**
 * Fix an expense from the phone -- same `expenseSchema` and the same
 * `updateExpense` call `updateExpenseAction` makes.
 *
 * The store refuses a row the app wrote for you (a fuel or service mirror,
 * or a load's posted trip cost): those are changed at their source, and the
 * refusal comes back here in the owner's own words rather than as a code.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireMobileWrite(request, "manage_expenses");
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  const repository = getRepository(gate.session.businessId);
  const current = (await repository.getDataset()).expenses.find((row) => row.id === id);
  if (!current) return NextResponse.json({ error: "Expense not found." }, { status: 404 });

  // Merged, then validated -- the phone does not show scope, the load link or
  // the receipt number, and a partial replace would erase them.
  const parsed = expenseSchema.safeParse({
    truckId: current.truckId,
    scope: current.scope,
    date: current.date,
    category: current.category,
    description: current.description,
    vendor: current.vendor,
    amount: current.amount,
    loadId: current.loadId,
    recurring: current.recurring,
    receiptNumber: current.receiptNumber,
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
    await repository.updateExpense(id, {
      ...parsed.data,
      category: parsed.data.category as ExpenseCategoryId,
    });
    for (const path of TOUCHED) revalidatePath(path);
    return NextResponse.json({ id });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not update the expense." },
      { status: 400 },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireMobileWrite(request, "manage_expenses");
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const { id } = await params;

  try {
    await getRepository(gate.session.businessId).deleteExpense(id);
    for (const path of TOUCHED) revalidatePath(path);
    return NextResponse.json({ id });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not delete the expense." },
      { status: 400 },
    );
  }
}
