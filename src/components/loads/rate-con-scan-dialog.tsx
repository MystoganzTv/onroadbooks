"use client";

import * as React from "react";
import { AlertTriangle, Loader2, ScanLine, Upload } from "lucide-react";
import { toast } from "sonner";

import { useLanguage } from "@/components/shell/language-provider";
import type { PendingUpload } from "@/components/documents/document-uploader";
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
import type { RatingThresholds } from "@/lib/calculations";
import { optimizeDocumentFile } from "@/lib/document-optimization";
import type { DriverScheduleEntry } from "@/lib/driver-availability";
import { formatMiles, formatMoney, formatNumber } from "@/lib/formatters";
import { interpolate } from "@/lib/i18n/dictionaries";
import { localizedClientError } from "@/lib/i18n/errors";
import { formatLocaleDate } from "@/lib/i18n-format";
import { equipmentTypeLabel } from "@/lib/load-details";
import {
  isScannableType,
  MAX_SCAN_BYTES,
  SCAN_ACCEPT_ATTRIBUTE,
  type RateConField,
  type RateConReading,
} from "@/lib/rate-con/schema";
import type { Driver, Truck } from "@/lib/types";
import { cn } from "@/lib/utils";

import { LoadFormDialog, type LoadPrefill } from "./load-form-dialog";

/**
 * SCAN A RATE CONFIRMATION
 * ========================
 *
 * The shortest path from the broker's PDF to a saved load, and the answer to
 * the reason most owner-operators abandon a bookkeeping app: an empty ledger
 * that only fills up if you retype every load by hand.
 *
 * The flow is deliberately two steps, not one:
 *
 *   1. read the document and SHOW what it says, saving nothing;
 *   2. hand those values to the ordinary load form, where the owner checks
 *      them against the PDF and presses save themselves.
 *
 * A rate confirmation is a contract. A machine reading of one is a draft, and
 * a draft that files itself is how a wrong rate ends up in someone's books
 * and their IFTA return. The scanned file rides along and is attached to the
 * load on save, so the document that produced the numbers stays with them.
 */

interface RateConScanDialogProps {
  brokers?: string[];
  trucks?: Truck[];
  drivers?: Driver[];
  defaultTruckId?: string | null;
  defaultDate?: string;
  ratingThresholds?: RatingThresholds;
  driverSchedule?: DriverScheduleEntry[];
}

type Stage = "idle" | "working" | "result";

const MAX_SCAN_MB = Math.round(MAX_SCAN_BYTES / 1024 / 1024);

export function RateConScanDialog({
  brokers = [],
  trucks = [],
  drivers = [],
  defaultTruckId,
  defaultDate,
  ratingThresholds,
  driverSchedule = [],
}: RateConScanDialogProps) {
  const { dictionary, locale } = useLanguage();
  const copy = dictionary.rateCon;
  const loadsCopy = dictionary.loads;
  const documentsCopy = dictionary.documents;

  const [open, setOpen] = React.useState(false);
  const [stage, setStage] = React.useState<Stage>("idle");
  const [progress, setProgress] = React.useState<string | null>(null);
  const [dragging, setDragging] = React.useState(false);
  const [reading, setReading] = React.useState<RateConReading | null>(null);
  const [scanned, setScanned] = React.useState<File | null>(null);
  const [handoff, setHandoff] = React.useState<{
    prefill: LoadPrefill;
    attachments: PendingUpload[];
  } | null>(null);
  const [formOpen, setFormOpen] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  function reset() {
    setStage("idle");
    setProgress(null);
    setReading(null);
    setScanned(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  const accept = React.useCallback(
    async (files: FileList | null) => {
      const source = files?.[0];
      if (!source) return;
      if (!isScannableType(source.type)) {
        toast.error(interpolate(documentsCopy.invalidType, { name: source.name }));
        return;
      }

      setStage("working");
      setProgress(copy.preparing);
      // The same optimizer the attachment picker uses, so a phone photo of a
      // rate con is shrunk here instead of being refused for its size.
      const file = await optimizeDocumentFile(source).catch(() => source);
      if (file.size > MAX_SCAN_BYTES) {
        toast.error(interpolate(documentsCopy.stillTooLarge, { name: source.name, size: MAX_SCAN_MB }));
        reset();
        return;
      }

      setProgress(copy.reading);
      const body = new FormData();
      body.append("file", file, file.name);

      try {
        const reply = await fetch("/api/rate-con/scan", { method: "POST", body });
        const payload = (await reply.json().catch(() => null)) as
          | (RateConReading & { error?: string })
          | null;
        if (!reply.ok || !payload?.fields) {
          toast.error(localizedClientError(payload?.error));
          reset();
          return;
        }
        setReading({ fields: payload.fields, missing: payload.missing ?? [] });
        setScanned(file);
        setStage("result");
        setProgress(null);
      } catch {
        toast.error(localizedClientError(null));
        reset();
      }
    },
    [copy.preparing, copy.reading, documentsCopy.invalidType, documentsCopy.stillTooLarge],
  );

  function handOff() {
    if (!reading || !scanned) return;
    const f = reading.fields;
    setHandoff({
      prefill: {
        date: f.date ?? undefined,
        deliveryDate: f.deliveryDate ?? undefined,
        originCity: f.originCity ?? undefined,
        originState: f.originState ?? undefined,
        destinationCity: f.destinationCity ?? undefined,
        destinationState: f.destinationState ?? undefined,
        broker: f.broker ?? undefined,
        loadNumber: f.loadNumber ?? undefined,
        equipmentType: f.equipmentType ?? undefined,
        equipmentLengthFt: f.equipmentLengthFt ?? undefined,
        weightLbs: f.weightLbs ?? undefined,
        commodity: f.commodity ?? undefined,
        loadedMiles: f.loadedMiles ?? undefined,
        grossRate: f.grossRate ?? undefined,
      },
      attachments: [{ file: scanned, type: "RATE_CONFIRMATION" }],
    });
    setOpen(false);
    setFormOpen(true);
  }

  const fieldLabels: Record<RateConField, string> = {
    broker: loadsCopy.broker,
    loadNumber: loadsCopy.loadNumberLabel,
    date: loadsCopy.pickupDate,
    deliveryDate: loadsCopy.deliveryDate,
    originCity: loadsCopy.originCity,
    originState: copy.originState,
    destinationCity: loadsCopy.destinationCity,
    destinationState: copy.destinationState,
    loadedMiles: loadsCopy.loadedMiles,
    grossRate: loadsCopy.grossRate,
    equipmentType: loadsCopy.equipment,
    equipmentLengthFt: loadsCopy.lengthFeet,
    weightLbs: loadsCopy.weight,
    commodity: loadsCopy.commodity,
  };

  const rows = reading ? summaryRows(reading, copy.route, fieldLabels, locale) : [];

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) reset();
        }}
      >
        <DialogTrigger asChild>
          <Button size="sm" variant="outline">
            <ScanLine />
            {copy.scan}
          </Button>
        </DialogTrigger>

        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{copy.title}</DialogTitle>
            <DialogDescription>{copy.description}</DialogDescription>
          </DialogHeader>

          <DialogBody className="space-y-4">
            {stage === "working" && (
              <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-8 text-center">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
                <p className="text-sm font-medium text-foreground">{progress}</p>
                <p className="text-2xs text-muted-foreground">{copy.readingNote}</p>
              </div>
            )}

            {stage === "idle" && (
              <div
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragging(false);
                  void accept(event.dataTransfer.files);
                }}
                className={cn(
                  "flex flex-col items-center gap-3 rounded-lg border border-dashed p-8 text-center transition-colors",
                  dragging && "border-primary bg-primary/5",
                )}
              >
                <Upload className="size-5 text-muted-foreground" />
                <p className="text-2xs text-muted-foreground">
                  {interpolate(copy.dropZone, { size: MAX_SCAN_MB })}
                </p>
                <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
                  {copy.chooseFile}
                </Button>
                <input
                  ref={inputRef}
                  type="file"
                  className="sr-only"
                  accept={SCAN_ACCEPT_ATTRIBUTE}
                  onChange={(event) => void accept(event.target.files)}
                />
              </div>
            )}

            {stage === "result" && reading && (
              <>
                <div>
                  <p className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">
                    {copy.resultTitle}
                  </p>
                  <dl className="mt-2 divide-y rounded-lg border">
                    {rows.map((row) => (
                      <div key={row.label} className="flex items-baseline justify-between gap-4 px-3 py-2">
                        <dt className="text-2xs text-muted-foreground">{row.label}</dt>
                        <dd className="text-right text-sm font-medium text-foreground">{row.value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>

                {reading.missing.length > 0 && (
                  <div className="rounded-lg border border-warn/35 bg-warn-soft/45 p-3">
                    <p className="flex items-center gap-1.5 text-2xs font-medium text-foreground">
                      <AlertTriangle className="size-3.5" />
                      {copy.missingTitle}
                    </p>
                    <p className="mt-1 text-2xs text-muted-foreground">
                      {reading.missing.map((field) => fieldLabels[field]).join(" · ")}
                    </p>
                    <p className="mt-1 text-2xs text-muted-foreground">{copy.missingNote}</p>
                  </div>
                )}

                <p className="text-2xs leading-relaxed text-muted-foreground">{copy.reviewNote}</p>
                <p className="text-2xs leading-relaxed text-muted-foreground">{copy.attachNote}</p>
              </>
            )}
          </DialogBody>

          {stage === "result" && (
            <DialogFooter>
              <Button type="button" variant="outline" onClick={reset}>
                {copy.another}
              </Button>
              <Button type="button" onClick={handOff}>
                {copy.continueAction}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      <LoadFormDialog
        brokers={brokers}
        trucks={trucks}
        drivers={drivers}
        defaultTruckId={defaultTruckId}
        defaultDate={defaultDate}
        ratingThresholds={ratingThresholds}
        driverSchedule={driverSchedule}
        trigger={null}
        prefill={handoff?.prefill}
        initialAttachments={handoff?.attachments}
        open={formOpen}
        onOpenChange={setFormOpen}
      />
    </>
  );
}

interface SummaryRow {
  label: string;
  value: string;
}

/** Only what the document actually gave us. An empty row teaches nothing. */
function summaryRows(
  reading: RateConReading,
  routeLabel: string,
  labels: Record<RateConField, string>,
  locale: "en" | "es",
): SummaryRow[] {
  const f = reading.fields;
  const rows: SummaryRow[] = [];
  const push = (label: string, value: string | null) => {
    if (value) rows.push({ label, value });
  };

  push(labels.broker, f.broker);
  push(labels.loadNumber, f.loadNumber);
  if (f.originCity || f.destinationCity) {
    const origin = [f.originCity, f.originState].filter(Boolean).join(", ");
    const destination = [f.destinationCity, f.destinationState].filter(Boolean).join(", ");
    push(routeLabel, [origin, destination].filter(Boolean).join(" → "));
  }
  push(labels.date, f.date ? formatLocaleDate(f.date, locale) : null);
  push(labels.deliveryDate, f.deliveryDate ? formatLocaleDate(f.deliveryDate, locale) : null);
  push(labels.loadedMiles, f.loadedMiles ? formatMiles(f.loadedMiles) : null);
  push(labels.grossRate, f.grossRate ? formatMoney(f.grossRate) : null);
  push(labels.equipmentType, f.equipmentType ? equipmentTypeLabel(f.equipmentType, locale) : null);
  push(labels.equipmentLengthFt, f.equipmentLengthFt ? `${formatNumber(f.equipmentLengthFt)} ft` : null);
  push(labels.weightLbs, f.weightLbs ? `${formatNumber(f.weightLbs)} lb` : null);
  push(labels.commodity, f.commodity);
  return rows;
}
