"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowUpDown,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Package,
  Search,
  X,
} from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
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
import { div, isDeadheadElevated, type RatingThresholds } from "@/lib/calculations";
import type { DriverScheduleEntry } from "@/lib/driver-availability";
import {
  formatDateShort,
  formatMoney,
  formatNumber,
  formatRateValue,
} from "@/lib/formatters";
import { equipmentTypeLabel, loadCapacityLabel } from "@/lib/load-details";
import type { Driver, LoadWithMetrics, Truck } from "@/lib/types";
import { cn } from "@/lib/utils";
import { LoadFormDialog } from "./load-form-dialog";
import { RatingBadge } from "./rating-badge";

/** Sort order so "best loads first" is one click on the Rating column. */
const RATING_ORDER: Record<string, number> = { BAD: 0, MARGINAL: 1, GOOD: 2, GREAT: 3 };

type SortKey =
  | "date"
  | "broker"
  | "loadedMiles"
  | "deadheadMiles"
  | "totalMiles"
  | "grossRate"
  | "ratePerLoaded"
  | "ratePerTotal"
  | "expenses"
  | "profit"
  | "profitPerMile"
  | "rating"
  | "status";

interface Column {
  key: SortKey;
  label: string;
  numeric?: boolean;
  className?: string;
}

const COLUMNS: Column[] = [
  { key: "date", label: "Pickup" },
  { key: "broker", label: "Broker" },
  { key: "loadedMiles", label: "Loaded", numeric: true },
  { key: "deadheadMiles", label: "DH", numeric: true },
  { key: "totalMiles", label: "Total mi", numeric: true },
  { key: "grossRate", label: "Rate", numeric: true },
  { key: "ratePerLoaded", label: "$/Loaded", numeric: true },
  { key: "ratePerTotal", label: "$/Total", numeric: true },
  { key: "expenses", label: "Direct Trip Costs", numeric: true },
  { key: "profit", label: "Contribution Profit", numeric: true },
  { key: "profitPerMile", label: "Contribution/mi", numeric: true },
  { key: "rating", label: "Rating" },
  { key: "status", label: "Status" },
];

function valueFor(load: LoadWithMetrics, key: SortKey): string | number {
  switch (key) {
    case "date":
      return load.date;
    case "broker":
      return (load.broker ?? "").toLowerCase();
    case "loadedMiles":
      return load.loadedMiles;
    case "deadheadMiles":
      return load.deadheadMiles;
    case "totalMiles":
      return load.metrics.totalMiles;
    case "grossRate":
      return load.grossRate;
    case "ratePerLoaded":
      return load.metrics.revenuePerLoadedMile;
    case "ratePerTotal":
      return load.metrics.revenuePerTotalMile;
    case "expenses":
      return load.metrics.tripExpenses;
    case "profit":
      return load.metrics.tripProfit;
    case "profitPerMile":
      return load.metrics.profitPerMile;
    case "rating":
      return RATING_ORDER[load.metrics.rating];
    case "status":
      return load.status;
    default:
      return 0;
  }
}

interface LoadsTableProps {
  loads: LoadWithMetrics[];
  brokers: string[];
  trucks?: Truck[];
  drivers?: Driver[];
  driverSchedule?: DriverScheduleEntry[];
  defaultTruckId?: string | null;
  /** Same default the page header uses, so both entry points agree. */
  defaultDate?: string;
  ratingThresholds?: RatingThresholds;
  deadheadWarnPct?: number;
  /** Shown when filters are cleared and there is genuinely no data. */
  emptyDescription?: string;
}

export function LoadsTable({
  loads,
  brokers,
  trucks = [],
  drivers = [],
  driverSchedule = [],
  defaultTruckId,
  defaultDate,
  ratingThresholds,
  deadheadWarnPct = 20,
  emptyDescription,
}: LoadsTableProps) {
  // Only worth a line on the row once there is more than one unit it could
  // have been.
  const showTruck = trucks.length > 1;
  const truckName = (id: string) => trucks.find((t) => t.id === id)?.name ?? "Unknown truck";
  const router = useRouter();
  const [search, setSearch] = React.useState("");
  const [broker, setBroker] = React.useState("all");
  const [status, setStatus] = React.useState("all");
  const [rating, setRating] = React.useState("all");
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const [sort, setSort] = React.useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "date",
    dir: "desc",
  });

  const filtered = React.useMemo(() => {
    const query = search.trim().toLowerCase();

    const rows = loads.filter((load) => {
      if (broker !== "all" && load.broker !== broker) return false;
      if (status !== "all" && load.status !== status) return false;
      if (rating !== "all" && load.metrics.rating !== rating) return false;
      if (from && load.date < from) return false;
      if (to && load.date > to) return false;
      if (!query) return true;

      return [
        load.originCity,
        load.originState,
        load.destinationCity,
        load.destinationState,
        load.broker ?? "",
        load.loadNumber ?? "",
        load.commodity ?? "",
        equipmentTypeLabel(load.equipmentType),
        loadCapacityLabel(load.loadCapacity),
        load.notes ?? "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });

    return rows.sort((a, b) => {
      const av = valueFor(a, sort.key);
      const bv = valueFor(b, sort.key);
      const cmp =
        typeof av === "number" && typeof bv === "number"
          ? av - bv
          : String(av).localeCompare(String(bv));
      return sort.dir === "asc" ? cmp : -cmp;
    });
  }, [loads, search, broker, status, rating, from, to, sort]);

  const totals = React.useMemo(
    () =>
      filtered.reduce(
        (acc, load) => ({
          loaded: acc.loaded + load.loadedMiles,
          deadhead: acc.deadhead + load.deadheadMiles,
          total: acc.total + load.metrics.totalMiles,
          rate: acc.rate + load.grossRate,
          expenses: acc.expenses + load.metrics.tripExpenses,
          profit: acc.profit + load.metrics.tripProfit,
        }),
        { loaded: 0, deadhead: 0, total: 0, rate: 0, expenses: 0, profit: 0 },
      ),
    [filtered],
  );

  const hasFilters =
    search !== "" ||
    broker !== "all" ||
    status !== "all" ||
    rating !== "all" ||
    from !== "" ||
    to !== "";

  function toggleSort(key: SortKey) {
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key, dir: key === "date" || key === "broker" || key === "status" ? "asc" : "desc" },
    );
  }

  function clearFilters() {
    setSearch("");
    setBroker("all");
    setStatus("all");
    setRating("all");
    setFrom("");
    setTo("");
  }

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex flex-wrap items-center gap-2 border-b border-border p-2.5">
        <div className="relative min-w-[11.25rem] flex-1">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search route, broker, equipment, commodity..."
            className="pl-7"
            aria-label="Search loads"
          />
        </div>

        <Select value={broker} onValueChange={setBroker}>
          <SelectTrigger className="w-[12.5rem]" aria-label="Filter by broker">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All brokers</SelectItem>
            {brokers.map((name) => (
              <SelectItem key={name} value={name}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[9.5rem]" aria-label="Filter by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="PENDING">Pending</SelectItem>
            <SelectItem value="INVOICED">Invoiced</SelectItem>
            <SelectItem value="PAID">Paid</SelectItem>
          </SelectContent>
        </Select>

        <Select value={rating} onValueChange={setRating}>
          <SelectTrigger className="w-[9.5rem]" aria-label="Filter by rating">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All ratings</SelectItem>
            <SelectItem value="GREAT">Great</SelectItem>
            <SelectItem value="GOOD">Good</SelectItem>
            <SelectItem value="MARGINAL">Marginal</SelectItem>
            <SelectItem value="BAD">Bad</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex items-center gap-1">
          <Input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="w-[9.5rem]"
            aria-label="From date"
          />
          <span className="text-xs text-muted-foreground">to</span>
          <Input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="w-[9.5rem]"
            aria-label="To date"
          />
        </div>

        {hasFilters ? (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <X />
            Clear
          </Button>
        ) : null}

        <span className="ml-auto whitespace-nowrap text-2xs text-muted-foreground tnum">
          {filtered.length} of {loads.length} loads
        </span>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Package}
          title={hasFilters ? "No loads match these filters" : "No loads yet"}
          description={
            hasFilters
              ? "Try widening the date range or clearing the broker and status filters."
              : (emptyDescription ??
                "Add your first load to start tracking Booked Revenue and Contribution Profit per mile.")
          }
          action={
            hasFilters ? (
              <Button variant="outline" size="sm" onClick={clearFilters}>
                Clear filters
              </Button>
            ) : (
              <LoadFormDialog
                brokers={brokers}
                trucks={trucks}
                drivers={drivers}
                driverSchedule={driverSchedule}
                defaultTruckId={defaultTruckId}
                defaultDate={defaultDate}
                ratingThresholds={ratingThresholds}
              />
            )
          }
        />
      ) : (
        <TableWrapper>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                {COLUMNS.map((column) => {
                  const active = sort.key === column.key;
                  const Icon = !active ? ArrowUpDown : sort.dir === "asc" ? ChevronUp : ChevronDown;
                  return (
                    <TableHead
                      key={column.key}
                      className={cn(column.numeric && "text-right", column.className)}
                      aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
                    >
                      <button
                        type="button"
                        onClick={() => toggleSort(column.key)}
                        className={cn(
                          "inline-flex items-center gap-1 rounded-sm transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
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
              </TableRow>
            </TableHeader>

            <TableBody>
              {filtered.map((load) => (
                <TableRow
                  key={load.id}
                  className="group cursor-pointer"
                  onClick={() => router.push(`/loads/${load.id}`)}
                >
                  <TableCell className="text-muted-foreground">
                    <Link
                      href={`/loads/${load.id}`}
                      onClick={(event) => event.stopPropagation()}
                      className="rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span className="group-hover:text-foreground">
                        {formatDateShort(load.date)}
                      </span>
                      <span className="ml-2 hidden text-foreground group-hover:underline xl:inline">
                        {load.originCity}, {load.originState}
                        <span className="mx-1 text-muted-foreground">to</span>
                        {load.destinationCity}, {load.destinationState}
                      </span>
                      <span className="ml-2 text-foreground group-hover:underline xl:hidden">
                        {load.originState}-{load.destinationState}
                      </span>
                    </Link>
                    {showTruck ? (
                      <span className="ml-2 text-2xs text-muted-foreground">
                        {truckName(load.truckId)}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="max-w-[13rem] text-muted-foreground">
                    <span className="block truncate">{load.broker ?? "--"}</span>
                    {load.equipmentType || load.loadCapacity || load.commodity ? (
                      <span className="block truncate text-2xs text-muted-foreground/80">
                        {[
                          load.equipmentType ? equipmentTypeLabel(load.equipmentType) : null,
                          load.loadCapacity ? loadCapacityLabel(load.loadCapacity) : null,
                          load.commodity,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right tnum">
                    {formatNumber(load.loadedMiles)}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right tnum",
                      isDeadheadElevated(load.metrics.deadheadPct, deadheadWarnPct)
                        ? "text-warn"
                        : "text-muted-foreground",
                    )}
                  >
                    {formatNumber(load.deadheadMiles)}
                  </TableCell>
                  <TableCell className="text-right tnum">
                    {formatNumber(load.metrics.totalMiles)}
                  </TableCell>
                  <TableCell className="text-right tnum font-medium">
                    {formatMoney(load.grossRate)}
                  </TableCell>
                  <TableCell className="text-right tnum text-muted-foreground">
                    {formatRateValue(load.metrics.revenuePerLoadedMile)}
                  </TableCell>
                  <TableCell className="text-right tnum text-muted-foreground">
                    {formatRateValue(load.metrics.revenuePerTotalMile)}
                  </TableCell>
                  <TableCell className="text-right tnum text-neg">
                    {load.metrics.tripExpenses > 0
                      ? `-${formatMoney(load.metrics.tripExpenses)}`
                      : formatMoney(0)}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right tnum font-medium",
                      load.metrics.tripProfit >= 0 ? "text-pos" : "text-neg",
                    )}
                  >
                    {formatMoney(load.metrics.tripProfit)}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right tnum",
                      load.metrics.profitPerMile >= 0 ? "text-pos" : "text-neg",
                    )}
                  >
                    {formatRateValue(load.metrics.profitPerMile)}
                  </TableCell>
                  <TableCell>
                    <RatingBadge rating={load.metrics.rating} />
                  </TableCell>
                  <TableCell>
                    <span className="flex items-center justify-between gap-2">
                      <StatusBadge status={load.status} />
                      <ChevronRight
                        className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                        aria-hidden
                      />
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>

            <TableFooter>
              <TableRow className="hover:bg-transparent">
                <TableCell className="text-2xs uppercase tracking-wider text-muted-foreground">
                  Totals
                </TableCell>
                <TableCell />
                <TableCell className="text-right tnum">{formatNumber(totals.loaded)}</TableCell>
                <TableCell className="text-right tnum">{formatNumber(totals.deadhead)}</TableCell>
                <TableCell className="text-right tnum">{formatNumber(totals.total)}</TableCell>
                <TableCell className="text-right tnum">{formatMoney(totals.rate)}</TableCell>
                <TableCell />
                <TableCell />
                <TableCell className="text-right tnum text-neg">
                  {totals.expenses > 0 ? `-${formatMoney(totals.expenses)}` : formatMoney(0)}
                </TableCell>
                <TableCell
                  className={cn(
                    "text-right tnum",
                    totals.profit >= 0 ? "text-pos" : "text-neg",
                  )}
                >
                  {formatMoney(totals.profit)}
                </TableCell>
                <TableCell className="text-right tnum">
                  {formatRateValue(div(totals.profit, totals.total))}
                </TableCell>
                <TableCell />
                <TableCell />
              </TableRow>
            </TableFooter>
          </Table>
        </TableWrapper>
      )}
    </div>
  );
}
