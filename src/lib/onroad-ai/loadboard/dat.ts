/**
 * DAT ADAPTER -- intentionally DISABLED
 * =====================================
 *
 * DAT publishes APIs (https://www.dat.com/api-integration, portal at
 * https://developer.dat.com/), but access is granted per developer account
 * and the terms for showing DAT search results -- and broker contact
 * details -- to OUR users in a multi-user commercial product are set by the
 * agreement DAT gives us, not by anything public.
 *
 * So this adapter has no endpoints, request shapes or auth flow in it. Those
 * must be copied from DAT's own documentation once access is approved; any
 * guess written here would be a fabricated contract. Until then `status()`
 * reports why it is unavailable and every call throws.
 *
 * Turning it on takes all three:
 *   DAT_API_ENABLED=true
 *   DAT credentials issued to OnRoad AI (never a driver's own login)
 *   DAT_COMMERCIAL_USE_CONFIRMED=true -- set only after DAT confirms in
 *   writing that results and broker details may be shown to our users
 * plus an implementation of `searchLoads` against the documented API.
 * See docs/onroad-ai.md, "DAT readiness checklist".
 */

import { LoadBoardUnavailableError, type BoardLoad, type LoadBoardProvider, type LoadSearchQuery, type ProviderStatus } from "./provider";

export interface DatConfig {
  enabled: boolean;
  clientId: string | null;
  clientSecret: string | null;
  commercialUseConfirmed: boolean;
}

export function datConfigFromEnv(env: Record<string, string | undefined> = process.env): DatConfig {
  return {
    enabled: env.DAT_API_ENABLED === "true",
    clientId: env.DAT_CLIENT_ID?.trim() || null,
    clientSecret: env.DAT_CLIENT_SECRET?.trim() || null,
    commercialUseConfirmed: env.DAT_COMMERCIAL_USE_CONFIRMED === "true",
  };
}

export class DatLoadBoardProvider implements LoadBoardProvider {
  readonly id = "dat";
  readonly label = "DAT";
  readonly isMock = false;

  constructor(private readonly config: DatConfig) {}

  status(): ProviderStatus {
    if (!this.config.enabled || !this.config.clientId || !this.config.clientSecret) {
      return { available: false, reason: "NOT_CONFIGURED" };
    }
    if (!this.config.commercialUseConfirmed) return { available: false, reason: "NOT_AUTHORIZED" };
    // Credentials and permission alone are not enough: the request code must
    // be written from DAT's documentation. Nothing here pretends otherwise.
    return { available: false, reason: "NOT_IMPLEMENTED" };
  }

  async searchLoads(_query: LoadSearchQuery): Promise<BoardLoad[]> {
    const status = this.status();
    throw new LoadBoardUnavailableError(this.id, status.available ? "unknown" : status.reason);
  }

  async getLoadDetails(_providerLoadId: string): Promise<BoardLoad | null> {
    const status = this.status();
    throw new LoadBoardUnavailableError(this.id, status.available ? "unknown" : status.reason);
  }
}
