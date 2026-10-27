/**
 * AI PROVIDER SEAM
 * ================
 *
 * Two jobs, two interfaces, so either can be swapped without touching the
 * router:
 *
 *   MessageInterpreter  text / photo / PDF  ->  Interpretation (structured)
 *   Transcriber         voice note          ->  text
 *
 * The default interpreter is Anthropic (the key OnRoad Books already uses
 * for rate-confirmation scanning); the default transcriber is OpenAI's
 * speech-to-text, because the Messages API does not take audio. Either one
 * switches itself off when its key is missing and the bot says so plainly.
 */

import type { FactSource, LoadFacts } from "../load-facts";
import type { Interpretation } from "./schema";

export interface AiUsage {
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  /** Seconds of audio, for transcription. */
  audioSeconds?: number;
  /** Estimated from the per-token prices in env; an estimate, labelled as such. */
  estimatedCostUsd: number;
}

export type InterpretInput =
  | { kind: "text"; text: string }
  | { kind: "media"; source: Extract<FactSource, "IMAGE" | "PDF">; bytes: Buffer; mimeType: string; caption: string | null };

export interface InterpretContext {
  /**
   * The load currently being discussed, so "it's 120 empty to pickup"
   * can land on the right load. The driver's own data only.
   */
  currentLoad: LoadFacts | null;
  /** Today's date in the driver's time zone, so "tomorrow" has a year. */
  today: string;
}

export type InterpretResult =
  | { ok: true; interpretation: Interpretation; usage: AiUsage }
  | { ok: false; reason: "NOT_CONFIGURED" | "UNSUPPORTED_MEDIA" | "TOO_LARGE" | "PROVIDER_ERROR" | "UNREADABLE"; usage?: AiUsage };

export interface MessageInterpreter {
  readonly configured: boolean;
  interpret(input: InterpretInput, context: InterpretContext): Promise<InterpretResult>;
}

export type TranscribeResult =
  | { ok: true; text: string; usage: AiUsage }
  | { ok: false; reason: "NOT_CONFIGURED" | "TOO_LARGE" | "PROVIDER_ERROR" | "EMPTY"; usage?: AiUsage };

export interface Transcriber {
  readonly configured: boolean;
  transcribe(audio: Buffer, mimeType: string, language: "en" | "es" | null): Promise<TranscribeResult>;
}

/** Used when no provider is configured: every call says so, nothing is sent anywhere. */
export const DISABLED_INTERPRETER: MessageInterpreter = {
  configured: false,
  async interpret() {
    return { ok: false, reason: "NOT_CONFIGURED" };
  },
};

export const DISABLED_TRANSCRIBER: Transcriber = {
  configured: false,
  async transcribe() {
    return { ok: false, reason: "NOT_CONFIGURED" };
  },
};

export function tokenCost(inputTokens: number, outputTokens: number, inputPerMTok: number, outputPerMTok: number): number {
  return (inputTokens / 1_000_000) * inputPerMTok + (outputTokens / 1_000_000) * outputPerMTok;
}
