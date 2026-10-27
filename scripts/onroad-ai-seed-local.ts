/**
 * Fill YOUR LOCAL dev server's OnRoad AI console with a few test drivers.
 *
 *   1. .env.local has ONROAD_AI_ENABLED=true, ONROAD_AI_STORE=memory and the
 *      four WHATSAPP_* test values (no real Meta account needed)
 *   2. restart `npm run dev`
 *   3. npm run onroad-ai:seed-local
 *   4. open http://localhost:3000/admin/onroad-ai
 *
 * It posts signed webhook messages to localhost only -- exactly what Meta
 * would send -- so the real webhook, router and calculator handle them. The
 * replies cannot be delivered (the WhatsApp token is a test value), so the
 * console will show those sends as failed; that is expected locally.
 * Everything lives in the dev server's memory and is gone on restart.
 */

import { createHmac } from "node:crypto";

import { config } from "dotenv";

// Next reads .env.local before .env; do the same.
config({ path: ".env.local" });
config();

const base = (process.env.ONROAD_AI_SEED_URL ?? "http://localhost:3000").replace(/\/$/, "");
const secret = process.env.WHATSAPP_APP_SECRET ?? "";
const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID ?? "";

const DRIVERS: [string, string, string[]][] = [
  ["15550001001", "Test Driver Miami", ["hi", "skip", "Chicago IL Miami FL 1400 miles $2800 120 DH", "broker offered $3100", "save"]],
  ["15550001002", "Chofer de Prueba", ["hola", "saltar", "Dallas TX Atlanta GA 780 millas $1650 45 DH", "guardar", "resumen"]],
  ["15550001003", "Test Driver VA", ["hi", "skip", "prefer destination VA", "find loads near Chicago", "1"]],
  ["15550001004", "New Driver", ["hello"]],
];

async function post(from: string, name: string, text: string, n: number) {
  const body = JSON.stringify({
    object: "whatsapp_business_account",
    entry: [{ changes: [{ field: "messages", value: {
      metadata: { phone_number_id: phoneNumberId },
      contacts: [{ wa_id: from, profile: { name } }],
      messages: [{ id: `wamid.localseed.${from}.${Date.now()}.${n}`, from, timestamp: String(Math.floor(Date.now() / 1000)), type: "text", text: { body: text } }],
    } }] }],
  });
  const signature = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
  const reply = await fetch(`${base}/api/whatsapp/webhook`, { method: "POST", headers: { "content-type": "application/json", "x-hub-signature-256": signature }, body });
  if (!reply.ok) throw new Error(`Webhook answered ${reply.status}. Is the dev server running with ONROAD_AI_ENABLED=true and the WHATSAPP_* values in .env.local?`);
}

async function main() {
  const host = new URL(base).hostname;
  if (host !== "localhost" && host !== "127.0.0.1") throw new Error("This script only talks to a local dev server.");
  if (process.env.ONROAD_AI_STORE !== "memory") throw new Error("Set ONROAD_AI_STORE=memory in .env.local first, so nothing touches a real database.");
  if (!secret || !phoneNumberId) throw new Error("WHATSAPP_APP_SECRET and WHATSAPP_PHONE_NUMBER_ID must be set in .env.local.");
  let n = 0;
  for (const [from, name, messages] of DRIVERS) {
    for (const text of messages) {
      await post(from, name, text, n++);
      // The worker answers after the response; give it a moment so order holds.
      await new Promise((resolve) => setTimeout(resolve, 1_200));
    }
    console.log(`✓ ${name}: ${messages.length} messages`);
  }
  console.log(`\nOpen ${base}/admin/onroad-ai`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
