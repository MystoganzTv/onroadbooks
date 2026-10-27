import "server-only";

/**
 * Wiring from environment variables. Every secret is read here, on the
 * server, and handed to the module that needs it; none is ever logged or
 * placed in a reply. See `.env.example` (OnRoad AI section) and
 * docs/onroad-ai.md for what each one does.
 */

import { getNeonDatabase } from "@/db";

import { AnthropicInterpreter } from "./ai/anthropic";
import { OpenAiTranscriber } from "./ai/openai-transcriber";
import { DISABLED_INTERPRETER, DISABLED_TRANSCRIBER } from "./ai/provider";
import { DatLoadBoardProvider, datConfigFromEnv } from "./loadboard/dat";
import { MockLoadBoardProvider } from "./loadboard/mock";
import { planConfigFromEnv } from "./plans";
import { DEFAULT_LIMITS, type AccessPolicy, type BotDeps, type Limits } from "./router";
import { onroadAiPriceId, stripeBillingPort } from "./stripe-billing";
import { DrizzleAssistantStore } from "./store/drizzle";
import { MemoryAssistantStore } from "./store/memory";
import type { AssistantStore } from "./store/types";
import { CloudApiClient, type WhatsAppClient } from "./whatsapp/client";

type Env = Record<string, string | undefined>;

const DEFAULT_GRAPH_VERSION = "v24.0";
/** Same default the rate-confirmation scanner uses; override with ONROAD_AI_MODEL. */
const DEFAULT_MODEL = "claude-sonnet-5";
const DEFAULT_TRANSCRIBE_MODEL = "gpt-4o-mini-transcribe";

function numberEnv(env: Env, key: string, fallback: number): number {
  const value = Number(env[key]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

export function isProduction(env: Env = process.env): boolean {
  return env.VERCEL_ENV === "production";
}

export interface WhatsAppSettings {
  accessToken: string;
  phoneNumberId: string;
  appSecret: string;
  verifyToken: string;
  graphVersion: string;
}

/** Null unless the assistant is switched on AND fully configured. */
export function whatsappSettings(env: Env = process.env): WhatsAppSettings | null {
  if (env.ONROAD_AI_ENABLED !== "true") return null;
  const settings = {
    accessToken: env.WHATSAPP_ACCESS_TOKEN?.trim() ?? "",
    phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID?.trim() ?? "",
    appSecret: env.WHATSAPP_APP_SECRET?.trim() ?? "",
    verifyToken: env.WHATSAPP_VERIFY_TOKEN?.trim() ?? "",
    graphVersion: env.WHATSAPP_GRAPH_VERSION?.trim() || DEFAULT_GRAPH_VERSION,
  };
  // A verify token short enough to guess makes the GET handshake meaningless.
  if (!settings.accessToken || !settings.phoneNumberId || !settings.appSecret || settings.verifyToken.length < 16) return null;
  return settings;
}

export function limitsFromEnv(env: Env = process.env): Limits {
  return {
    burstPerMinute: numberEnv(env, "ONROAD_AI_BURST_PER_MINUTE", DEFAULT_LIMITS.burstPerMinute),
    messagesPerDay: numberEnv(env, "ONROAD_AI_MESSAGES_PER_DAY", DEFAULT_LIMITS.messagesPerDay),
    aiCallsPerDay: numberEnv(env, "ONROAD_AI_AI_CALLS_PER_DAY", DEFAULT_LIMITS.aiCallsPerDay),
    transcriptionsPerDay: numberEnv(env, "ONROAD_AI_TRANSCRIPTIONS_PER_DAY", DEFAULT_LIMITS.transcriptionsPerDay),
    maxMediaBytes: DEFAULT_LIMITS.maxMediaBytes,
    whatsappCostPerMessageUsd: numberEnv(env, "ONROAD_AI_WHATSAPP_COST_PER_MESSAGE", DEFAULT_LIMITS.whatsappCostPerMessageUsd),
  };
}

const globalStore = globalThis as typeof globalThis & { onroadAiMemoryStore?: MemoryAssistantStore };

export function storeFromEnv(env: Env = process.env): AssistantStore {
  if (env.DATA_SOURCE === "neon") return new DrizzleAssistantStore(getNeonDatabase());
  // Local development only: a memory store forgets everything on restart.
  if (env.ONROAD_AI_STORE === "memory" && !isProduction(env)) {
    globalStore.onroadAiMemoryStore ??= new MemoryAssistantStore();
    return globalStore.onroadAiMemoryStore;
  }
  throw new Error("OnRoad AI needs DATA_SOURCE=neon (or ONROAD_AI_STORE=memory outside production).");
}

export function createBotDeps(settings: WhatsAppSettings, env: Env = process.env): BotDeps {
  return buildDeps(
    new CloudApiClient({
      accessToken: settings.accessToken,
      phoneNumberId: settings.phoneNumberId,
      graphVersion: settings.graphVersion,
    }),
    env,
  );
}

/** Same bot, any channel: WhatsApp's Cloud API or the in-app web chat. */
export function buildDeps(whatsapp: WhatsAppClient, env: Env = process.env): BotDeps {
  const anthropicKey = env.ANTHROPIC_API_KEY?.trim();
  const openAiKey = env.OPENAI_API_KEY?.trim();
  return {
    store: storeFromEnv(env),
    whatsapp,
    interpreter: anthropicKey
      ? new AnthropicInterpreter({
          apiKey: anthropicKey,
          model: env.ONROAD_AI_MODEL?.trim() || env.RATE_CON_MODEL?.trim() || DEFAULT_MODEL,
          inputCostPerMTok: numberEnv(env, "ONROAD_AI_INPUT_USD_PER_MTOK", 3),
          outputCostPerMTok: numberEnv(env, "ONROAD_AI_OUTPUT_USD_PER_MTOK", 15),
        })
      : DISABLED_INTERPRETER,
    transcriber: openAiKey
      ? new OpenAiTranscriber({
          apiKey: openAiKey,
          model: env.ONROAD_AI_TRANSCRIBE_MODEL?.trim() || DEFAULT_TRANSCRIBE_MODEL,
          costPerMinute: numberEnv(env, "ONROAD_AI_TRANSCRIBE_USD_PER_MINUTE", 0.003),
        })
      : DISABLED_TRANSCRIBER,
    loadBoards: [
      new DatLoadBoardProvider(datConfigFromEnv(env)),
      new MockLoadBoardProvider({ enabled: env.ONROAD_AI_MOCK_LOADBOARD === "1", production: isProduction(env) }),
    ],
    limits: limitsFromEnv(env),
    plans: planConfigFromEnv(env),
    billing: env.STRIPE_SECRET_KEY?.trim() && onroadAiPriceId() ? stripeBillingPort : null,
    access: accessFromEnv(env),
    timeZone: env.ONROAD_AI_TIME_ZONE?.trim() || "America/New_York",
    now: () => new Date(),
  };
}

export function retentionDays(env: Env = process.env): number {
  return Math.max(1, numberEnv(env, "ONROAD_AI_RETENTION_DAYS", 30));
}

/** Bearer check for the operations API. Off (404) without a long token. */
export function adminToken(env: Env = process.env): string | null {
  const token = env.ONROAD_AI_ADMIN_TOKEN?.trim() ?? "";
  return token.length >= 32 ? token : null;
}

export function accessFromEnv(env: Env = process.env): AccessPolicy {
  const codes = (env.ONROAD_AI_ALLOWED_COUNTRY_CODES ?? "")
    .split(/[\s,]+/)
    .map((code) => code.replace(/\D/g, ""))
    .filter(Boolean);
  return {
    allowedCountryCodes: codes.length ? codes : null,
    newUsersPerHour: numberEnv(env, "ONROAD_AI_NEW_USERS_PER_HOUR", 30),
  };
}

export function monitoringFromEnv(env: Env = process.env) {
  return {
    dailyBudgetUsd: numberEnv(env, "ONROAD_AI_DAILY_BUDGET_USD", 0),
    fixedMonthlyCostUsd: numberEnv(env, "ONROAD_AI_FIXED_MONTHLY_COST_USD", 0),
  };
}
