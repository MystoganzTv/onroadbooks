"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Paperclip, Upload, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ACCEPT_ATTRIBUTE,
  documentTypeLabel,
  DOCUMENT_TYPES_FOR,
  formatBytes,
  isAcceptedType,
  MAX_DOCUMENT_BYTES,
} from "@/lib/documents";
import type { DocumentOwner, DocumentType } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface PendingUpload {
  file: File;
  type: DocumentType;
}

interface DocumentUploaderProps {
  owner: DocumentOwner;
  /**
   * The record to file against. Omit inside a create form -- the picker then
   * holds files in memory and `uploadPending` sends them once the record
   * exists (see `usePendingUploads`).
   */
  entityId?: string;
  /** Controlled pending list, used by create forms. */
  pending?: PendingUpload[];
  onPendingChange?: (pending: PendingUpload[]) => void;
  className?: string;
  compact?: boolean;
}

/**
 * File picker + drop zone for attachments.
 *
 * With an `entityId` it uploads immediately. Without one it stages files so a
 * create form can attach a receipt in the same motion, then flush them after
 * the record is saved.
 */
export function DocumentUploader({
  owner,
  entityId,
  pending,
  onPendingChange,
  className,
  compact,
}: DocumentUploaderProps) {
  const router = useRouter();
  const options = DOCUMENT_TYPES_FOR[owner];
  const [type, setType] = React.useState<DocumentType>(options[0]);
  const [dragging, setDragging] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const staged = React.useMemo(() => pending ?? [], [pending]);

  const accept = React.useCallback(
    (files: FileList | null) => {
      if (!files?.length) return;
      const chosen: PendingUpload[] = [];

      for (const file of Array.from(files)) {
        if (file.size > MAX_DOCUMENT_BYTES) {
          toast.error(`${file.name} is larger than ${Math.round(MAX_DOCUMENT_BYTES / 1024 / 1024)} MB.`);
          continue;
        }
        if (!isAcceptedType(file.type)) {
          toast.error(`${file.name} is not an image or PDF.`);
          continue;
        }
        chosen.push({ file, type });
      }
      if (chosen.length === 0) return;

      if (!entityId) {
        onPendingChange?.([...staged, ...chosen]);
        return;
      }

      setBusy(true);
      void Promise.all(chosen.map((item) => uploadDocument(owner, entityId, item)))
        .then((results) => {
          const failures = results.filter((r) => !r.ok);
          if (failures.length) toast.error(failures[0].error ?? "Upload failed.");
          const uploaded = results.length - failures.length;
          if (uploaded > 0) {
            toast.success(`${uploaded} ${uploaded === 1 ? "document" : "documents"} attached`);
            router.refresh();
          }
        })
        .finally(() => setBusy(false));
    },
    [entityId, onPendingChange, owner, router, staged, type],
  );

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center gap-2">
        <Select value={type} onValueChange={(value) => setType(value as DocumentType)}>
          <SelectTrigger className="w-[10.5rem]" aria-label="Document type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map((option) => (
              <SelectItem key={option} value={option}>
                {documentTypeLabel(option)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? <Loader2 className="animate-spin" /> : <Paperclip />}
          Attach file
        </Button>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          accept(e.dataTransfer.files);
        }}
        className={cn(
          "flex items-center justify-center gap-2 rounded-md border border-dashed px-3 text-2xs transition-colors",
          compact ? "py-3" : "py-5",
          dragging
            ? "border-primary bg-primary/5 text-foreground"
            : "border-border text-muted-foreground",
        )}
      >
        <Upload className="size-3.5" />
        Drop an image or PDF here, or use Attach file. Max{" "}
        {Math.round(MAX_DOCUMENT_BYTES / 1024 / 1024)} MB.
      </div>

      {/* Driven entirely by the Attach file button; sr-only keeps it in the
          tab order and announces an unnamed control, so it is hidden outright. */}
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT_ATTRIBUTE}
        multiple
        tabIndex={-1}
        aria-hidden
        className="sr-only"
        onChange={(e) => {
          accept(e.target.files);
          e.target.value = "";
        }}
      />

      {staged.length > 0 ? (
        <ul className="space-y-1">
          {staged.map((item, index) => (
            <li
              key={`${item.file.name}-${index}`}
              className="flex items-center gap-2 rounded border border-border bg-surface-sunken px-2 py-1 text-2xs"
            >
              <Paperclip className="size-3 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">{item.file.name}</span>
              <span className="shrink-0 text-muted-foreground tnum">
                {formatBytes(item.file.size)}
              </span>
              <span className="shrink-0 text-muted-foreground">
                {documentTypeLabel(item.type)}
              </span>
              <button
                type="button"
                aria-label={`Remove ${item.file.name}`}
                className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-neg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() =>
                  onPendingChange?.(staged.filter((_, i) => i !== index))
                }
              >
                <X className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

async function uploadDocument(
  owner: DocumentOwner,
  entityId: string,
  item: PendingUpload,
): Promise<{ ok: boolean; error?: string }> {
  const body = new FormData();
  body.set("file", item.file);
  body.set("type", item.type);
  body.set("owner", owner);
  body.set("entityId", entityId);
  body.set("label", item.file.name);

  try {
    const response = await fetch("/api/documents", { method: "POST", body });
    if (response.ok) return { ok: true };
    const data = (await response.json().catch(() => null)) as { error?: string } | null;
    return { ok: false, error: data?.error };
  } catch {
    return { ok: false, error: "Upload failed." };
  }
}

export interface UploadOutcome {
  uploaded: number;
  failed: number;
  error?: string;
}

/**
 * Flushes files staged in a create form once the record has an id.
 * Failures are reported, not swallowed: a "saved" toast on a load whose rate
 * confirmation silently did not attach is worse than no toast at all.
 */
export async function uploadPending(
  owner: DocumentOwner,
  entityId: string,
  pending: PendingUpload[],
): Promise<UploadOutcome> {
  if (pending.length === 0) return { uploaded: 0, failed: 0 };
  const results = await Promise.all(pending.map((item) => uploadDocument(owner, entityId, item)));
  const failures = results.filter((r) => !r.ok);
  return {
    uploaded: results.length - failures.length,
    failed: failures.length,
    error: failures[0]?.error,
  };
}
