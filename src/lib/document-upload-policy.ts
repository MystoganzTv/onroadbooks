import { z } from "zod";

import {
  DOCUMENT_TYPE_IDS,
  documentOwnerExists,
  isAcceptedType,
  MAX_DOCUMENT_BYTES,
} from "@/lib/documents";
import { canWrite } from "@/lib/plans";
import { roleCan, type Permission } from "@/lib/roles";
import type { Dataset, DocumentOwner, DocumentType, MemberRole } from "@/lib/types";

export const documentUploadMetadataSchema = z.object({
  type: z.enum(DOCUMENT_TYPE_IDS as [DocumentType, ...DocumentType[]]),
  label: z.string().trim().max(120).optional().nullable(),
  owner: z.enum(["LOAD", "EXPENSE", "TRUCK", "MAINTENANCE"]),
  entityId: z.string().trim().min(1).max(160),
  fileName: z.string().trim().min(1).max(255),
  contentType: z.string().trim().min(1).max(160),
  sizeBytes: z.number().int().positive().max(MAX_DOCUMENT_BYTES),
}).strict();

export type DocumentUploadMetadata = z.infer<typeof documentUploadMetadataSchema>;

export function documentPermission(owner: DocumentOwner): Permission {
  if (owner === "LOAD") return "manage_loads";
  if (owner === "EXPENSE") return "manage_expenses";
  if (owner === "MAINTENANCE") return "manage_maintenance";
  return "manage_fleet";
}

export function documentUploadRefusal(
  dataset: Pick<Dataset, "subscription" | "loads" | "expenses" | "maintenanceRecords" | "trucks">,
  role: MemberRole,
  input: DocumentUploadMetadata,
): { status: number; error: string } | null {
  if (!canWrite(dataset.subscription)) {
    return { status: 403, error: "This workspace is read-only until billing is active." };
  }
  if (!roleCan(role, documentPermission(input.owner))) {
    return { status: 403, error: "Your role does not allow documents on that record." };
  }
  if (!documentOwnerExists(dataset, input.owner, input.entityId)) {
    return { status: 404, error: "That record no longer exists." };
  }
  if (!isAcceptedType(input.contentType)) {
    return { status: 415, error: "Only images and PDFs can be attached." };
  }
  return null;
}
