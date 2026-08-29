import "server-only";

import type { DocumentStorage } from "./contract";

/**
 * Supabase Storage adapter.
 *
 * Talks to the Storage REST API with plain fetch rather than the JS client,
 * so switching to Supabase adds no dependency. Activated by setting
 * DOCUMENT_STORAGE=supabase plus the three variables below.
 *
 * NOTE: written against the documented API but not exercised against a live
 * project in this repo -- run through one upload/download/delete cycle before
 * relying on it in production.
 */
export class SupabaseDocumentStorage implements DocumentStorage {
  constructor(
    private readonly url: string,
    private readonly serviceKey: string,
    private readonly bucket: string,
  ) {}

  private endpoint(key: string): string {
    return `${this.url.replace(/\/$/, "")}/storage/v1/object/${this.bucket}/${encodeURI(key)}`;
  }

  private get headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.serviceKey}`,
      apikey: this.serviceKey,
    };
  }

  async put(key: string, data: Buffer, contentType: string): Promise<string> {
    const response = await fetch(this.endpoint(key), {
      method: "POST",
      headers: {
        ...this.headers,
        "Content-Type": contentType || "application/octet-stream",
        // Overwrite rather than fail: keys are generated per upload, so a
        // collision means a retry of the same file.
        "x-upsert": "true",
      },
      body: new Uint8Array(data),
    });

    if (!response.ok) {
      throw new Error(`Supabase Storage upload failed (${response.status}): ${await response.text()}`);
    }
    return key;
  }

  async get(key: string): Promise<Buffer | null> {
    const response = await fetch(this.endpoint(key), { headers: this.headers });
    if (response.status === 404) return null;
    if (!response.ok) {
      throw new Error(`Supabase Storage download failed (${response.status})`);
    }
    return Buffer.from(await response.arrayBuffer());
  }

  async remove(key: string): Promise<void> {
    const response = await fetch(this.endpoint(key), { method: "DELETE", headers: this.headers });
    // 404 is success for our purposes: the row is what matters.
    if (!response.ok && response.status !== 404) {
      throw new Error(`Supabase Storage delete failed (${response.status})`);
    }
  }
}
