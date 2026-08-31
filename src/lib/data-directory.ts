import "server-only";

import path from "node:path";

/**
 * One root for every file-backed runtime artifact.
 *
 * Production and ordinary local development keep using `data/`. Automated
 * browser tests point this at an isolated scratch directory so they can create
 * accounts, receipts and sessions without touching a developer's real ledger.
 */
export function dataDirectory(): string {
  const configured = process.env.ONROAD_DATA_DIR?.trim();
  return configured ? path.resolve(configured) : path.join(process.cwd(), "data");
}
