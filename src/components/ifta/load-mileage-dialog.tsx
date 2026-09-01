"use client";

import * as React from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { saveLoadIftaMilesAction } from "@/lib/actions/ifta";
import { formatMiles } from "@/lib/formatters";
import { IFTA_JURISDICTIONS, isIftaJurisdiction } from "@/lib/ifta";
import type { Load } from "@/lib/types";
import { toNumber } from "@/lib/utils";

interface MileageRow {
  id: string;
  jurisdiction: string;
  totalMiles: string;
  nonTaxableMiles: string;
}

interface LoadMileageDialogProps {
  load: Pick<
    Load,
    | "id"
    | "originCity"
    | "originState"
    | "destinationCity"
    | "destinationState"
    | "loadedMiles"
    | "deadheadMiles"
    | "jurisdictionMiles"
  >;
  trigger: React.ReactNode;
}

function initialRows(load: LoadMileageDialogProps["load"]): MileageRow[] {
  if (load.jurisdictionMiles.length > 0) {
    return load.jurisdictionMiles.map((row, index) => ({
      id: `${row.jurisdiction}-${index}`,
      jurisdiction: row.jurisdiction,
      totalMiles: String(row.totalMiles),
      nonTaxableMiles: row.nonTaxableMiles ? String(row.nonTaxableMiles) : "",
    }));
  }

  // Endpoints are known facts. They are useful starting rows, but miles stay
  // blank because intermediate jurisdictions and deadhead origin are unknown.
  return [...new Set([load.originState, load.destinationState])]
    .map((state) => state.trim().toUpperCase())
    .filter(isIftaJurisdiction)
    .map((jurisdiction, index) => ({
      id: `${jurisdiction}-${index}`,
      jurisdiction,
      totalMiles: "",
      nonTaxableMiles: "",
    }));
}

export function LoadMileageDialog({ load, trigger }: LoadMileageDialogProps) {
  const router = useRouter();
  const totalTripMiles = load.loadedMiles + load.deadheadMiles;
  const [open, setOpen] = React.useState(false);
  const [rows, setRows] = React.useState<MileageRow[]>(() => initialRows(load));
  const [error, setError] = React.useState<string>();
  const [pending, startTransition] = React.useTransition();
  const assignedMiles = rows.reduce((total, row) => total + toNumber(row.totalMiles), 0);
  const remainingMiles = Math.max(0, totalTripMiles - assignedMiles);

  function changeOpen(nextOpen: boolean) {
    if (nextOpen) {
      setRows(initialRows(load));
      setError(undefined);
    }
    setOpen(nextOpen);
  }

  function updateRow(id: string, patch: Partial<MileageRow>) {
    setRows((current) =>
      current.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    );
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const mileage = rows.map((row) => ({
      jurisdiction: row.jurisdiction,
      totalMiles: Math.round(toNumber(row.totalMiles)),
      nonTaxableMiles: Math.round(toNumber(row.nonTaxableMiles)),
    }));
    if (assignedMiles > totalTripMiles) {
      setError("Assigned jurisdiction miles cannot exceed total trip miles.");
      return;
    }
    if (mileage.some((row) => row.nonTaxableMiles > row.totalMiles)) {
      setError("Non-taxable miles cannot exceed that jurisdiction's total miles.");
      return;
    }

    setError(undefined);
    startTransition(async () => {
      const result = await saveLoadIftaMilesAction(load.id, mileage);
      if (!result.ok) {
        setError(result.error);
        toast.error(result.error);
        return;
      }
      toast.success("IFTA mileage updated", {
        description:
          remainingMiles > 0
            ? `${formatMiles(remainingMiles)} remain unassigned.`
            : "All trip miles are assigned to jurisdictions.",
      });
      changeOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign IFTA miles</DialogTitle>
          <DialogDescription>
            {load.originCity}, {load.originState} to {load.destinationCity},{" "}
            {load.destinationState} - {formatMiles(totalTripMiles)} total trip miles.
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          <form id={`ifta-mileage-${load.id}`} onSubmit={submit} className="space-y-3">
            <p className="rounded-md border border-warn/30 bg-warn/5 px-3 py-2 text-2xs leading-relaxed text-muted-foreground">
              Origin and destination are prefilled only as starting points. Add every state or
              province actually crossed. Intermediate jurisdictions and the origin of deadhead
              miles cannot be inferred from the load.
            </p>

            <div className="space-y-2">
              <div className="grid grid-cols-[6.5rem_1fr_1fr_auto] gap-2 px-1 text-2xs font-medium text-muted-foreground">
                <span>Jurisdiction</span>
                <span>Total miles</span>
                <span>Non-taxable</span>
                <span className="w-8" aria-hidden />
              </div>
              {rows.map((row) => (
                <div key={row.id} className="grid grid-cols-[6.5rem_1fr_1fr_auto] gap-2">
                  <Select
                    value={row.jurisdiction}
                    onValueChange={(jurisdiction) => updateRow(row.id, { jurisdiction })}
                  >
                    <SelectTrigger aria-label="IFTA jurisdiction">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {IFTA_JURISDICTIONS.map((jurisdiction) => (
                        <SelectItem key={jurisdiction} value={jurisdiction}>
                          {jurisdiction}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    aria-label={`${row.jurisdiction} total miles`}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    step={1}
                    placeholder="Total miles"
                    value={row.totalMiles}
                    onChange={(event) => updateRow(row.id, { totalMiles: event.target.value })}
                  />
                  <Input
                    aria-label={`${row.jurisdiction} non-taxable miles`}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    step={1}
                    placeholder="Non-taxable"
                    value={row.nonTaxableMiles}
                    onChange={(event) => updateRow(row.id, { nonTaxableMiles: event.target.value })}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove ${row.jurisdiction}`}
                    onClick={() => setRows((current) => current.filter((item) => item.id !== row.id))}
                  >
                    <Trash2 />
                  </Button>
                </div>
              ))}
            </div>

            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() =>
                setRows((current) => {
                  const origin = load.originState.toUpperCase();
                  const destination = load.destinationState.toUpperCase();
                  const jurisdiction = isIftaJurisdiction(origin)
                    ? origin
                    : isIftaJurisdiction(destination)
                      ? destination
                      : IFTA_JURISDICTIONS[0];
                  return [
                    ...current,
                    {
                      id: `ifta-${Date.now()}`,
                      jurisdiction,
                      totalMiles: "",
                      nonTaxableMiles: "",
                    },
                  ];
                })
              }
            >
              <Plus /> Add jurisdiction
            </Button>

            <div className="flex flex-wrap justify-between gap-2 text-2xs text-muted-foreground tnum">
              <span>Assigned {formatMiles(assignedMiles)}</span>
              <span className={remainingMiles > 0 ? "text-warn" : "text-pos"}>
                {formatMiles(remainingMiles)} unassigned
              </span>
            </div>
            {error ? <p className="text-2xs text-neg">{error}</p> : null}
          </form>
        </DialogBody>

        <DialogFooter>
          <Button type="button" variant="outline" size="sm" onClick={() => changeOpen(false)}>
            Cancel
          </Button>
          <Button
            type="submit"
            form={`ifta-mileage-${load.id}`}
            size="sm"
            disabled={pending || assignedMiles > totalTripMiles}
          >
            {pending ? <Loader2 className="animate-spin" /> : null}
            Save mileage
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
