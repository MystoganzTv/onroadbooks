"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, Circle, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { useLanguage } from "@/components/shell/language-provider";
import { TableCell, TableRow } from "@/components/ui/table";
import { setDispatchPaidAction } from "@/lib/actions/dispatchers";
import { interpolate } from "@/lib/i18n/dictionaries";
import { localizedClientError } from "@/lib/i18n/errors";
import { cn } from "@/lib/utils";

/** The browser's own calendar day, so the server timezone cannot move it. */
function localDay(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function DispatchFeeRow({
  loadId,
  pickup,
  loadLabel,
  broker,
  fee,
  paidDate,
  canManage,
}: {
  loadId: string;
  pickup: string;
  loadLabel: string;
  broker: string;
  fee: string;
  paidDate: string | null;
  canManage: boolean;
}) {
  const { dictionary } = useLanguage();
  const copy = dictionary.dispatchers;
  const router = useRouter();
  const [paid, setPaid] = React.useState(paidDate);
  const [pending, startTransition] = React.useTransition();

  React.useEffect(() => setPaid(paidDate), [paidDate]);

  function toggle() {
    const previous = paid;
    const next = previous ? null : localDay();
    setPaid(next);
    startTransition(async () => {
      const result = await setDispatchPaidAction(loadId, next);
      if (result.ok) {
        router.refresh();
      } else {
        setPaid(previous);
        toast.error(localizedClientError(result.error));
      }
    });
  }

  const label = paid ? interpolate(copy.paidOn, { date: paid }) : copy.markPaid;
  const Icon = pending ? Loader2 : paid ? CheckCircle2 : Circle;

  return (
    <TableRow className={cn("transition-colors", paid && "bg-primary/10 hover:bg-primary/15")}>
      <TableCell className="w-px whitespace-nowrap">
        {canManage ? (
          <button
            type="button"
            role="checkbox"
            aria-checked={Boolean(paid)}
            aria-label={`${copy.paidColumn}: ${loadLabel}`}
            onClick={toggle}
            disabled={pending}
            className={cn(
              "inline-flex min-h-9 min-w-9 items-center justify-center gap-2 rounded-md border px-2 py-1.5 sm:px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-70",
              paid
                ? "border-primary bg-primary text-primary-foreground hover:bg-primary/90"
                : "border-border text-muted-foreground hover:border-primary hover:text-foreground",
            )}
          >
            <Icon className={cn("size-4", pending && "animate-spin")} aria-hidden />
            <span className="hidden sm:inline">{label}</span>
          </button>
        ) : (
          <span className={cn("inline-flex items-center gap-2 text-sm", paid ? "text-primary" : "text-muted-foreground")}>
            {paid ? <CheckCircle2 className="size-4" aria-hidden /> : <Circle className="size-4" aria-hidden />}
            <span className="hidden sm:inline">{paid ? label : copy.owed}</span>
          </span>
        )}
      </TableCell>
      <TableCell className="whitespace-nowrap">{pickup}</TableCell>
      <TableCell>
        <Link className="text-primary hover:underline" href={`/loads/${loadId}`}>{loadLabel}</Link>
      </TableCell>
      <TableCell>{broker}</TableCell>
      <TableCell className="text-right tabular-nums">{fee}</TableCell>
    </TableRow>
  );
}
