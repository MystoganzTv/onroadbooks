import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";

import { fieldErrorsFrom } from "@/lib/actions/types";
import { getMobileSession, requireMobileWrite } from "@/lib/auth/mobile";
import { roundMoney } from "@/lib/calculations";
import { getRepository } from "@/lib/db";
import { isReviewedLoanPayment } from "@/lib/finance/mobile-expense-ledger";
import { financialTreatmentOf } from "@/lib/finance/terminology";
import { debtPaymentClassificationSchema } from "@/lib/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TOUCHED = ["/dashboard", "/expenses", "/reports", "/truck"];

function revalidateLedger() {
  for (const path of TOUCHED) revalidatePath(path);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getMobileSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const dataset = await getRepository(session.businessId).getDataset();
  const selected = dataset.expenses.find((expense) => expense.id === id);
  if (!selected) return NextResponse.json({ error: "Payment not found." }, { status: 404 });
  if (!isReviewedLoanPayment(selected)) {
    return NextResponse.json({ error: "This is not a reviewed financing payment." }, { status: 409 });
  }

  const rows = dataset.expenses.filter(
    (expense) => expense.splitGroupId === selected.splitGroupId && isReviewedLoanPayment(expense),
  );
  const principal = rows.find((expense) => financialTreatmentOf(expense) === "PRINCIPAL");
  const interest = rows.find((expense) => financialTreatmentOf(expense) === "INTEREST");
  const base = principal ?? interest ?? selected;
  const obligation = base.obligationId
    ? dataset.financialObligations.find((item) => item.id === base.obligationId)
    : null;
  const principalAmount = roundMoney(
    rows
      .filter((expense) => financialTreatmentOf(expense) === "PRINCIPAL")
      .reduce((total, expense) => total + expense.amount, 0),
  );
  const interestAmount = roundMoney(
    rows
      .filter((expense) => financialTreatmentOf(expense) === "INTEREST")
      .reduce((total, expense) => total + expense.amount, 0),
  );

  return NextResponse.json(
    {
      payment: {
        id: base.id,
        date: base.date,
        description: base.description.replace(/ · interest$/u, ""),
        vendor: base.vendor,
        recurring: base.recurring,
        notes: base.notes,
        paymentAmount: roundMoney(principalAmount + interestAmount),
        principalAmount,
        interestAmount,
        obligation: obligation
          ? {
              id: obligation.id,
              name: obligation.name,
              counterparty: obligation.counterparty,
            }
          : null,
      },
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireMobileWrite(request, "manage_expenses");
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const { id } = await params;
  const dataset = await gate.repository.getDataset();
  const current = dataset.expenses.find((expense) => expense.id === id);
  if (!current) return NextResponse.json({ error: "Payment not found." }, { status: 404 });
  if (!isReviewedLoanPayment(current)) {
    return NextResponse.json({ error: "This is not a reviewed financing payment." }, { status: 409 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  const parsed = debtPaymentClassificationSchema.safeParse({
    ...(body as object),
    treatment: "LOAN_SPLIT",
    obligationId: current.obligationId ?? null,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Check the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error.issues) },
      { status: 422 },
    );
  }

  try {
    const rows = await gate.repository.classifyDebtPayment(id, parsed.data);
    revalidateLedger();
    return NextResponse.json({ id: rows[0]?.id ?? id });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not update the payment." },
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
  const dataset = await gate.repository.getDataset();
  const current = dataset.expenses.find((expense) => expense.id === id);
  if (!current) return NextResponse.json({ error: "Payment not found." }, { status: 404 });
  if (!isReviewedLoanPayment(current)) {
    return NextResponse.json({ error: "This is not a reviewed financing payment." }, { status: 409 });
  }

  try {
    // Both persistence implementations delete every row with this splitGroupId
    // in one transaction. There is no endpoint here for deleting one half.
    await gate.repository.deleteExpense(id);
    revalidateLedger();
    return NextResponse.json({ id });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not delete the payment." },
      { status: 400 },
    );
  }
}
