/**
 * Talk to OnRoad AI in your terminal -- no Meta account, no database.
 *
 *   npm run onroad-ai:simulate
 *   npm run onroad-ai:simulate -- --as 15550001111      (pretend to be another driver)
 *   echo "hola" | npm run onroad-ai:simulate            (scripted, one message per line)
 *
 * It runs the REAL router, onboarding and calculation engine against an
 * in-memory store, and prints what the bot would send on WhatsApp. If
 * ANTHROPIC_API_KEY is set in your shell, free text that is not shorthand is
 * interpreted by the model too (that spends tokens); otherwise only the
 * deterministic paths run. The mock load board is on, labelled TEST DATA.
 *
 * Type "/photo path/to/screenshot.png" to send an image, "/quit" to leave.
 */

import { readFile } from "node:fs/promises";
import { createInterface } from "node:readline";

import { AnthropicInterpreter } from "../src/lib/onroad-ai/ai/anthropic";
import { DISABLED_INTERPRETER, DISABLED_TRANSCRIBER } from "../src/lib/onroad-ai/ai/provider";
import { MockLoadBoardProvider } from "../src/lib/onroad-ai/loadboard/mock";
import { DEFAULT_LIMITS, handleInbound, type BotDeps } from "../src/lib/onroad-ai/router";
import { MemoryAssistantStore } from "../src/lib/onroad-ai/store/memory";
import type { Button, WhatsAppClient } from "../src/lib/onroad-ai/whatsapp/client";
import type { InboundMessage } from "../src/lib/onroad-ai/whatsapp/payload";

const argIndex = process.argv.indexOf("--as");
const waId = argIndex > -1 ? process.argv[argIndex + 1] : "15550000000";
const media = new Map<string, { bytes: Buffer; mimeType: string }>();
let counter = 0;

const terminal: WhatsAppClient = {
  async sendText(_to, body) {
    console.log(`\n\x1b[32m🤖 OnRoad AI\x1b[0m\n${body}\n`);
    return { ok: true, messageId: `sim.out.${++counter}` };
  },
  async sendButtons(_to, body, buttons: Button[]) {
    console.log(`\n\x1b[32m🤖 OnRoad AI\x1b[0m\n${body}\n${buttons.map((button) => `[ ${button.title} ]`).join("  ")}  (type 1 / 2 / 3)\n`);
    return { ok: true, messageId: `sim.out.${++counter}` };
  },
  async sendTemplate(_to, name, language, params) {
    console.log(`\n\x1b[33m🤖 OnRoad AI [template ${name} / ${language}]\x1b[0m\n${params.join(" | ")}\n`);
    return { ok: true, messageId: `sim.out.${++counter}` };
  },
  async markRead() {},
  async downloadMedia(id, maxBytes) {
    const file = media.get(id);
    if (!file) return { ok: false, reason: "NOT_FOUND" };
    if (file.bytes.byteLength > maxBytes) return { ok: false, reason: "TOO_LARGE" };
    return { ok: true, ...file };
  },
};

const key = process.env.ANTHROPIC_API_KEY?.trim();
const deps: BotDeps = {
  store: new MemoryAssistantStore(),
  whatsapp: terminal,
  interpreter: key
    ? new AnthropicInterpreter({ apiKey: key, model: process.env.ONROAD_AI_MODEL || "claude-sonnet-5", inputCostPerMTok: 3, outputCostPerMTok: 15 })
    : DISABLED_INTERPRETER,
  transcriber: DISABLED_TRANSCRIBER,
  loadBoards: [new MockLoadBoardProvider({ enabled: true, production: false })],
  limits: { ...DEFAULT_LIMITS, burstPerMinute: 1_000 },
  timeZone: "America/New_York",
  now: () => new Date(),
};

async function send(line: string) {
  const text = line.trim();
  if (!text) return;
  const id = `sim.in.${++counter}`;
  let message: InboundMessage = {
    id,
    from: waId,
    phoneNumberId: "simulator",
    profileName: "Simulator",
    timestamp: Math.floor(Date.now() / 1000),
    kind: "text",
    text,
    media: null,
    replyId: null,
    rawType: "text",
  };
  const photo = text.match(/^\/(photo|pdf)\s+(.+)$/);
  if (photo) {
    const bytes = await readFile(photo[2]);
    const mimeType = photo[1] === "pdf" ? "application/pdf" : photo[2].toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
    media.set(id, { bytes, mimeType });
    message = { ...message, kind: photo[1] === "pdf" ? "document" : "image", text: null, media: { id, mimeType, filename: null, voice: false }, rawType: "image" };
  }
  await handleInbound(deps, message);
}

async function main() {
  const interactive = Boolean(process.stdin.isTTY);
  console.log(`OnRoad AI simulator — you are ${waId}. AI interpretation: ${key ? "ON (spends tokens)" : "off"}.`);
  console.log(`Type a message and press Enter. /quit to exit.\n`);
  // terminal: false on purpose. Raw-mode TTY input (readline's default) can
  // stall under a loader such as tsx on some Node versions; in cooked mode the
  // terminal itself echoes what you type and hands over whole lines.
  const rl = createInterface({ input: process.stdin, terminal: false });
  const prompt = () => {
    if (interactive) process.stdout.write("> ");
  };
  let queue = Promise.resolve();
  rl.on("line", (line) => {
    queue = queue.then(async () => {
      if (line.trim() === "/quit") {
        rl.close();
        return;
      }
      if (!interactive) console.log(`\x1b[36m👤 ${line}\x1b[0m`);
      try {
        await send(line);
      } catch (error) {
        console.error("Simulator error:", error instanceof Error ? error.message : error);
      }
      prompt();
    });
  });
  rl.on("close", () => {
    void queue.then(() => process.exit(0));
  });
  prompt();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
