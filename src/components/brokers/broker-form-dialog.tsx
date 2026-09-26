"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { useLanguage } from "@/components/shell/language-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/shared/field";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { saveBrokerAction } from "@/lib/actions/brokers";
import { localizedClientError } from "@/lib/i18n/errors";
import type { Broker } from "@/lib/types";

export function BrokerFormDialog({ broker, initialName = "", trigger }: { broker?: Broker; initialName?: string; trigger?: React.ReactNode }) {
  const { dictionary } = useLanguage();
  const copy = dictionary.brokers;
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const formId = React.useId();
  const fields = ["name", "contactName", "phone", "phoneExtension", "email", "mcNumber", "address", "notes"] as const;
  const labels = { name: copy.name, contactName: copy.contact, phone: copy.phone, phoneExtension: copy.extension, email: copy.email, mcNumber: copy.mc, address: copy.address, notes: copy.notes };

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const values = Object.fromEntries(fields.map((key) => [key, String(form.get(key) ?? "")]));
    startTransition(async () => {
      const result = await saveBrokerAction(broker?.id ?? null, values);
      if (!result.ok) {
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

  return <Dialog open={open} onOpenChange={(value) => { setOpen(value); setErrors({}); }}>
    <DialogTrigger asChild>{trigger ?? <Button size="sm"><Plus />{copy.add}</Button>}</DialogTrigger>
    <DialogContent>
      <DialogHeader><DialogTitle>{broker ? copy.edit : copy.add}</DialogTitle><DialogDescription>{copy.formDescription}</DialogDescription></DialogHeader>
      <DialogBody><form id={formId} onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
        {fields.map((key) => <Field key={key} label={labels[key]} htmlFor={`${formId}-${key}`} required={key === "name"} error={errors[key]}>
          {key === "notes" || key === "address"
            ? <Textarea id={`${formId}-${key}`} name={key} defaultValue={broker?.[key] ?? ""} maxLength={key === "notes" ? 4000 : 500} />
            : <Input id={`${formId}-${key}`} name={key} defaultValue={broker?.[key] ?? (key === "name" ? initialName : "")} type={key === "email" ? "email" : key === "phone" ? "tel" : "text"} maxLength={key === "phoneExtension" ? 20 : key === "email" ? 254 : key === "phone" ? 60 : key === "mcNumber" ? 40 : 120} required={key === "name"} aria-invalid={Boolean(errors[key])} />}
        </Field>)}
      </form></DialogBody>
      <DialogFooter><Button variant="outline" size="sm" onClick={() => setOpen(false)} disabled={pending}>{dictionary.common.cancel}</Button><Button form={formId} type="submit" size="sm" disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : null}{dictionary.common.saveChanges}</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
