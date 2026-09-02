"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Paperclip, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { useLanguage } from "@/components/shell/language-provider";
import { interpolate } from "@/lib/i18n/dictionaries";

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
  MAX_DOCUMENT_SOURCE_BYTES,
} from "@/lib/documents";
import {
  optimizeDocumentFile,
  type DocumentOptimizationProgress,
} from "@/lib/document-optimization";
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
  const { dictionary, locale } = useLanguage();
  const copy = dictionary.documents;
  const router = useRouter();
  const options = DOCUMENT_TYPES_FOR[owner];
  const [type, setType] = React.useState<DocumentType>(options[0]);
  const [dragging, setDragging] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [progress, setProgress] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const staged = React.useMemo(() => pending ?? [], [pending]);

  const accept = React.useCallback(
    async (files: FileList | null) => {
      if (!files?.length) return;
      setBusy(true);
      const chosen: PendingUpload[] = [];

      for (const source of Array.from(files)) {
        if (source.size > MAX_DOCUMENT_SOURCE_BYTES) {
          toast.error(interpolate(copy.tooLarge, { name: source.name, size: Math.round(MAX_DOCUMENT_SOURCE_BYTES / 1024 / 1024) }));
          continue;
        }
        if (!isAcceptedType(source.type)) {
          toast.error(interpolate(copy.invalidType, { name: source.name }));
          continue;
        }

        setProgress(source.type === "application/pdf" ? copy.checkingPdf : copy.optimizingImage);
        const file = await optimizeDocumentFile(source, (status) => {
          setProgress(optimizationLabel(status, copy));
        });
        if (file.size > MAX_DOCUMENT_BYTES) {
          toast.error(
            interpolate(copy.stillTooLarge, { name: source.name, size: Math.round(MAX_DOCUMENT_BYTES / 1024 / 1024) }),
          );
          continue;
        }
        chosen.push({ file, type });
      }
      setProgress(null);
      if (chosen.length === 0) {
        setBusy(false);
        return;
      }

      if (!entityId) {
        onPendingChange?.([...staged, ...chosen]);
        setBusy(false);
        return;
      }

      setProgress(copy.uploading);
      await Promise.all(chosen.map((item) => uploadDocument(owner, entityId, item)))
        .then((results) => {
          const failures = results.filter((r) => !r.ok);
          if (failures.length) toast.error(failures[0].error ?? copy.uploadFailed);
          const uploaded = results.length - failures.length;
          if (uploaded > 0) {
            toast.success(interpolate(copy.attached, { count: uploaded, unit: uploaded === 1 ? copy.document : copy.documents }));
            router.refresh();
          }
        })
        .finally(() => {
          setBusy(false);
          setProgress(null);
        });
    },
    [copy, entityId, onPendingChange, owner, router, staged, type],
  );

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center gap-2">
        <Select value={type} onValueChange={(value) => setType(value as DocumentType)}>
          <SelectTrigger className="w-[10.5rem]" aria-label={copy.documentType}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map((option) => (
              <SelectItem key={option} value={option}>
                {documentTypeLabel(option, locale)}
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
          {progress ?? copy.attachFile}
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
          void accept(e.dataTransfer.files);
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
        {interpolate(copy.dropZone, { size: Math.round(MAX_DOCUMENT_BYTES / 1024 / 1024) })}
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
          void accept(e.target.files);
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
                {documentTypeLabel(item.type, locale)}
              </span>
              <button
                type="button"
                aria-label={interpolate(copy.remove, { name: item.file.name })}
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
  const metadata = {
    type: item.type,
    owner,
    entityId,
    label: item.file.name,
    fileName: item.file.name,
    contentType: item.file.type,
    sizeBytes: item.file.size,
  };

  try {
    const prepared = await fetch("/api/documents/upload/prepare", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(metadata),
    });
    const plan = (await prepared.json().catch(() => null)) as
      | {
          strategy: "direct";
          upload: { bucket: string; path: string; token: string };
          ticket: string;
        }
      | { strategy: "multipart" }
      | { error?: string }
      | null;
    if (!prepared.ok) return { ok: false, error: plan && "error" in plan ? plan.error : undefined };

    if (plan && "strategy" in plan && plan.strategy === "direct") {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const key =
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
        ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (!url || !key) return { ok: false, error: "Secure document storage is not configured." };

      const { createClient } = await import("@supabase/supabase-js");
      const supabase = createClient(url, key, {
        auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
      });
      const { error } = await supabase.storage
        .from(plan.upload.bucket)
        .uploadToSignedUrl(plan.upload.path, plan.upload.token, item.file, {
          contentType: item.file.type,
          cacheControl: "3600",
          upsert: false,
        });
      if (error) return { ok: false, error: "The document could not reach secure storage." };

      const completed = await fetch("/api/documents/upload/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticket: plan.ticket }),
      });
      if (completed.ok) return { ok: true };
      const result = (await completed.json().catch(() => null)) as { error?: string } | null;
      return { ok: false, error: result?.error ?? "The document could not be attached." };
    }
  } catch {
    return { ok: false, error: "Upload failed." };
  }

  // Local development keeps its filesystem adapter and uses the small
  // multipart route; production never sends document bytes through Vercel.
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

function optimizationLabel(progress: DocumentOptimizationProgress, copy: ReturnType<typeof useLanguage>["dictionary"]["documents"]): string {
  if (progress.stage === "page") {
    return interpolate(copy.optimizingPdf, { page: progress.page ?? 0, pages: progress.pages ?? 0 });
  }
  if (progress.stage === "saving") return copy.finishingPdf;
  if (progress.stage === "native-pdf") return copy.keepingPdf;
  return copy.checkingPdf;
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
