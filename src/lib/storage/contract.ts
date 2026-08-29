/**
 * The storage contract, in its own module so implementations can import it
 * without a cycle through the adapter selector in ./index.ts.
 */
export interface DocumentStorage {
  /** Persists bytes and returns the key needed to read them back. */
  put(key: string, data: Buffer, contentType: string): Promise<string>;
  get(key: string): Promise<Buffer | null>;
  remove(key: string): Promise<void>;
}
