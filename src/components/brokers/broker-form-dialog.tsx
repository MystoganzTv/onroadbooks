"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { GitMerge, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { useLanguage } from "@/components/shell/language-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/shared/field";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { mergeBrokerAction, saveBrokerAction } from "@/lib/actions/brokers";
import { localizedClientError } from "@/lib/i18n/errors";
import { interpolate } from "@/lib/i18n/dictionaries";
import type { Broker } from "@/lib/types";

/**
 * The broker as a company: name, main line and email, MC, address, notes. The people
 * there are contacts, edited on the broker's page, so one company can hold
 * every agent the owner books with.
 */
export function BrokerFormDialog({
  broker,
  initialName = "",
  trigger,
  loadCount = 0,
}: {
  broker?: Broker;
  initialName?: string;
  trigger?: React.ReactNode;
  /** Loads under this broker's name, for the merge explanation. */
  loadCount?: number;
}) {
  const { dictionary } = useLanguage();
  const copy = dictionary.brokers;
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [duplicate, setDuplicate] = React.useState<{ id: string; name: string } | null>(null);
  const formId = React.useId();
  const fields = ["name", "phone", "email", "mcNumber", "address", "notes"] as const;
  const labels = { name: copy.name, phone: copy.phone, email: copy.email, mcNumber: copy.mc, address: copy.address, notes: copy.notes };

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const values = Object.fromEntries(fields.map((key) => [key, String(form.get(key) ?? "")]));
    startTransition(async () => {
      const result = await saveBrokerAction(broker?.id ?? null, values);
      if (!result.ok) {
        if ("duplicateOf" in result) {
          setErrors({});
          setDuplicate(result.duplicateOf);
          return;
        }
        setErrors(result.fieldErrors ?? {});
        toast.error(localizedClientError(result.error));
        return;
      }
      toast.success(copy.saved);
      setOpen(false);
      router.push(`/brokers/${result.id}`);
      router.refresh();
    });
  }

  function merge() {
    if (!broker || !duplicate) return;
    const target = duplicate;
    startTransition(async () => {
      const result = await mergeBrokerAction(broker.id, target.id);
      if (!result.ok) {
        toast.error(localizedClientError(result.error));
        return;
      }
      toast.success(interpolate(copy.merged, { name: target.name }));
      setOpen(false);
      router.push(`/brokers/${target.id}`);
      router.refresh();
    });
  }

  return <Dialog open={open} onOpenChange={(value) => { setOpen(value); setErrors({}); setDuplicate(null); }}>
    <DialogTrigger asChild>{trigger ?? <Button size="sm"><Plus />{copy.add}</Button>}</DialogTrigger>
    <DialogContent>
      <DialogHeader><DialogTitle>{broker ? copy.edit : copy.add}</DialogTitle><DialogDescription>{copy.companyFormDescription}</DialogDescription></DialogHeader>
      <DialogBody>
        {duplicate ? <div role="alert" className="mb-4 rounded-md border border-warn/40 bg-warn-soft p-3 text-sm">
          <p className="font-medium text-foreground">{interpolate(copy.duplicateTitle, { name: duplicate.name })}</p>
          {broker ? <>
            <p className="mt-1 text-muted-foreground">{interpolate(copy.mergeExplain, { source: broker.name, target: duplicate.name, count: loadCount })}</p>
            <Button type="button" size="sm" className="mt-3" onClick={merge} disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : <GitMerge />}{interpolate(copy.mergeAction, { name: duplicate.name })}
            </Button>
          </> : <Button asChild variant="outline" size="sm" className="mt-3">
            <Link href={`/brokers/${duplicate.id}`} onClick={() => setOpen(false)}>{interpolate(copy.openExisting, { name: duplicate.name })}</Link>
          </Button>}
        </div> : null}
        <form id={formId} onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
          {fields.map((key) => <Field key={key} label={labels[key]} htmlFor={`${formId}-${key}`} required={key === "name"} error={errors[key]} className={key === "notes" || key === "address" ? "sm:col-span-2" : undefined}>
            {key === "notes" || key === "address"
              ? <Textarea id={`${formId}-${key}`} name={key} defaultValue={broker?.[key] ?? ""} maxLength={key === "notes" ? 4000 : 500} />
              : <Input id={`${formId}-${key}`} name={key} defaultValue={broker?.[key] ?? (key === "name" ? initialName : "")} type={key === "email" ? "email" : key === "phone" ? "tel" : "text"} maxLength={key === "email" ? 254 : key === "phone" ? 60 : key === "mcNumber" ? 40 : 120} required={key === "name"} aria-invalid={Boolean(errors[key])} onChange={key === "name" ? () => setDuplicate(null) : undefined} />}
          </Field>)}
        </form>
      </DialogBody>
      <DialogFooter><Button variant="outline" size="sm" onClick={() => setOpen(false)} disabled={pending}>{dictionary.common.cancel}</Button><Button form={formId} type="submit" size="sm" disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : null}{dictionary.common.saveChanges}</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
