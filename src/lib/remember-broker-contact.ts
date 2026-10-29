import { randomUUID } from "node:crypto";

import { withContactName } from "./broker-contacts";
import { brokerContactsOf, brokerNameKey } from "./brokers";
import type { Repository } from "./db/repository";
import type { Load } from "./types";

/**
 * After a load is saved: when its broker has a profile and the person it was
 * booked with is not one of that broker's contacts yet, add them -- name only.
 * Best effort: a contact that cannot be saved never fails the load.
 */
export async function rememberBrokerContact(
  repository: Repository,
  load: { broker?: Load["broker"]; brokerContact?: Load["brokerContact"] },
): Promise<void> {
  const broker = load.broker?.trim();
  const name = load.brokerContact?.trim();
  if (!broker || !name) return;
  try {
    const dataset = await repository.getDataset();
    const profile = dataset.brokers?.find((row) => row.nameKey === brokerNameKey(broker));
    if (!profile) return;
    const next = withContactName(brokerContactsOf(profile), `bc_${randomUUID()}`, name);
    if (next) await repository.saveBrokerContacts(profile.id, next);
  } catch (error) {
    console.warn("Could not remember the broker contact", error instanceof Error ? error.message : error);
  }
}
