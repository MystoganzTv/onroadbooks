"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/components/shell/language-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/shared/field";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { saveDispatcherAction } from "@/lib/actions/dispatchers";
import { localizedClientError } from "@/lib/i18n/errors";
import type { Dispatcher } from "@/lib/types";

export function DispatcherFormDialog({ dispatcher, initialName = "" }: { dispatcher?: Dispatcher; initialName?: string }) {
  const { dictionary } = useLanguage();
  const copy = dictionary.dispatchers;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return <Dialog open={open} onOpenChange={value => { setOpen(value); setError(null); }}>
    <DialogTrigger asChild><Button variant={dispatcher || initialName ? "outline" : "default"} size="sm">{dispatcher ? copy.edit : initialName ? copy.contactDetails : copy.add}</Button></DialogTrigger>
    <DialogContent>
      <DialogHeader><DialogTitle>{dispatcher ? copy.edit : copy.add}</DialogTitle><DialogDescription>{copy.formDescription}</DialogDescription></DialogHeader>
      <form onSubmit={event => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        startTransition(async () => {
          const result = await saveDispatcherAction(dispatcher?.id ?? null, { name: String(form.get("name") ?? ""), phone: String(form.get("phone") ?? "") || null, email: String(form.get("email") ?? "") || null, notes: String(form.get("notes") ?? "") || null });
          if (!result.ok) { setError(localizedClientError(result.error)); return; }
          setOpen(false);
          router.replace(`/dispatchers?name=${encodeURIComponent(String(form.get("name") ?? "").trim())}`);
          router.refresh();
        });
      }}>
        <DialogBody className="space-y-4">
          <Field label={copy.name} htmlFor="dispatcher-name" required><Input id="dispatcher-name" name="name" defaultValue={dispatcher?.name ?? initialName} required maxLength={120} /></Field>
          <Field label={copy.phone} htmlFor="dispatcher-phone"><Input id="dispatcher-phone" name="phone" type="tel" defaultValue={dispatcher?.phone ?? ""} maxLength={60} /></Field>
          <Field label={copy.email} htmlFor="dispatcher-email"><Input id="dispatcher-email" name="email" type="email" defaultValue={dispatcher?.email ?? ""} maxLength={254} /></Field>
          <Field label={copy.notes} htmlFor="dispatcher-notes"><Textarea id="dispatcher-notes" name="notes" defaultValue={dispatcher?.notes ?? ""} maxLength={2000} /></Field>
          {error ? <p role="alert" className="text-sm text-neg">{error}</p> : null}
        </DialogBody>
        <DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>{copy.cancel}</Button><Button type="submit" disabled={pending}>{pending ? copy.saving : copy.save}</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
