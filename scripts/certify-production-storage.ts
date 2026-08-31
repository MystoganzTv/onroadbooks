import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";

import { PrismaClient } from "../src/generated/prisma";
import { SupabaseDocumentStorage } from "../src/lib/storage/supabase";

const baseUrl = (process.env.CERTIFICATION_APP_URL || "https://onroadbooks.com").replace(/\/$/, "");
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SECRET_KEY;
const publishableKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
const bucket = process.env.SUPABASE_STORAGE_BUCKET || "documents";

const prisma = new PrismaClient();
const createdBusinessIds: string[] = [];
const createdStorageKeys = new Set<string>();

function required(value: string | undefined, name: string): string {
  assert.ok(value, `${name} is required`);
  return value;
}

function sessionCookie(response: Response): string {
  const setCookie = response.headers.get("set-cookie");
  if (!setCookie?.startsWith("onroad_books_session=")) {
    throw new Error("setup did not return an application session");
  }
  return setCookie.split(";", 1)[0];
}

async function createAccount(label: string): Promise<{
  email: string;
  cookie: string;
  businessId: string;
  truckId: string;
}> {
  const email = `cert.storage.${label}.${randomUUID()}@example.com`;
  const response = await fetch(`${baseUrl}/api/auth/setup`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: baseUrl },
    body: JSON.stringify({
      businessName: `Storage Certification ${label}`,
      name: `Certification ${label}`,
      email,
      password: `Cert-${randomUUID()}-Aa1!`,
      plan: "OWNER",
    }),
    redirect: "manual",
  });
  assert.equal(response.status, 201, `account ${label} can be created (${await response.text()})`);
  const user = await prisma.user.findUniqueOrThrow({
    where: { email },
    select: { businessId: true },
  });
  assert.ok(user.businessId);
  createdBusinessIds.push(user.businessId);
  const truck = await prisma.truck.findFirstOrThrow({
    where: { businessId: user.businessId },
    select: { id: true },
  });
  return { email, cookie: sessionCookie(response), businessId: user.businessId, truckId: truck.id };
}

async function upload(
  cookie: string,
  truckId: string,
  fileName: string,
  type: string,
  bytes: Uint8Array,
) {
  const form = new FormData();
  form.set("owner", "TRUCK");
  form.set("entityId", truckId);
  form.set("type", type === "application/pdf" ? "INSURANCE" : "REGISTRATION");
  form.set("label", `Certification ${fileName}`);
  form.set("file", new File([Uint8Array.from(bytes).buffer], fileName, { type }));
  const response = await fetch(`${baseUrl}/api/documents`, {
    method: "POST",
    headers: { Cookie: cookie, Origin: baseUrl },
    body: form,
  });
  const payload = await response.json() as {
    error?: string;
    document?: { id: string; storageKey: string; sizeBytes: number; contentType: string };
  };
  assert.equal(response.status, 201, payload.error || `${fileName} upload failed`);
  assert.ok(payload.document);
  createdStorageKeys.add(payload.document.storageKey);
  return payload.document;
}

async function download(cookie: string, documentId: string): Promise<Response> {
  return fetch(`${baseUrl}/api/documents/${documentId}`, {
    headers: { Cookie: cookie },
    redirect: "follow",
  });
}

async function remove(cookie: string, documentId: string): Promise<Response> {
  return fetch(`${baseUrl}/api/documents/${documentId}`, {
    method: "DELETE",
    headers: { Cookie: cookie, Origin: baseUrl },
  });
}

async function main() {
  const url = required(supabaseUrl, "SUPABASE_URL");
  const adminKey = required(serviceKey, "SUPABASE_SECRET_KEY");
  const publicKey = required(publishableKey, "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  const storage = new SupabaseDocumentStorage(url, adminKey, bucket);
  const admin = createClient(url, adminKey, { auth: { persistSession: false } });
  const client = createClient(url, publicKey, { auth: { persistSession: false } });

  const { data: bucketInfo, error: bucketError } = await admin.storage.getBucket(bucket);
  assert.ifError(bucketError);
  assert.equal(bucketInfo.public, false, "documents bucket is private");

  const accountA = await createAccount("a");
  const accountB = await createAccount("b");
  assert.notEqual(accountA.businessId, accountB.businessId);
  assert.notEqual(accountA.truckId, accountB.truckId);

  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  );
  const pdf = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n");
  const imageDocument = await upload(accountA.cookie, accountA.truckId, "unit-a.png", "image/png", png);
  const pdfDocument = await upload(accountB.cookie, accountB.truckId, "unit-b.pdf", "application/pdf", pdf);

  const ownImage = await download(accountA.cookie, imageDocument.id);
  assert.equal(ownImage.status, 200);
  assert.deepEqual(Buffer.from(await ownImage.arrayBuffer()), png);
  const ownPdf = await download(accountB.cookie, pdfDocument.id);
  assert.equal(ownPdf.status, 200);
  assert.deepEqual(Buffer.from(await ownPdf.arrayBuffer()), pdf);

  assert.equal((await download(accountB.cookie, imageDocument.id)).status, 404);
  assert.equal((await download(accountA.cookie, pdfDocument.id)).status, 404);
  assert.equal((await remove(accountB.cookie, imageDocument.id)).status, 404);
  assert.equal((await remove(accountA.cookie, pdfDocument.id)).status, 404);

  for (const key of [imageDocument.storageKey, pdfDocument.storageKey]) {
    const { data, error } = await client.storage.from(bucket).download(key);
    assert.equal(data, null, "an anonymous client cannot download a private document");
    assert.ok(error, "private Storage access is rejected without a signed URL");
  }

  const directKey = `cert/direct/${randomUUID()}/signed-upload.pdf`;
  createdStorageKeys.add(directKey);
  const signedUpload = await storage.createSignedUpload(directKey);
  const { error: signedUploadError } = await client.storage
    .from(bucket)
    .uploadToSignedUrl(signedUpload.path, signedUpload.token, new Blob([Uint8Array.from(pdf).buffer], { type: "application/pdf" }), {
      contentType: "application/pdf",
    });
  assert.ifError(signedUploadError);
  assert.equal((await storage.info(directKey))?.sizeBytes, pdf.byteLength);
  const signedDownload = await fetch(await storage.createSignedDownloadUrl(directKey, "signed-upload.pdf"));
  assert.equal(signedDownload.status, 200);
  assert.deepEqual(Buffer.from(await signedDownload.arrayBuffer()), pdf);

  assert.equal((await remove(accountA.cookie, imageDocument.id)).status, 200);
  assert.equal((await remove(accountB.cookie, pdfDocument.id)).status, 200);
  createdStorageKeys.delete(imageDocument.storageKey);
  createdStorageKeys.delete(pdfDocument.storageKey);
  assert.equal(await storage.info(imageDocument.storageKey), null);
  assert.equal(await storage.info(pdfDocument.storageKey), null);

  await storage.remove(directKey);
  createdStorageKeys.delete(directKey);
  assert.equal(await storage.info(directKey), null);

  console.log("Production Storage certification: passed", {
    bucket,
    privateBucket: true,
    accounts: 2,
    trucks: 2,
    formats: ["image/png", "application/pdf"],
    crossAccountIsolation: true,
    signedUpload: true,
    signedDownload: true,
    deletion: true,
  });
}

main()
  .catch((error) => {
    console.error("Production Storage certification failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (supabaseUrl && serviceKey) {
      const storage = new SupabaseDocumentStorage(supabaseUrl, serviceKey, bucket);
      await Promise.allSettled([...createdStorageKeys].map((key) => storage.remove(key)));
    }
    if (createdBusinessIds.length > 0) {
      await prisma.user.deleteMany({ where: { businessId: { in: createdBusinessIds } } });
      await prisma.business.deleteMany({ where: { id: { in: createdBusinessIds } } });
    }
    await prisma.$disconnect();
  });
