"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

/**
 * A directory row that opens the dispatcher wherever it is clicked. Clicks on
 * the row's own controls (the name link, the edit button, a dialog opened from
 * it) keep their behaviour; the name link stays the keyboard path in.
 */
export function DispatcherRow({ href, selected, children }: { href: string; selected: boolean; children: React.ReactNode }) {
  const router = useRouter();
  function open(event: React.MouseEvent<HTMLTableRowElement>) {
    const target = event.target as HTMLElement;
    // React bubbles clicks out of portals (the edit dialog, its overlay); only real row clicks count.
    if (!event.currentTarget.contains(target)) return;
    if (target.closest("a, button, input, select, textarea, [role='dialog']")) return;
    if (window.getSelection()?.toString()) return;
    router.push(href, { scroll: false });
  }
  return (
    <TableRow onClick={open} className={cn("cursor-pointer", selected && "bg-primary/10 hover:bg-primary/15")} aria-selected={selected}>
      {children}
    </TableRow>
  );
}
