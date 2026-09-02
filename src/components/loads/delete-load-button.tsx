"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { localizedClientError } from "@/lib/i18n/errors";
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
import { deleteLoadAction } from "@/lib/actions/loads";
import { interpolate } from "@/lib/i18n/dictionaries";

export function DeleteLoadButton({ id, label }: { id: string; label: string }) {
  const { dictionary } = useLanguage();
  const copy = dictionary.loads;
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  function confirm() {
    startTransition(async () => {
      const result = await deleteLoadAction(id);
      if (result.ok) {
        toast.success(copy.deleted, { description: label });
        setOpen(false);
        router.push("/loads");
        router.refresh();
      } else {
        toast.error(localizedClientError(result.error));
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="text-muted-foreground hover:text-neg">
          <Trash2 />
          {copy.delete}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{copy.deleteTitle}</DialogTitle>
          <DialogDescription>
            {interpolate(copy.deleteDescription, { label })}
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <p className="text-sm text-muted-foreground">
            {copy.unlinkDescription}
          </p>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
            {dictionary.common.cancel}
          </Button>
          <Button variant="destructive" size="sm" onClick={confirm} disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : null}
            {copy.deleteLoad}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
