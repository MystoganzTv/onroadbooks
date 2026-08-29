"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { ConfirmDelete } from "@/components/shared/confirm-delete";
import { Button } from "@/components/ui/button";
import {
  deleteReserveAccountAction,
  deleteReserveTransactionAction,
} from "@/lib/actions/reserves";

export function DeleteReserveAccountButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  return (
    <ConfirmDelete
      entity="bucket"
      label={name}
      consequences={["Every movement recorded in this bucket"]}
      onConfirm={() =>
        startTransition(async () => {
          const result = await deleteReserveAccountAction(id);
          if (result.ok) {
            toast.success("Bucket deleted");
            router.refresh();
          } else {
            toast.error(result.error);
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
  const [, startTransition] = useTransition();

  if (posted) {
    return (
      <Button
        variant="ghost"
        size="icon-sm"
        disabled
        aria-label="Posted by a closed settlement"
        title="Posted by a closed settlement. Reopen the settlement to remove it."
        className="text-muted-foreground/40"
      >
        <Trash2 />
      </Button>
    );
  }

  return (
    <ConfirmDelete
      entity="movement"
      label={label}
      onConfirm={() =>
        startTransition(async () => {
          const result = await deleteReserveTransactionAction(id);
          if (result.ok) {
            toast.success("Movement removed");
            router.refresh();
          } else {
            toast.error(result.error);
          }
        })
      }
    />
  );
}
