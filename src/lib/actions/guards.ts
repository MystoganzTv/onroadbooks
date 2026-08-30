import "server-only";

import { requireWritableSession } from "@/lib/auth";
import { getRepository } from "@/lib/db";
import type { Repository } from "@/lib/db/repository";
import { capabilityRefusal, planAllows, type PlanCapability } from "@/lib/plans";

/**
 * The plan gate, for actions.
 *
 * A capability is checked HERE, on the server, against the subscription the
 * session's business actually holds -- never by hiding a button, which is the
 * same rule the truck limit follows. It throws rather than returning a result
 * so every action gets the refusal through the `catch` it already has, with
 * the message written for the owner.
 *
 * Returns the repository, so the call replaces the one the action was making
 * anyway and the gate cannot be forgotten on the way to the write.
 */
export async function repositoryWith(capability: PlanCapability): Promise<Repository> {
  const repository = getRepository((await requireWritableSession()).businessId);
  const { subscription } = await repository.getDataset();
  if (!planAllows(subscription, capability)) throw new Error(capabilityRefusal(capability));
  return repository;
}
