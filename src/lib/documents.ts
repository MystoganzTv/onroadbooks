/**
 * Document taxonomy.
 *
 * Documents are stored once and pointed at whichever record they belong to,
 * so a rate confirmation, a fuel receipt and an insurance certificate all
 * share one upload/serve/delete path.
 */

import type { Dataset, DocumentOwner, DocumentType } from "./types";

export interface DocumentTypeDefinition {
  id: DocumentType;
  label: string;
  short: string;
}

export const DOCUMENT_TYPES: DocumentTypeDefinition[] = [
  { id: "RATE_CONFIRMATION", label: "Rate Confirmation", short: "Rate Con" },
  { id: "BOL", label: "Bill of Lading", short: "BOL" },
  { id: "POD", label: "Proof of Delivery", short: "POD" },
  { id: "INVOICE", label: "Invoice", short: "Invoice" },
  { id: "RECEIPT", label: "Receipt", short: "Receipt" },
  { id: "REGISTRATION", label: "Registration", short: "Registration" },
  { id: "INSURANCE", label: "Insurance", short: "Insurance" },
  { id: "TITLE", label: "Title", short: "Title" },
  { id: "INSPECTION", label: "Inspection", short: "Inspection" },
  { id: "OTHER", label: "Other", short: "Other" },
];

const BY_ID = new Map(DOCUMENT_TYPES.map((t) => [t.id, t]));

export const DOCUMENT_TYPE_IDS = DOCUMENT_TYPES.map((t) => t.id);

/** The document types offered for each kind of record. */
export const DOCUMENT_TYPES_FOR: Record<DocumentOwner, DocumentType[]> = {
  LOAD: ["RATE_CONFIRMATION", "BOL", "POD", "INVOICE", "OTHER"],
  EXPENSE: ["RECEIPT", "INVOICE", "OTHER"],
  TRUCK: ["REGISTRATION", "INSURANCE", "TITLE", "INSPECTION", "OTHER"],
  MAINTENANCE: ["RECEIPT", "INVOICE", "INSPECTION", "OTHER"],
};

export function documentTypeLabel(id: string): string {
  return BY_ID.get(id as DocumentType)?.label ?? "Document";
}

export function documentTypeShort(id: string): string {
  return BY_ID.get(id as DocumentType)?.short ?? "Doc";
}

/** Final stored-file limit; production uploads bypass the Vercel Function body. */
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

/** Large scans may enter the browser optimizer, but never reach our server. */
export const MAX_DOCUMENT_SOURCE_BYTES = 50 * 1024 * 1024;

/** Multipart fallback only; leaves room for boundaries under Vercel's 4.5 MB cap. */
export const MAX_FUNCTION_UPLOAD_BYTES = 4 * 1024 * 1024;

/**
 * Strict allowlist. Deliberately excludes SVG: an SVG is a script-bearing
 * document, and anything served back inline from our own origin could then
 * run against the user's session.
 */
export const ACCEPTED_DOCUMENT_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/heic",
  "image/heif",
  "image/gif",
  "application/pdf",
];

/**
 * Types that are safe to render in a browser tab. Everything else is sent as
 * a download, so a mislabelled file can never execute in our origin.
 */
export const INLINE_SAFE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "application/pdf",
];

export const ACCEPT_ATTRIBUTE = ACCEPTED_DOCUMENT_TYPES.join(",");

export function isAcceptedType(contentType: string): boolean {
  return ACCEPTED_DOCUMENT_TYPES.includes(contentType);
}

export function isInlineSafe(contentType: string): boolean {
  return INLINE_SAFE_TYPES.includes(contentType);
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function isImage(contentType: string): boolean {
  return contentType.startsWith("image/") && contentType !== "image/svg+xml";
}

type DocumentOwnershipDataset = Pick<
  Dataset,
  "loads" | "expenses" | "maintenanceRecords" | "trucks"
>;

/**
 * Confirms that the target belongs to this workspace. Truck ownership checks
 * every unit in the Fleet, not merely whichever unit is marked primary.
 */
export function documentOwnerExists(
  dataset: DocumentOwnershipDataset,
  owner: DocumentOwner,
  entityId: string,
): boolean {
  switch (owner) {
    case "LOAD":
      return dataset.loads.some((record) => record.id === entityId);
    case "EXPENSE":
      return dataset.expenses.some((record) => record.id === entityId);
    case "MAINTENANCE":
      return dataset.maintenanceRecords.some((record) => record.id === entityId);
    case "TRUCK":
      return dataset.trucks.some((record) => record.id === entityId);
  }
}
