"use client";

import type { ReactNode } from "react";

/** Native disclosure keeps field values mounted and supports keyboard navigation. */
export function FormSection({ title, expanded, children }: {
  title: string;
  expanded: boolean;
  children: ReactNode;
}) {
  return (
    <details open={expanded} className="rounded-lg border border-border p-3">
      <summary className="cursor-pointer rounded text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
        {title}
      </summary>
      <div className="mt-4 space-y-4">{children}</div>
    </details>
  );
}
