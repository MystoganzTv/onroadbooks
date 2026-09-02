"use client";

import { Info } from "lucide-react";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function MiniStatHelp({ label, children }: { label: string; children: string }) {
  return (
    <TooltipProvider delayDuration={200} skipDelayDuration={50}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="-mr-1 -mt-1 flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-ring"
            aria-label={`What ${label} means`}
          >
            <Info className="size-3.5" aria-hidden />
          </button>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          align="end"
          className="max-w-64 px-3 py-2 text-left text-xs leading-relaxed"
        >
          {children}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
