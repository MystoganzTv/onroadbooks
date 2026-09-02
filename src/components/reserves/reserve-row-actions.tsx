"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { localizedClientError } from "@/lib/i18n/errors";

import { ConfirmDelete } from "@/components/shared/confirm-delete";
import { useLanguage } from "@/components/shell/language-provider";
import { Button } from "@/components/ui/button";
import {
  deleteReserveAccountAction,
  deleteReserveTransactionAction,
} from "@/lib/actions/reserves";

export function DeleteReserveAccountButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const { dictionary } = useLanguage();
  const copy = dictionary.reserves;
  const [, startTransition] = useTransition();

  return (
    <ConfirmDelete
      entity={copy.bucket}
      label={name}
      consequences={[copy.bucketConsequence]}
      onConfirm={() =>
        startTransition(async () => {
          const result = await deleteReserveAccountAction(id);
          if (result.ok) {
            toast.success(copy.bucketDeleted);
            router.refresh();
          } else {
            toast.error(localizedClientError(result.error));
          }
        })
      }
    />
  );
}

export function DeleteReserveTransactionButton({
  id,
  label,
  posted,
}: {
  id: string;
  label: string;
  posted: boolean;
}) {
  const router = useRouter();
  const { dictionary } = useLanguage();
  const copy = dictionary.reserves;
  const [, startTransition] = useTransition();

  if (posted) {
    return (
      <Button
        variant="ghost"
        size="icon-sm"
        disabled
        aria-label={copy.postedBySettlement}
        title={copy.postedBySettlementHint}
        className="text-muted-foreground/40"
      >
        <Trash2 />
      </Button>
    );
  }

  return (
    <ConfirmDelete
      entity={copy.movement}
      label={label}
      onConfirm={() =>
        startTransition(async () => {
          const result = await deleteReserveTransactionAction(id);
          if (result.ok) {
            toast.success(copy.movementRemoved);
            router.refresh();
          } else {
            toast.error(localizedClientError(result.error));
          }
        })
      }
    />
  );
}
