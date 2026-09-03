import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";

import { fieldErrorsFrom } from "@/lib/actions/types";
import { getMobileSession, requireMobileWrite } from "@/lib/auth/mobile";
import { expenseSchema } from "@/lib/schemas";
import type { ExpenseCategoryId } from "@/lib/types";
import { getRepository } from "@/lib/db";
import { expensesInPeriod } from "@/lib/calculations";
import { EXPENSE_CATEGORIES, getCategory } from "@/lib/categories";
import { periodFromSearchParams } from "@/lib/period-params";
import { mobileExpenseRows } from "@/lib/finance/mobile-expense-ledger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Same period params as the web app: ?month=2026-08&period=full */
export async function GET(request: NextRequest) {
  const session = await getMobileSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const period = periodFromSearchParams(Object.fromEntries(request.nextUrl.searchParams));
  const dataset = await getRepository(session.businessId).getDataset();

  const results = mobileExpenseRows(
    expensesInPeriod(dataset.expenses, period),
    dataset.financialObligations,
    (category) => getCategory(category).label,
  );

  return NextResponse.json(
    {
      periodLabel: period.label,
      expenses: results,
      // The picker in the app is built from this, so a category added here is
      // available on the phone without shipping a new build.
      categories: EXPENSE_CATEGORIES.map(({ id, label }) => ({ id, label })),
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}

/**
 * Record an expense from the phone -- the receipt in your hand at the pump,
 * before it turns into a shoebox.
 *
 * Same `expenseSchema` and same `createExpense` the web form uses; the phone
 * gets no shortcut around either.
 */
export async function POST(request: NextRequest) {
  const gate = await requireMobileWrite(request, "manage_expenses");
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  const parsed = expenseSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Check the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error.issues) },
      { status: 422 },
    );
  }

  try {
    const expense = await gate.repository.createExpense({
      ...parsed.data,
      category: parsed.data.category as ExpenseCategoryId,
    });
    for (const path of ["/dashboard", "/expenses", "/reports", "/truck", "/fuel"]) revalidatePath(path);
    return NextResponse.json({ id: expense.id }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not save the expense." },
      { status: 400 },
    );
  }
}
