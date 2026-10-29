import { brokerContactsOf, brokerNameKey } from "./brokers";
import type { BrokerContact, Load } from "./types";

/**
 * The people the owner has booked with at each broker, keyed by the broker's
 * name key: every contact already written on a load, plus the contact saved
 * under the broker's profile. Feeds the load form's suggestions, so choosing
 * TQL offers the agents already worked with there.
 */
export function brokerContactNames(
  loads: Pick<Load, "broker" | "brokerContact">[],
  brokers: Parameters<typeof brokerContactsOf>[0][] = [],
): Record<string, string[]> {
  const byBroker = new Map<string, Map<string, string>>();
  const add = (broker: string | null | undefined, contact: string | null | undefined) => {
    if (!broker?.trim() || !contact?.trim()) return;
    const key = brokerNameKey(broker);
    const contacts = byBroker.get(key) ?? new Map<string, string>();
    const contactKey = contact.trim().toLowerCase();
    if (!contacts.has(contactKey)) contacts.set(contactKey, contact.trim());
    byBroker.set(key, contacts);
  };
  for (const load of loads) add(load.broker, load.brokerContact);
  for (const broker of brokers) {
    for (const contact of brokerContactsOf(broker)) add(broker.name, contact.name);
  }
  return Object.fromEntries(
    [...byBroker].map(([key, contacts]) => [key, [...contacts.values()].sort((a, b) => a.localeCompare(b))]),
  );
}

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** The people written on this broker's loads who are not among its saved contacts. */
export function unsavedContactNames(
  contacts: Pick<BrokerContact, "name">[],
  loads: Pick<Load, "brokerContact">[],
): string[] {
  const names = new Map<string, string>();
  for (const load of loads) {
    const name = load.brokerContact?.trim();
    if (!name || contacts.some((contact) => sameName(contact.name, name))) continue;
    if (!names.has(name.toLowerCase())) names.set(name.toLowerCase(), name);
  }
  return [...names.values()].sort((a, b) => a.localeCompare(b));
}

/** A new contact with only a name, the way a load records one. */
export function contactFromName(id: string, name: string): BrokerContact {
  return { id, name: name.trim(), phone: null, phoneExtension: null, email: null, notes: null };
}

/** The contacts with `name` added, or null when it is already there. */
export function withContactName(contacts: BrokerContact[], id: string, name: string): BrokerContact[] | null {
  if (!name.trim() || contacts.some((contact) => sameName(contact.name, name))) return null;
  return [...contacts, contactFromName(id, name)];
}
