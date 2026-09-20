import { createCipheriv, createDecipheriv, randomBytes, scrypt } from "node:crypto";
import { promisify } from "node:util";

const MAGIC = Buffer.from("ORBK1");
const SALT_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;
/** scrypt at these parameters costs ~100ms and 32MB -- cheap once a night,
 *  expensive a few billion times for anyone holding a stolen file. */
const SCRYPT = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: typeof SCRYPT,
) => Promise<Buffer>;

export async function encrypt(plaintext: Buffer, secret: string): Promise<Buffer> {
  const salt = randomBytes(SALT_BYTES);
  const iv = randomBytes(IV_BYTES);
  const key = await scryptAsync(secret, salt, 32, SCRYPT);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.concat([MAGIC, salt, iv, body, cipher.getAuthTag()]);
}

/** Throws if the file was truncated, corrupted or encrypted with another
 *  passphrase -- GCM authenticates, so a silent half-restore is impossible. */
export async function decrypt(blob: Buffer, secret: string): Promise<Buffer> {
  const header = MAGIC.length + SALT_BYTES + IV_BYTES;
  if (blob.length <= header + TAG_BYTES || !blob.subarray(0, MAGIC.length).equals(MAGIC)) {
    throw new Error("Not an OnRoad Books backup file.");
  }
  const salt = blob.subarray(MAGIC.length, MAGIC.length + SALT_BYTES);
  const iv = blob.subarray(MAGIC.length + SALT_BYTES, header);
  const body = blob.subarray(header, blob.length - TAG_BYTES);
  const key = await scryptAsync(secret, salt, 32, SCRYPT);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(blob.subarray(blob.length - TAG_BYTES));
  return Buffer.concat([decipher.update(body), decipher.final()]);
}

