import { brokerContactsOf, brokerNameKey } from "./brokers";
import type { Load } from "./types";

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
