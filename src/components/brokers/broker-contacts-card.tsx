"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Mail, Pencil, Phone, Plus, UserRound } from "lucide-react";
import { toast } from "sonner";
import { useLanguage } from "@/components/shell/language-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/shared/field";
import { ConfirmDelete } from "@/components/shared/confirm-delete";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { saveBrokerContactsAction } from "@/lib/actions/brokers";
import { contactPhoneHref, contactPhoneLabel } from "@/lib/brokers";
import { interpolate } from "@/lib/i18n/dictionaries";
import { localizedClientError } from "@/lib/i18n/errors";
import type { BrokerContact } from "@/lib/types";

/** The people at one broker: every agent the owner books with there. */
export function BrokerContactsCard({
  brokerId,
  brokerName,
  contacts,
  canManage,
}: {
  brokerId: string;
  brokerName: string;
  contacts: BrokerContact[];
  canManage: boolean;
}) {
  const { dictionary } = useLanguage();
  const copy = dictionary.brokers;
  const router = useRouter();

  async function save(next: BrokerContact[], message: string): Promise<boolean> {
    const result = await saveBrokerContactsAction(brokerId, next);
    if (!result.ok) {
      toast.error(localizedClientError(result.error));
      return false;
    }
    toast.success(message);
    router.refresh();
    return true;
  }

  return <Card>
    <CardHeader className="flex-row items-start justify-between gap-3">
      <div>
        <CardTitle>{copy.contacts}</CardTitle>
        <p className="mt-1 text-xs text-muted-foreground">{copy.contactsHint}</p>
      </div>
      {canManage ? <ContactDialog brokerName={brokerName} onSave={(contact) => save([...contacts, contact], copy.contactSaved)} /> : null}
    </CardHeader>
    <CardContent className="p-0">
      {contacts.length === 0 ? <p className="p-4 text-sm text-muted-foreground">{copy.noContacts}</p> : <ul className="divide-y divide-border">
        {contacts.map((contact) => <li key={contact.id} className="flex items-start gap-3 p-4">
          <UserRound className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
          <div className="min-w-0 flex-1 space-y-1">
            <p className="font-medium">{contact.name}</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
              {contact.phone ? <a className="inline-flex items-center gap-1.5 text-primary hover:underline" href={contactPhoneHref(contact)}><Phone className="size-3.5" aria-hidden />{contactPhoneLabel(contact)}</a> : null}
              {contact.email ? <a className="inline-flex items-center gap-1.5 break-all text-primary hover:underline" href={`mailto:${contact.email}`}><Mail className="size-3.5" aria-hidden />{contact.email}</a> : null}
            </div>
            {contact.notes ? <p className="whitespace-pre-wrap text-xs text-muted-foreground">{contact.notes}</p> : null}
          </div>
          {canManage ? <div className="flex shrink-0 items-center gap-1">
            <ContactDialog
              brokerName={brokerName}
              contact={contact}
              onSave={(edited) => save(contacts.map((row) => (row.id === contact.id ? edited : row)), copy.contactSaved)}
            />
            <ConfirmDelete
              label={contact.name}
              entity={copy.contactEntity}
              triggerLabel={copy.removeContact}
              onConfirm={async () => { await save(contacts.filter((row) => row.id !== contact.id), copy.contactRemoved); }}
            />
          </div> : null}
        </li>)}
      </ul>}
    </CardContent>
  </Card>;
}

function newContactId(): string {
  return `bc_${typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Date.now().toString(36)}`;
}

function ContactDialog({
  brokerName,
  contact,
  onSave,
}: {
  brokerName: string;
  contact?: BrokerContact;
  onSave: (contact: BrokerContact) => Promise<boolean>;
}) {
  const { dictionary } = useLanguage();
  const copy = dictionary.brokers;
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const [nameError, setNameError] = React.useState<string>();
  const formId = React.useId();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const text = (key: string) => String(form.get(key) ?? "").trim() || null;
    const name = text("name");
    if (!name) {
      setNameError(copy.contact);
      return;
    }
    const next: BrokerContact = {
      id: contact?.id ?? newContactId(),
      name,
      phone: text("phone"),
      phoneExtension: text("phoneExtension"),
      email: text("email"),
      notes: text("notes"),
    };
    startTransition(async () => {
      if (await onSave(next)) setOpen(false);
    });
  }

  return <Dialog open={open} onOpenChange={(value) => { setOpen(value); setNameError(undefined); }}>
    <DialogTrigger asChild>
      {contact
        ? <Button variant="ghost" size="icon-sm" aria-label={`${copy.editPerson}: ${contact.name}`}><Pencil /></Button>
        : <Button size="sm" variant="outline"><Plus />{copy.addPerson}</Button>}
    </DialogTrigger>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{contact ? copy.editPerson : copy.addPerson}</DialogTitle>
        <DialogDescription>{interpolate(copy.personDescription, { broker: brokerName })}</DialogDescription>
      </DialogHeader>
      <DialogBody>
        <form id={formId} onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
          <Field label={copy.contact} htmlFor={`${formId}-name`} required error={nameError} className="sm:col-span-2">
            <Input id={`${formId}-name`} name="name" defaultValue={contact?.name ?? ""} maxLength={120} required aria-invalid={Boolean(nameError)} autoFocus />
          </Field>
          <Field label={copy.phone} htmlFor={`${formId}-phone`}>
            <Input id={`${formId}-phone`} name="phone" type="tel" defaultValue={contact?.phone ?? ""} maxLength={60} />
          </Field>
          <Field label={copy.extension} htmlFor={`${formId}-ext`}>
            <Input id={`${formId}-ext`} name="phoneExtension" defaultValue={contact?.phoneExtension ?? ""} maxLength={20} inputMode="numeric" />
          </Field>
          <Field label={copy.email} htmlFor={`${formId}-email`} className="sm:col-span-2">
            <Input id={`${formId}-email`} name="email" type="email" defaultValue={contact?.email ?? ""} maxLength={254} />
          </Field>
          <Field label={copy.notes} htmlFor={`${formId}-notes`} className="sm:col-span-2">
            <Textarea id={`${formId}-notes`} name="notes" defaultValue={contact?.notes ?? ""} maxLength={2000} />
          </Field>
        </form>
      </DialogBody>
      <DialogFooter>
        <Button variant="outline" size="sm" onClick={() => setOpen(false)} disabled={pending}>{dictionary.common.cancel}</Button>
        <Button form={formId} type="submit" size="sm" disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : null}{dictionary.common.saveChanges}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
