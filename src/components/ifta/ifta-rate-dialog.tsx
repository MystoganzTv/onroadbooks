"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Settings2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { localizedClientError } from "@/lib/i18n/errors";
import { useLanguage } from "@/components/shell/language-provider";
import { interpolate } from "@/lib/i18n/dictionaries";

import { saveIftaRatesAction } from "@/lib/actions/ifta";
import { IFTA_JURISDICTIONS } from "@/lib/ifta";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface RateRow { id: string; jurisdiction: string; rate: string }

export function IftaRateDialog({ quarter, initialRates, jurisdictions, canManage }: {
  quarter: string;
  initialRates: Record<string, number>;
  jurisdictions: string[];
  canManage: boolean;
}) {
  const { dictionary } = useLanguage();
  const copy = dictionary.ifta;
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const makeRows = React.useCallback((): RateRow[] => {
    const codes = [...new Set([...jurisdictions, ...Object.keys(initialRates)])].sort();
    return codes.map((jurisdiction, index) => ({ id: `${jurisdiction}-${index}`, jurisdiction, rate: initialRates[jurisdiction] == null ? "" : String(initialRates[jurisdiction]) }));
  }, [initialRates, jurisdictions]);
  const [rows, setRows] = React.useState<RateRow[]>(makeRows);

  function save() {
    const rates: Record<string, number> = {};
    for (const row of rows) {
      if (!row.jurisdiction || row.rate.trim() === "") continue;
      rates[row.jurisdiction] = Number(row.rate);
    }
    startTransition(async () => {
      const result = await saveIftaRatesAction({ quarter, rates });
      if (!result.ok) return void toast.error(localizedClientError(result.error));
      toast.success(copy.ratesSaved);
      setOpen(false);
      router.refresh();
    });
  }

  return <Dialog open={open} onOpenChange={(value) => { setOpen(value); if (value) setRows(makeRows()); }}>
    <DialogTrigger asChild><Button size="sm" variant="outline" disabled={!canManage}><Settings2 /> {copy.taxRates}</Button></DialogTrigger>
    <DialogContent>
      <DialogHeader><DialogTitle>{interpolate(copy.quarterRates, { quarter })}</DialogTitle><DialogDescription>{copy.rateDescription}</DialogDescription></DialogHeader>
      <DialogBody className="space-y-3">
        {rows.length === 0 ? <p className="text-sm text-muted-foreground">{copy.addFirstJurisdiction}</p> : null}
        {rows.map((row) => <div key={row.id} className="grid grid-cols-[1fr_1fr_auto] gap-2">
          <Select value={row.jurisdiction} onValueChange={(value) => setRows((current) => current.map((item) => item.id === row.id ? { ...item, jurisdiction: value } : item))}>
            <SelectTrigger aria-label={copy.jurisdiction}><SelectValue placeholder={copy.stateProvince} /></SelectTrigger>
            <SelectContent>{IFTA_JURISDICTIONS.map((code) => <SelectItem key={code} value={code}>{code}</SelectItem>)}</SelectContent>
          </Select>
          <Input aria-label={interpolate(copy.taxRateFor, { jurisdiction: row.jurisdiction || copy.jurisdiction })} type="number" min="0" max="5" step="0.0001" value={row.rate} placeholder={copy.perGallon} onChange={(event) => setRows((current) => current.map((item) => item.id === row.id ? { ...item, rate: event.target.value } : item))} />
          <Button type="button" size="icon" variant="ghost" aria-label={copy.removeRate} onClick={() => setRows((current) => current.filter((item) => item.id !== row.id))}><Trash2 /></Button>
        </div>)}
        <Button type="button" size="sm" variant="outline" onClick={() => setRows((current) => [...current, { id: `new-${Date.now()}`, jurisdiction: "", rate: "" }])}><Plus /> {copy.addJurisdiction}</Button>
      </DialogBody>
      <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>{dictionary.common.cancel}</Button><Button onClick={save} disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : null} {copy.saveRates}</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
