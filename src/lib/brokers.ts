import type { Broker, BrokerContact, Load } from "./types";

export function brokerNameKey(name: string): string {
  return name.trim().toLowerCase();
}

export function brokerNames(loads: Load[], brokers: Broker[] = []): string[] {
  const names = new Map<string, string>();
  for (const name of [...loads.map((load) => load.broker), ...brokers.map((broker) => broker.name)]) {
    if (name?.trim()) names.set(brokerNameKey(name), name.trim());
  }
  return [...names.values()].sort((a, b) => a.localeCompare(b));
}

export function brokerPhoneLabel(broker: Broker): string {
  return `${broker.phone ?? ""}${broker.phoneExtension ? ` ext. ${broker.phoneExtension}` : ""}`;
}

export function brokerPhoneHref(broker: Broker): string {
  return `tel:${broker.phone ?? ""}${broker.phoneExtension ? `;ext=${encodeURIComponent(broker.phoneExtension)}` : ""}`;
}

export function contactPhoneLabel(contact: Pick<BrokerContact, "phone" | "phoneExtension">): string {
  return `${contact.phone ?? ""}${contact.phoneExtension ? ` ext. ${contact.phoneExtension}` : ""}`;
}

export function contactPhoneHref(contact: Pick<BrokerContact, "phone" | "phoneExtension">): string {
  return `tel:${contact.phone ?? ""}${contact.phoneExtension ? `;ext=${encodeURIComponent(contact.phoneExtension)}` : ""}`;
}

type BrokerLike = Pick<Broker, "id" | "name" | "contactName" | "phone" | "phoneExtension" | "email" | "notes" | "mcNumber" | "address"> & {
  contacts?: BrokerContact[] | null;
};

type ContactSource = Pick<Broker, "name"> &
  Partial<Pick<Broker, "id" | "contactName" | "phone" | "phoneExtension" | "email">> & {
    contacts?: BrokerContact[] | null;
  };

/**
 * The people at a broker. Rows saved before contacts existed carried one
 * person in `contactName` / `phoneExtension` / `email`; that person is read as
 * the first contact so no store needs a special case (the SQL migration also
 * copies it across once).
 */
export function brokerContactsOf(broker: ContactSource): BrokerContact[] {
  const contacts = Array.isArray(broker.contacts) ? broker.contacts : [];
  if (contacts.length || !broker.contactName?.trim()) return contacts;
  return [{
    id: `bc_${broker.id ?? brokerNameKey(broker.name)}`,
    name: broker.contactName.trim(),
    phone: broker.phone ?? null,
    phoneExtension: broker.phoneExtension ?? null,
    email: broker.email ?? null,
    notes: null,
  }];
}

function mergeText(a: string | null, b: string | null): string | null {
  const parts = [a, b].map((value) => value?.trim()).filter((value): value is string => Boolean(value));
  const unique = parts.filter((value, index) => parts.findIndex((other) => other.toLowerCase() === value.toLowerCase()) === index);
  return unique.length ? unique.join("\n\n") : null;
}

/** Contacts by name, filling blanks from the second list; the first wins on conflicts. */
export function mergeContacts(first: BrokerContact[], second: BrokerContact[]): BrokerContact[] {
  const merged = first.map((contact) => ({ ...contact }));
  for (const contact of second) {
    const same = merged.find((row) => brokerNameKey(row.name) === brokerNameKey(contact.name));
    if (!same) {
      merged.push({ ...contact });
      continue;
    }
    same.phone ??= contact.phone;
    same.phoneExtension ??= contact.phoneExtension;
    same.email ??= contact.email;
    same.notes = mergeText(same.notes, contact.notes);
  }
  return merged;
}

export interface BrokerMerge {
  /** What the surviving broker becomes. */
  target: {
    contacts: BrokerContact[];
    phone: string | null;
    mcNumber: string | null;
    address: string | null;
    notes: string | null;
  };
  /** The contact to write on a moved load that has none of its own. */
  loadContact: string | null;
}

/**
 * Folding one broker profile into another -- typically a profile that was
 * really one agent ("Christopher Sanchez") into the company ("TQL").
 *
 * The source's people become the target's contacts. A source with no
 * contacts at all was itself a person, so it becomes one, carrying its
 * phone, extension and email. The target keeps its own details and only
 * fills blanks; notes from both are kept. Moved loads keep their own
 * contact, or get the source's person when it had exactly one.
 */
export function planBrokerMerge(source: BrokerLike, target: BrokerLike): BrokerMerge {
  const own = brokerContactsOf(source);
  const moved = own.length ? own : [{
    id: `bc_${source.id}`,
    name: source.name.trim(),
    phone: source.phone ?? null,
    phoneExtension: source.phoneExtension ?? null,
    email: source.email ?? null,
    notes: null,
  }];
  return {
    target: {
      contacts: mergeContacts(brokerContactsOf(target), moved),
      phone: target.phone ?? source.phone ?? null,
      mcNumber: target.mcNumber ?? source.mcNumber ?? null,
      address: target.address ?? source.address ?? null,
      notes: mergeText(target.notes, source.notes),
    },
    loadContact: moved.length === 1 ? moved[0].name : null,
  };
}

/**
 * Once a legacy contact has been copied into `contacts`, the fields it was
 * read from are cleared so the person is not read twice. Without a legacy
 * contact name, the email is the company's own and stays.
 */
export function clearedLegacyContact(broker: Pick<Broker, "contactName">): Partial<Pick<Broker, "contactName" | "phoneExtension" | "email">> {
  return broker.contactName?.trim()
    ? { contactName: null, phoneExtension: null, email: null }
    : { contactName: null };
}

/**
 * A name that only exists on loads ("Branden Elam" typed into the Broker
 * field) is a person at a broker, not a company. Moving it: the loads are
 * renamed to the broker and keep, or take, that person as their contact, and
 * the person joins the broker's contacts. There is no profile to remove.
 */
export function planNameIntoBroker(name: string, target: BrokerLike): BrokerMerge {
  const person: BrokerContact = {
    id: `bc_${brokerNameKey(name).replace(/[^a-z0-9]+/g, "-")}`,
    name: name.trim(),
    phone: null,
    phoneExtension: null,
    email: null,
    notes: null,
  };
  return {
    target: {
      contacts: mergeContacts(brokerContactsOf(target), [person]),
      phone: target.phone ?? null,
      mcNumber: target.mcNumber ?? null,
      address: target.address ?? null,
      notes: target.notes ?? null,
    },
    loadContact: person.name,
  };
}
