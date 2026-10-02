"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

/**
 * A table row that opens `href` wherever it is clicked -- not only on the
 * name, and not only on a button at the far right. Links and buttons inside
 * the row (a phone number, an email) keep doing their own thing, and
 * selecting text to copy it does not navigate. The name link inside the row
 * stays the keyboard path.
 */
export function LinkRow({ href, className, children }: { href: string; className?: string; children: React.ReactNode }) {
  const router = useRouter();
  return (
    <TableRow
      className={cn("cursor-pointer", className)}
      onClick={(event) => {
        if ((event.target as HTMLElement).closest("a, button, input, select, textarea, [role='button']")) return;
        if (window.getSelection()?.toString()) return;
        if (event.metaKey || event.ctrlKey) {
          window.open(href, "_blank");
          return;
        }
        router.push(href);
      }}
    >
      {children}
    </TableRow>
  );
}
