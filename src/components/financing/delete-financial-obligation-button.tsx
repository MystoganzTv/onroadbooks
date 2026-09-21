"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useLanguage } from "@/components/shell/language-provider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { deleteFinancialObligationAction } from "@/lib/actions/financing";
import { localizedClientError } from "@/lib/i18n/errors";
import { interpolate } from "@/lib/i18n/dictionaries";

export function DeleteFinancialObligationButton({ id, name }: { id: string; name: string }) {
  const { dictionary } = useLanguage();
  const copy = dictionary.financing;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  function remove() {
    startTransition(async () => {
      const result = await deleteFinancialObligationAction(id);
      if (!result.ok) {
        toast.error(localizedClientError(result.error));
        return;
      }
      toast.success(copy.deleted);
      setOpen(false);
      router.refresh();
    });
  }
  return (
    <Dialog open={open} onOpenChange={(value) => { if (!pending) setOpen(value); }}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`${copy.deleteObligation}: ${name}`} className="hover:text-neg">
          <Trash2 />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{copy.deleteTitle}</DialogTitle>
          <DialogDescription>{interpolate(copy.deleteDescription, { name })}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>{dictionary.common.cancel}</Button>
          <Button variant="destructive" onClick={remove} disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : null}{copy.deleteObligation}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
