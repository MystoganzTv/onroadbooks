/**
 * Voice notes -> text, through OpenAI's transcription endpoint.
 *
 * WhatsApp voice notes arrive as OGG/Opus, which the endpoint accepts as is.
 * The transcript is shown back to the driver ("I heard: ...") before the
 * numbers, because a misheard "fifteen hundred" for "fifty hundred" is the
 * one error the driver can catch and we cannot.
 *
 * Audio is sent once and not stored, here or by us.
 */

import type { Transcriber, TranscribeResult } from "./provider";

const API_URL = "https://api.openai.com/v1/audio/transcriptions";
const TIMEOUT_MS = 45_000;
/** The endpoint's own ceiling is 25 MB; a voice note is far below it. */
export const MAX_AUDIO_BYTES = 24 * 1024 * 1024;

export interface OpenAiTranscriberConfig {
  apiKey: string;
  model: string;
  /** Price per minute of audio, for the cost estimate. */
  costPerMinute: number;
  fetchImpl?: typeof fetch;
}

function extensionFor(mimeType: string): string {
  if (mimeType.includes("ogg")) return "ogg";
  if (mimeType.includes("mpeg") || mimeType.includes("mp3")) return "mp3";
  if (mimeType.includes("mp4") || mimeType.includes("m4a") || mimeType.includes("aac")) return "m4a";
  if (mimeType.includes("amr")) return "amr";
  if (mimeType.includes("wav")) return "wav";
  return "ogg";
}

export class OpenAiTranscriber implements Transcriber {
  readonly configured = true;
  constructor(private readonly config: OpenAiTranscriberConfig) {}

  async transcribe(audio: Buffer, mimeType: string, language: "en" | "es" | null): Promise<TranscribeResult> {
    if (audio.byteLength > MAX_AUDIO_BYTES) return { ok: false, reason: "TOO_LARGE" };
    const form = new FormData();
    const type = mimeType.split(";")[0].trim() || "audio/ogg";
    form.append("file", new Blob([new Uint8Array(audio)], { type }), `voice.${extensionFor(type)}`);
    form.append("model", this.config.model);
    form.append("response_format", "json");
    if (language) form.append("language", language);
    // Vocabulary hint, not instructions.
    form.append("prompt", "Trucking load: city, state, loaded miles, deadhead (DH), rate in dollars, broker.");

    let payload: { text?: unknown; usage?: { seconds?: number; input_tokens?: number; output_tokens?: number } };
    try {
      const reply = await (this.config.fetchImpl ?? fetch)(API_URL, {
        method: "POST",
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { authorization: `Bearer ${this.config.apiKey}` },
        body: form,
      });
      if (!reply.ok) {
        console.error("[onroad-ai] transcription failed", reply.status);
        return { ok: false, reason: "PROVIDER_ERROR" };
      }
      payload = (await reply.json()) as typeof payload;
    } catch (error) {
      console.error("[onroad-ai] transcription errored", error instanceof Error ? error.name : "unknown");
      return { ok: false, reason: "PROVIDER_ERROR" };
    }

    const text = typeof payload.text === "string" ? payload.text.replace(/\s+/g, " ").trim().slice(0, 2_000) : "";
    // Duration is not always reported; size of Opus at ~16 kbps is a fair estimate.
    const seconds = Number(payload.usage?.seconds ?? 0) || Math.max(1, Math.round(audio.byteLength / 2_000));
    const usage = {
      provider: "openai",
      model: this.config.model,
      inputTokens: Number(payload.usage?.input_tokens ?? 0) || 0,
      outputTokens: Number(payload.usage?.output_tokens ?? 0) || 0,
      audioSeconds: seconds,
      estimatedCostUsd: (seconds / 60) * this.config.costPerMinute,
    };
    if (!text) return { ok: false, reason: "EMPTY", usage };
    return { ok: true, text, usage };
  }
}
