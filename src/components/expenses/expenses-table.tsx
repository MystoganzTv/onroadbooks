"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowUpDown,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Paperclip,
  Pencil,
  Receipt,
  Repeat,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { ConfirmDelete } from "@/components/shared/confirm-delete";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
  TableWrapper,
} from "@/components/ui/table";
import { deleteExpenseAction } from "@/lib/actions/expenses";
import type { Document } from "@/lib/types";
import { behaviorOf, categoryColor, categoryLabel, EXPENSE_CATEGORIES } from "@/lib/categories";
import { formatDateShort, formatMoney } from "@/lib/formatters";
import type { Expense, ExpenseBehavior, LoadWithMetrics } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ExpenseFormDialog } from "./expense-form-dialog";

type SortKey = "date" | "category" | "description" | "vendor" | "amount";

interface ExpensesTableProps {
  expenses: Expense[];
  documents: Document[];
  loads: LoadWithMetrics[];
  categoryBehavior: Record<string, ExpenseBehavior>;
  defaultDate: string;
}

export function ExpensesTable({
  expenses,
  documents,
  loads,
  categoryBehavior,
  defaultDate,
}: ExpensesTableProps) {
  const router = useRouter();
  const [search, setSearch] = React.useState("");
  const [category, setCategory] = React.useState("all");
  const [behavior, setBehavior] = React.useState("all");
  const [sort, setSort] = React.useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "date",
    dir: "desc",
  });
  const [deleting, setDeleting] = React.useState<string | null>(null);

  const filtered = React.useMemo(() => {
    const query = search.trim().toLowerCase();

    const rows = expenses.filter((expense) => {
      if (category !== "all" && expense.category !== category) return false;
      if (behavior !== "all" && behaviorOf(expense.category, categoryBehavior) !== behavior)
        return false;
      if (!query) return true;
      return [expense.description, expense.vendor ?? "", categoryLabel(expense.category), expense.notes ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });

    return rows.sort((a, b) => {
      let cmp = 0;
      if (sort.key === "amount") cmp = a.amount - b.amount;
      else if (sort.key === "category")
        cmp = categoryLabel(a.category).localeCompare(categoryLabel(b.category));
      else if (sort.key === "description") cmp = a.description.localeCompare(b.description);
      else if (sort.key === "vendor") cmp = (a.vendor ?? "").localeCompare(b.vendor ?? "");
      else cmp = a.date.localeCompare(b.date);
      return sort.dir === "asc" ? cmp : -cmp;
    });
  }, [expenses, search, category, behavior, sort, categoryBehavior]);

  const total = filtered.reduce((sum, expense) => sum + expense.amount, 0);
  const hasFilters = search !== "" || category !== "all" || behavior !== "all";

  function toggleSort(key: SortKey) {
    setSort((prev) =>
      prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" },
    );
  }

  async function remove(expense: Expense) {
    setDeleting(expense.id);
    const result = await deleteExpenseAction(expense.id);
    setDeleting(null);
    if (result.ok) {
      toast.success("Expense deleted", { description: expense.description });
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }

  const columns: { key: SortKey; label: string; numeric?: boolean }[] = [
    { key: "date", label: "Date" },
    { key: "category", label: "Category" },
    { key: "description", label: "Description" },
    { key: "vendor", label: "Vendor" },
    { key: "amount", label: "Amount", numeric: true },
  ];

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex flex-wrap items-center gap-2 border-b border-border p-2.5">
        <div className="relative min-w-[11.25rem] flex-1">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search description, vendor..."
            className="pl-7"
            aria-label="Search expenses"
          />
        </div>

        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-[11.5rem]" aria-label="Filter by category">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {EXPENSE_CATEGORIES.map((item) => (
              <SelectItem key={item.id} value={item.id}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={behavior} onValueChange={setBehavior}>
          <SelectTrigger className="w-[10.5rem]" aria-label="Filter fixed or variable">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All costs</SelectItem>
            <SelectItem value="FIXED">Fixed only</SelectItem>
            <SelectItem value="VARIABLE">Variable only</SelectItem>
          </SelectContent>
        </Select>

        {hasFilters ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearch("");
              setCategory("all");
              setBehavior("all");
            }}
          >
            <X />
            Clear
          </Button>
        ) : null}

        <span className="ml-auto whitespace-nowrap text-2xs text-muted-foreground tnum">
          {filtered.length} of {expenses.length}
        </span>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title={hasFilters ? "No expenses match these filters" : "No expenses in this period"}
          description={
            hasFilters
              ? "Clear the filters to see everything recorded in this period."
              : "Add an expense to start tracking cost per mile."
          }
          action={
            hasFilters ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearch("");
                  setCategory("all");
                  setBehavior("all");
                }}
              >
                Clear filters
              </Button>
            ) : (
              <ExpenseFormDialog loads={loads} defaultDate={defaultDate} categoryBehavior={categoryBehavior} />
            )
          }
        />
      ) : (
        <TableWrapper>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                {columns.map((column) => {
                  const active = sort.key === column.key;
                  const Icon = !active ? ArrowUpDown : sort.dir === "asc" ? ChevronUp : ChevronDown;
                  return (
                    <TableHead
                      key={column.key}
                      className={cn(column.numeric && "text-right")}
                      aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
                    >
                      <button
                        type="button"
                        onClick={() => toggleSort(column.key)}
                        className={cn(
                          "inline-flex items-center gap-1 rounded-sm hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          active && "text-foreground",
                          column.numeric && "flex-row-reverse",
                        )}
                      >
                        {column.label}
                        <Icon className="size-3 opacity-60" />
                      </button>
                    </TableHead>
                  );
                })}
                <TableHead className="w-[5.25rem] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {filtered.map((expense) => {
                const isFixed = behaviorOf(expense.category, categoryBehavior) === "FIXED";
                // Rows the app writes for you. Editing them here would be
                // overwritten by the record that owns them, so they are
                // read-only and point at where they are actually maintained.
                const mirroredFuel = expense.id.startsWith("expfuel_");
                const mirroredService = expense.id.startsWith("expmaint_");
                const mirrored = mirroredFuel || mirroredService;
                return (
                  <TableRow key={expense.id}>
                    <TableCell className="text-muted-foreground">
                      {formatDateShort(expense.date)}
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          className="size-2 shrink-0 rounded-[2px]"
                          style={{ background: categoryColor(expense.category) }}
                          aria-hidden
                        />
                        {categoryLabel(expense.category)}
                        <Badge variant={isFixed ? "info" : "outline"} className="ml-0.5">
                          {isFixed ? "Fixed" : "Var"}
                        </Badge>
                      </span>
                    </TableCell>
                    <TableCell className="max-w-[20rem] truncate">
                      {expense.description}
                      {expense.recurring ? (
                        <Repeat
                          className="ml-1.5 inline size-3 text-muted-foreground"
                          aria-label="Recurring"
                        />
                      ) : null}
                      {documents.some((d) => d.expenseId === expense.id) ? (
                        <Paperclip
                          className="ml-1.5 inline size-3 text-muted-foreground"
                          aria-label="Receipt attached"
                        />
                      ) : null}
                      {expense.receiptNumber ? (
                        <span className="ml-1.5 text-2xs text-muted-foreground tnum">
                          #{expense.receiptNumber}
                        </span>
                      ) : null}
                      {mirrored ? (
                        <Badge variant="outline" className="ml-1.5">
                          {mirroredFuel ? "From Fuel" : "From Service"}
                        </Badge>
                      ) : null}
                    </TableCell>
                    <TableCell className="max-w-[13rem] truncate text-muted-foreground">
                      {expense.vendor ?? "--"}
                    </TableCell>
                    <TableCell className="text-right tnum font-medium text-neg">
                      -{formatMoney(expense.amount)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-0.5">
                        {mirrored ? (
                          <Button asChild variant="ghost" size="icon-sm">
                            <Link
                              href={mirroredFuel ? "/fuel" : "/truck"}
                              aria-label={
                                mirroredFuel
                                  ? "Edit on the Fuel page"
                                  : "Edit on the Truck maintenance tab"
                              }
                              title={
                                mirroredFuel
                                  ? "Written by a fuel entry - edit it on the Fuel page"
                                  : "Written by a service record - edit it on the Truck page"
                              }
                            >
                              <ExternalLink />
                            </Link>
                          </Button>
                        ) : (
                        <ExpenseFormDialog
                          expense={expense}
                          documents={documents.filter((d) => d.expenseId === expense.id)}
                          loads={loads}
                          categoryBehavior={categoryBehavior}
                          trigger={
                            <Button variant="ghost" size="icon-sm" aria-label="Edit expense">
                              <Pencil />
                            </Button>
                          }
                        />
                        )}
                        {mirrored ? null : (
                        <ConfirmDelete
                          entity="expense"
                          label={`${expense.description} - ${formatMoney(expense.amount)}`}
                          consequences={
                            documents.some((d) => d.expenseId === expense.id)
                              ? ["Any receipt attached to this expense"]
                              : []
                          }
                          onConfirm={() => remove(expense)}
                          trigger={
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label="Delete expense"
                              disabled={deleting === expense.id}
                              className="text-muted-foreground hover:text-neg"
                            >
                              <Trash2 />
                            </Button>
                          }
                        />
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>

            <TableFooter>
              <TableRow className="hover:bg-transparent">
                <TableCell
                  colSpan={4}
                  className="text-2xs uppercase tracking-wider text-muted-foreground"
                >
                  Total
                </TableCell>
                <TableCell className="text-right tnum font-semibold text-neg">
                  -{formatMoney(total)}
                </TableCell>
                <TableCell />
              </TableRow>
            </TableFooter>
          </Table>
        </TableWrapper>
      )}
    </div>
  );
}
