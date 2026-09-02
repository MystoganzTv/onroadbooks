"use client";

import * as React from "react";
import { Loader2, Trash2 } from "lucide-react";

import { useLanguage } from "@/components/shell/language-provider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface ConfirmDeleteProps {
  /** What is being deleted, e.g. "Rear roll-door roller replacement". */
  label: string;
  /** Noun for the button and title, e.g. "expense". */
  entity: string;
  /**
   * Anything else that goes with it. Deletes here cascade -- receipts, ledger
   * rows -- and the user has no undo, so the consequences are spelled out.
   */
  consequences?: string[];
  onConfirm: () => Promise<void> | void;
  trigger?: React.ReactNode;
  triggerLabel?: string;
}

export function ConfirmDelete({
  label,
  entity,
  consequences = [],
  onConfirm,
  trigger,
  triggerLabel,
}: ConfirmDeleteProps) {
  const { dictionary } = useLanguage();
  const copy = dictionary.common;
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);

  async function confirm() {
    setPending(true);
    try {
      await onConfirm();
      setOpen(false);
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (pending ? null : setOpen(next))}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={triggerLabel ?? copy.deleteAria.replace("{entity}", entity)}
            className="text-muted-foreground hover:text-neg"
          >
            <Trash2 />
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{copy.deleteTitle.replace("{entity}", entity)}</DialogTitle>
          <DialogDescription>{label}</DialogDescription>
        </DialogHeader>
        <DialogBody>
          {consequences.length > 0 ? (
            <>
              <p className="text-sm text-foreground/90">{copy.alsoRemoves}</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                {consequences.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </>
          ) : null}
          <p className="mt-3 text-xs text-muted-foreground">{copy.cannotUndo}</p>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => setOpen(false)} disabled={pending}>
            {copy.cancel}
          </Button>
          <Button variant="destructive" size="sm" onClick={confirm} disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : null}
            {copy.deleteAction.replace("{entity}", entity)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
