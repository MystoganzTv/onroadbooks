"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";

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

interface ConfirmActionProps {
  title: string;
  /** Spell out exactly what happens. These actions move money between buckets. */
  description: string;
  confirmLabel: string;
  variant?: "default" | "destructive" | "outline";
  trigger: React.ReactNode;
  onConfirm: () => Promise<void> | void;
}

/**
 * Confirmation for a consequential but non-destructive action -- closing a
 * settlement, reopening one. ConfirmDelete stays for deletes, whose copy and
 * red button would be wrong here.
 */
export function ConfirmAction({
  title,
  description,
  confirmLabel,
  variant = "default",
  trigger,
  onConfirm,
}: ConfirmActionProps) {
  const { dictionary } = useLanguage();
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
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <p className="text-xs text-muted-foreground">
            {dictionary.common.actionReversible}
          </p>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => setOpen(false)} disabled={pending}>
            {dictionary.common.cancel}
          </Button>
          <Button variant={variant} size="sm" onClick={confirm} disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : null}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
