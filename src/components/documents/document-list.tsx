"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Download, FileText, ImageIcon, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { ConfirmDelete } from "@/components/shared/confirm-delete";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { documentTypeShort, formatBytes, isImage } from "@/lib/documents";
import type { Document } from "@/lib/types";
import { cn } from "@/lib/utils";

interface DocumentListProps {
  documents: Document[];
  /** Hides delete controls in read-only contexts. */
  readOnly?: boolean;
  className?: string;
}

export function DocumentList({ documents, readOnly, className }: DocumentListProps) {
  const router = useRouter();
  const [deleting, setDeleting] = React.useState<string | null>(null);

  async function remove(document: Document) {
    setDeleting(document.id);
    try {
      const response = await fetch(`/api/documents/${document.id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Delete failed");
      toast.success("Document removed", { description: document.label });
      router.refresh();
    } catch {
      toast.error("Could not remove that document.");
    } finally {
      setDeleting(null);
    }
  }

  if (documents.length === 0) return null;

  return (
    <ul className={cn("divide-y divide-border/70", className)}>
      {documents.map((document) => {
        const Icon = isImage(document.contentType) ? ImageIcon : FileText;
        return (
          <li key={document.id} className="flex items-center gap-2.5 py-2">
            <div className="flex size-7 shrink-0 items-center justify-center rounded border border-border bg-surface-sunken text-muted-foreground">
              <Icon className="size-3.5" />
            </div>
            <div className="min-w-0 flex-1">
              <a
                href={`/api/documents/${document.id}`}
                target="_blank"
                rel="noreferrer"
                className="block truncate text-sm hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {document.label}
              </a>
              <p className="truncate text-2xs text-muted-foreground tnum">
                {formatBytes(document.sizeBytes)} - {document.fileName}
              </p>
            </div>
            <Badge variant="outline" className="shrink-0">
              {documentTypeShort(document.type)}
            </Badge>
            <div className="flex shrink-0 gap-0.5">
              <Button asChild variant="ghost" size="icon-sm" aria-label={`Download ${document.label}`}>
                <a href={`/api/documents/${document.id}?download=1`}>
                  <Download />
                </a>
              </Button>
              {readOnly ? null : (
                <ConfirmDelete
                  entity="document"
                  label={`${document.label} (${document.fileName})`}
                  consequences={["The stored file itself"]}
                  onConfirm={() => remove(document)}
                  trigger={
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Delete ${document.label}`}
                      className="text-muted-foreground hover:text-neg"
                      disabled={deleting === document.id}
                    >
                      {deleting === document.id ? <Loader2 className="animate-spin" /> : <Trash2 />}
                    </Button>
                  }
                />
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
