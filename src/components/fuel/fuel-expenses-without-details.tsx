"use client";

import { useLanguage } from "@/components/shell/language-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableWrapper } from "@/components/ui/table";
import { formatMoney } from "@/lib/formatters";
import { formatLocaleDate } from "@/lib/i18n-format";
import type { Expense, Truck } from "@/lib/types";
import { FuelFormDialog } from "./fuel-form-dialog";

export function FuelExpensesWithoutDetails({ expenses, trucks }: {
  expenses: Expense[];
  trucks: Truck[];
}) {
  const { dictionary, locale } = useLanguage();
  const copy = dictionary.fuel;
  if (expenses.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>{copy.expensesWithoutDetails}</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">{copy.expensesWithoutDetailsHint}</p>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <TableWrapper>
          <Table>
            <TableHeader><TableRow>
              <TableHead>{copy.date}</TableHead>
              <TableHead>{dictionary.expenses.description}</TableHead>
              <TableHead className="text-right">{copy.total}</TableHead>
              <TableHead className="text-right">{copy.action}</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {expenses.map((expense) => <TableRow key={expense.id}>
                <TableCell>{formatLocaleDate(expense.date, locale, "short")}</TableCell>
                <TableCell>
                  {expense.description}
                  {expense.vendor ? <span className="block text-xs text-muted-foreground">{expense.vendor}</span> : null}
                </TableCell>
                <TableCell className="text-right tnum text-neg">-{formatMoney(expense.amount)}</TableCell>
                <TableCell className="text-right">
                  <FuelFormDialog sourceExpense={expense} trucks={trucks}
                    trigger={<Button size="sm" variant="outline">{copy.completeDetails}</Button>} />
                </TableCell>
              </TableRow>)}
            </TableBody>
          </Table>
        </TableWrapper>
      </CardContent>
    </Card>
  );
}
