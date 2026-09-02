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

import { localizedClientError } from "@/lib/i18n/errors";
import { useLanguage } from "@/components/shell/language-provider";

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
import { formatMoney } from "@/lib/formatters";
import { formatLocaleDate } from "@/lib/i18n-format";
import { interpolate } from "@/lib/i18n/dictionaries";
import type { Expense, ExpenseBehavior, LoadWithMetrics, Truck } from "@/lib/types";
import type { ExpenseMirrorSource } from "@/lib/mirrored-expenses";
import { cn } from "@/lib/utils";
import { ExpenseFormDialog } from "./expense-form-dialog";
import { LoadExpenseFormDialog } from "./load-expense-form-dialog";

type SortKey = "date" | "category" | "description" | "vendor" | "amount";

interface ExpensesTableProps {
  expenses: Expense[];
  /**
   * Which rows the app wrote, by relation. The id prefix only identifies a
   * mirror in the JSON store -- on Postgres the database generates the id, so
   * without this the table offered Edit and Delete on read-only rows.
   */
  mirrorSources?: Record<string, ExpenseMirrorSource>;
  documents: Document[];
  loads: LoadWithMetrics[];
  categoryBehavior: Record<string, ExpenseBehavior>;
  defaultDate: string;
  trucks?: Truck[];
  defaultTruckId?: string | null;
}

export function ExpensesTable({
  expenses,
  mirrorSources = {},
  documents,
  loads,
  categoryBehavior,
  defaultDate,
  trucks = [],
  defaultTruckId,
}: ExpensesTableProps) {
  const router = useRouter();
  const { locale, dictionary } = useLanguage();
  const copy = dictionary.expenses;
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
      return [expense.description, expense.vendor ?? "", categoryLabel(expense.category, locale), expense.notes ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });

    return rows.sort((a, b) => {
      let cmp = 0;
      if (sort.key === "amount") cmp = a.amount - b.amount;
      else if (sort.key === "category")
        cmp = categoryLabel(a.category, locale).localeCompare(categoryLabel(b.category, locale));
      else if (sort.key === "description") cmp = a.description.localeCompare(b.description);
      else if (sort.key === "vendor") cmp = (a.vendor ?? "").localeCompare(b.vendor ?? "");
      else cmp = a.date.localeCompare(b.date);
      return sort.dir === "asc" ? cmp : -cmp;
    });
  }, [expenses, search, category, behavior, sort, categoryBehavior, locale]);

  const total = filtered.reduce((sum, expense) => sum + expense.amount, 0);
  // With one truck every cost is that truck's, so saying so on every row is
  // noise. With a fleet it is the first thing you need to know.
  const showCharge = trucks.length > 1;
  const truckName = (id: string | null) => trucks.find((t) => t.id === id)?.name ?? copy.unknownTruck;
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
      toast.success(copy.expenseDeleted, { description: expense.description });
      router.refresh();
    } else {
      toast.error(localizedClientError(result.error));
    }
  }

  const columns: { key: SortKey; label: string; numeric?: boolean }[] = [
    { key: "date", label: copy.date },
    { key: "category", label: copy.category },
    { key: "description", label: copy.description },
    { key: "vendor", label: copy.vendor },
    { key: "amount", label: copy.amount, numeric: true },
  ];

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex flex-wrap items-center gap-2 border-b border-border p-2.5">
        <div className="relative min-w-[11.25rem] flex-1">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={copy.searchPlaceholder}
            className="pl-7"
            aria-label={copy.searchLabel}
          />
        </div>

        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-[11.5rem]" aria-label={copy.filterCategory}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{copy.allCategories}</SelectItem>
            {EXPENSE_CATEGORIES.map((item) => (
              <SelectItem key={item.id} value={item.id}>
                {categoryLabel(item.id, locale)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={behavior} onValueChange={setBehavior}>
          <SelectTrigger className="w-[10.5rem]" aria-label={copy.filterBehavior}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{copy.allCosts}</SelectItem>
            <SelectItem value="FIXED">{copy.fixedOnly}</SelectItem>
            <SelectItem value="VARIABLE">{copy.variableOnly}</SelectItem>
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
            {copy.clear}
          </Button>
        ) : null}

        <span className="ml-auto whitespace-nowrap text-2xs text-muted-foreground tnum">
          {interpolate(copy.shownOfTotal, { shown: filtered.length, total: expenses.length })}
        </span>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title={hasFilters ? copy.noFilterMatches : copy.noExpenses}
          description={
            hasFilters
              ? copy.clearFiltersDescription
              : copy.addExpenseDescription
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
                {copy.clearFilters}
              </Button>
            ) : (
              <ExpenseFormDialog
                loads={loads}
                defaultDate={defaultDate}
                categoryBehavior={categoryBehavior}
                trucks={trucks}
                defaultTruckId={defaultTruckId}
              />
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
                <TableHead className="w-[5.25rem] text-right">{dictionary.common.actions}</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {filtered.map((expense) => {
                const isFixed = behaviorOf(expense.category, categoryBehavior) === "FIXED";
                // Rows the app writes for you must be changed at their source.
                // Load costs have a focused editor here that updates that
                // source; the other mirrors point to their owning workflow.
                const mirrorSource = mirrorSources[expense.id];
                const mirroredFuel = mirrorSource === "FUEL" || expense.id.startsWith("expfuel_");
                const mirroredService = mirrorSource === "SERVICE" || expense.id.startsWith("expmaint_");
                const mirroredLoad = mirrorSource === "LOAD" || expense.id.startsWith("expload_");
                const mirroredDriver = expense.id.startsWith("expdriver_");
                const mirrored = mirroredFuel || mirroredService || mirroredLoad || mirroredDriver;
                return (
                  <TableRow key={expense.id}>
                    <TableCell className="text-muted-foreground">
                      {formatLocaleDate(expense.date, locale, { month: "short", day: "numeric" })}
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          className="size-2 shrink-0 rounded-[2px]"
                          style={{ background: categoryColor(expense.category) }}
                          aria-hidden
                        />
                        {categoryLabel(expense.category, locale)}
                        <Badge variant={isFixed ? "info" : "outline"} className="ml-0.5">
                          {isFixed ? copy.fixed : copy.variable}
                        </Badge>
                      </span>
                    </TableCell>
                    <TableCell className="max-w-[20rem] truncate">
                      {expense.description}
                      {expense.recurring ? (
                        <Repeat
                          className="ml-1.5 inline size-3 text-muted-foreground"
                          aria-label={copy.recurring}
                        />
                      ) : null}
                      {documents.some((d) => d.expenseId === expense.id) ? (
                        <Paperclip
                          className="ml-1.5 inline size-3 text-muted-foreground"
                          aria-label={copy.receiptAttached}
                        />
                      ) : null}
                      {expense.receiptNumber ? (
                        <span className="ml-1.5 text-2xs text-muted-foreground tnum">
                          #{expense.receiptNumber}
                        </span>
                      ) : null}
                      {mirrored ? (
                        <Badge variant="outline" className="ml-1.5">
                          {mirroredFuel
                            ? copy.fromFuel
                            : mirroredDriver
                              ? copy.fromDriverPay
                            : mirroredLoad
                              ? copy.fromLoad
                              : copy.fromService}
                        </Badge>
                      ) : null}
                      {showCharge ? (
                        <span className="ml-1.5 text-2xs text-muted-foreground">
                          {expense.scope === "BUSINESS"
                            ? copy.overhead
                            : truckName(expense.truckId)}
                        </span>
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
                        {mirroredLoad ? (
                          <LoadExpenseFormDialog
                            expense={expense}
                            trigger={
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                aria-label={copy.editLoadExpense}
                                title={copy.editLoadExpenseHere}
                              >
                                <Pencil />
                              </Button>
                            }
                          />
                        ) : mirrored ? null : (
                          <ExpenseFormDialog
                            expense={expense}
                            documents={documents.filter((d) => d.expenseId === expense.id)}
                            loads={loads}
                            categoryBehavior={categoryBehavior}
                            trucks={trucks}
                            trigger={
                              <Button variant="ghost" size="icon-sm" aria-label={copy.editExpense}>
                                <Pencil />
                              </Button>
                            }
                          />
                        )}
                        {mirrored && !mirroredLoad ? (
                          <Button asChild variant="ghost" size="icon-sm">
                            <Link
                              href={
                                mirroredFuel
                                  ? "/fuel"
                                  : mirroredDriver
                                    ? "/driver-settlements"
                                    : "/truck"
                              }
                              aria-label={
                                mirroredFuel
                                  ? copy.editFuelPage
                                  : mirroredDriver
                                    ? copy.openDriverStatement
                                    : copy.editMaintenance
                              }
                              title={
                                mirroredFuel
                                  ? copy.writtenByFuel
                                  : mirroredDriver
                                    ? copy.writtenByDriver
                                    : copy.writtenByService
                              }
                            >
                              <ExternalLink />
                            </Link>
                          </Button>
                        ) : null}
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
                              aria-label={copy.deleteExpense}
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
                  {copy.total}
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
