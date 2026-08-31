import "server-only";

import { createClient } from "@supabase/supabase-js";

import type { DocumentStorage } from "./contract";

/**
 * Supabase Storage adapter.
 *
 * Uses the Storage REST API for the server fallback and the official client for
 * short-lived signed upload/download URLs. Activated with
 * DOCUMENT_STORAGE=supabase plus the three variables below.
 */
export class SupabaseDocumentStorage implements DocumentStorage {
  constructor(
    private readonly url: string,
    private readonly serviceKey: string,
    private readonly bucket: string,
  ) {}

  private storage() {
    return createClient(this.url, this.serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    }).storage.from(this.bucket);
  }

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

  async createSignedUpload(key: string): Promise<{ bucket: string; path: string; token: string }> {
    const { data, error } = await this.storage().createSignedUploadUrl(key, { upsert: false });
    if (error || !data?.token) {
      throw new Error(`Could not authorize the document upload: ${error?.message ?? "missing token"}`);
    }
    return { bucket: this.bucket, path: data.path, token: data.token };
  }

  async info(key: string): Promise<{ sizeBytes: number; contentType: string | null } | null> {
    const { data, error } = await this.storage().info(key);
    if (error) {
      if (error.status === 404 || error.statusCode === "404") return null;
      throw new Error(`Could not verify the stored document: ${error.message}`);
    }
    return {
      sizeBytes: Number(data.size ?? data.metadata?.size ?? 0),
      contentType: data.contentType ?? data.metadata?.mimetype ?? null,
    };
  }

  async createSignedDownloadUrl(key: string, downloadName?: string): Promise<string> {
    const { data, error } = await this.storage().createSignedUrl(
      key,
      60,
      downloadName ? { download: downloadName } : undefined,
    );
    if (error || !data?.signedUrl) {
      throw new Error(`Could not authorize the document download: ${error?.message ?? "missing URL"}`);
    }
    return data.signedUrl;
  }
}
