"use client";

import * as React from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
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

/** A temporary detail view does not change the saved preference. */
export function ModeView({ simple, children }: { simple: React.ReactNode; children: React.ReactNode }) {
  const { mode } = useViewMode();
  return <ModeViewContent key={mode} mode={mode} simple={simple}>{children}</ModeViewContent>;
}

function ModeViewContent({ mode, simple, children }: {
  mode: "simple" | "detailed"; simple: React.ReactNode; children: React.ReactNode;
}) {
  const [expanded, setExpanded] = React.useState(false);
  const id = React.useId();
  const { dictionary } = useLanguage();
  const copy = dictionary.viewMode;
  return (
    <div className="space-y-4" data-view-mode={mode}>
      {mode === "simple" ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">{expanded ? copy.detailHint : copy.simpleHint}</p>
          <Button type="button" size="sm" variant="outline" aria-expanded={expanded} aria-controls={id} onClick={() => setExpanded((value) => !value)}>
            {expanded ? <ChevronUp /> : <ChevronDown />}
            {expanded ? copy.hideDetails : copy.showDetails}
          </Button>
        </div>
      ) : null}
      <div key={mode === "detailed" || expanded ? "detailed" : "simple"} id={id} className="space-y-5">{mode === "detailed" || expanded ? children : simple}</div>
    </div>
  );
}
