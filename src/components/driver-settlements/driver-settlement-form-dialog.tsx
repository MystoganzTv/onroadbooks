"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

import { createDriverSettlementAction } from "@/lib/actions/driver-settlements";
import { fieldErrors, focusFirstError, validationMessage } from "@/lib/form";
import { driverSettlementSchema } from "@/lib/schemas";
import type { Driver } from "@/lib/types";
import { todayISO } from "@/lib/periods";
import { Field } from "@/components/shared/field";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export function DriverSettlementFormDialog({
  drivers,
  defaultDriverId,
  defaultPeriodStart,
  defaultPeriodEnd,
}: {
  drivers: Driver[];
  defaultDriverId?: string;
  defaultPeriodStart?: string;
  defaultPeriodEnd?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const today = todayISO();
  const [driverId, setDriverId] = React.useState(
    drivers.some((driver) => driver.id === defaultDriverId) ? defaultDriverId! : drivers[0]?.id ?? "",
  );
  const [periodStart, setPeriodStart] = React.useState(defaultPeriodStart ?? `${today.slice(0, 7)}-01`);
  const [periodEnd, setPeriodEnd] = React.useState(defaultPeriodEnd ?? today);
  const [notes, setNotes] = React.useState("");

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const values = { driverId, periodStart, periodEnd, notes: notes || null };
    const parsed = driverSettlementSchema.safeParse(values);
    if (!parsed.success) {
      const next = fieldErrors(parsed.error);
      setErrors(next);
      toast.error(validationMessage(next, {
        driverId: "Driver",
        periodStart: "Start date",
        periodEnd: "End date",
      }));
      requestAnimationFrame(() => focusFirstError("driver-settlement-form"));
      return;
    }
    startTransition(async () => {
      const result = await createDriverSettlementAction(values);
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        toast.error(result.error);
        return;
      }
      toast.success("Driver statement prepared", {
        description: "The included loads and pay terms are now frozen in this draft.",
      });
      setOpen(false);
      if (result.id) router.push(`/driver-settlements/${result.id}`);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" disabled={drivers.length === 0}><Plus /> Prepare statement</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Prepare driver statement</DialogTitle>
          <DialogDescription>
            Every unsettled load assigned to this driver inside the date range is included. The draft freezes its pay terms and amounts.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <form id="driver-settlement-form" onSubmit={submit} className="space-y-4" noValidate>
            <Field label="Driver" htmlFor="statement-driver" required error={errors.driverId}>
              <Select value={driverId} onValueChange={setDriverId}>
                <SelectTrigger id="statement-driver"><SelectValue placeholder="Choose a driver" /></SelectTrigger>
                <SelectContent>{drivers.map((driver) => <SelectItem key={driver.id} value={driver.id}>{driver.name}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Start date" htmlFor="statement-start" required error={errors.periodStart}>
                <Input id="statement-start" type="date" value={periodStart} onChange={(event) => setPeriodStart(event.target.value)} />
              </Field>
              <Field label="End date" htmlFor="statement-end" required error={errors.periodEnd}>
                <Input id="statement-end" type="date" min={periodStart} value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} />
              </Field>
            </div>
            <Field label="Notes" htmlFor="statement-notes">
              <Textarea id="statement-notes" value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={2000} placeholder="Optional operational note" />
            </Field>
          </form>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button>
          <Button type="submit" form="driver-settlement-form" size="sm" disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : <Plus />} Prepare draft
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
