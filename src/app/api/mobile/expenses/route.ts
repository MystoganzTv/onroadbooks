import { NextResponse, type NextRequest } from "next/server";

import { getMobileSession } from "@/lib/auth/mobile";
import { getRepository } from "@/lib/db";
import { expensesInPeriod } from "@/lib/calculations";
import { getCategory } from "@/lib/categories";
import { periodFromSearchParams } from "@/lib/period-params";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Same period params as the web app: ?month=2026-08&period=full */
export async function GET(request: NextRequest) {
  const session = await getMobileSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const period = periodFromSearchParams(Object.fromEntries(request.nextUrl.searchParams));
  const dataset = await getRepository(session.businessId).getDataset();

  const results = expensesInPeriod(dataset.expenses, period)
    .slice()
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .map((expense) => ({
      id: expense.id,
      date: expense.date,
      category: expense.category,
      categoryLabel: getCategory(expense.category).label,
      description: expense.description,
      vendor: expense.vendor,
      amount: expense.amount,
    }));

  return NextResponse.json(
    { periodLabel: period.label, expenses: results },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
