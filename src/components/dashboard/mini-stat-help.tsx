"use client";

/**
 * The ⓘ beside a metric — and, on /loads alone, the only explanation nine
 * figures have.
 *
 * It used to be a Radix Tooltip, which opens on hover and focus and therefore
 * NEVER on a touch screen: on the phone this product is used from, every one
 * of those explanations was unreachable. A Popover opens on tap, on click and
 * from the keyboard, so the same button now works on every device.
 *
 * The trigger is 44px because a thumb in a glove is the design target; the
 * icon inside stays small, and negative margins keep the metric's layout.
 */

import * as React from "react";
import { Info } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export function MiniStatHelp({ label, children }: { label: string; children: string }) {
  const [open, setOpen] = React.useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="-mr-3 -mt-3 -mb-3 flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus-ring"
          aria-label={`What ${label} means`}
          // Hover still previews it on a mouse, without stealing the tap.
          onPointerEnter={(event) => {
            if (event.pointerType === "mouse") setOpen(true);
          }}
          onPointerLeave={(event) => {
            if (event.pointerType === "mouse") setOpen(false);
          }}
        >
          <Info className="size-3.5" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="end"
        sideOffset={4}
        onOpenAutoFocus={(event) => event.preventDefault()}
        className="max-w-64 px-3 py-2 text-left text-xs leading-relaxed"
      >
        {children}
      </PopoverContent>
    </Popover>
  );
}
