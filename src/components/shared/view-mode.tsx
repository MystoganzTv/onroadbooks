"use client";

import type { ReactNode } from "react";
import { useLanguage } from "@/components/shell/language-provider";
import { useViewMode } from "@/components/shell/view-mode-provider";
import { Button } from "@/components/ui/button";

export function ViewModeToggle() {
  const { mode, pending, setMode } = useViewMode();
  const { dictionary } = useLanguage();
  const copy = dictionary.viewMode;
  return (
    <div role="group" aria-label={copy.label} aria-busy={pending} className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border bg-card p-1">
      {(["simple", "detailed"] as const).map((value) => (
        <Button key={value} type="button" size="sm" variant={mode === value ? "secondary" : "ghost"}
          aria-pressed={mode === value} disabled={pending} onClick={() => setMode(value)}>
          {copy[value]}
        </Button>
      ))}
    </div>
  );
}

/** The saved mode is the single control for how much detail is shown. */
export function ModeView({ simple, children }: { simple: ReactNode; children: ReactNode }) {
  const { mode } = useViewMode();
  return (
    <div key={mode} className="space-y-5" data-view-mode={mode}>
      {mode === "detailed" ? children : simple}
    </div>
  );
}
