/**
 * The storage contract, in its own module so implementations can import it
 * without a cycle through the adapter selector in ./index.ts.
 */
export interface DocumentStorage {
  /** Read-only dependency probe for operational readiness checks. */
  healthcheck?(): Promise<void>;
  /** Persists bytes and returns the key needed to read them back. */
  put(key: string, data: Buffer, contentType: string): Promise<string>;
  get(key: string): Promise<Buffer | null>;
  remove(key: string): Promise<void>;
  /** Present for object stores that support browser-to-storage uploads. */
  createSignedUpload?(key: string): Promise<{
    bucket: string;
    path: string;
    token: string;
  }>;
  /** Confirms that a direct upload actually landed before metadata is filed. */
  info?(key: string): Promise<{ sizeBytes: number; contentType: string | null } | null>;
  /** Avoids Vercel's response-body ceiling when serving a stored document. */
  createSignedDownloadUrl?(key: string, downloadName?: string): Promise<string>;
}
