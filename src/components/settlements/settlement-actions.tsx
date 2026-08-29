"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Lock, LockOpen } from "lucide-react";
import { toast } from "sonner";

import { ConfirmAction } from "@/components/shared/confirm-action";
import { Button } from "@/components/ui/button";
import { closeSettlementAction, reopenSettlementAction } from "@/lib/actions/settlements";
import type { SettlementHalf } from "@/lib/types";

/**
 * Closing is a real commitment -- it freezes the numbers and posts money into
 * the reserve buckets -- so both directions confirm first and say exactly what
 * will happen.
 */
export function CloseSettlementButton({
  month,
  half,
  complete,
  reserveTotal,
}: {
  month: string;
  half: SettlementHalf;
  complete: boolean;
  reserveTotal: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  if (!complete) {
    return (
      <Button type="button" size="sm" disabled title="This period has not finished yet">
        <Lock className="size-3.5" />
        Close settlement
      </Button>
    );
  }

  return (
    <ConfirmAction
      title="Close this settlement?"
      description={`The figures are frozen exactly as they stand now, and ${reserveTotal} is posted into your reserve buckets. Later changes to a reserve percentage will not rewrite this settlement. You can reopen it if you need to.`}
      confirmLabel="Close settlement"
      variant="default"
      trigger={
        <Button type="button" size="sm" disabled={pending}>
          {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Lock className="size-3.5" />}
          Close settlement
        </Button>
      }
      onConfirm={() =>
        startTransition(async () => {
          const result = await closeSettlementAction({ month, half });
          if (result.ok) {
            toast.success("Settlement closed", {
              description: "The snapshot is frozen and reserves have been posted.",
            });
            router.refresh();
          } else {
            toast.error(result.error);
          }
        })
      }
    />
  );
}

export function ReopenSettlementButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  return (
    <ConfirmAction
      title="Reopen this settlement?"
      description="The frozen snapshot is cleared and the reserve contributions this close posted are removed. Manual movements in those buckets are left alone."
      confirmLabel="Reopen"
      trigger={
        <Button type="button" variant="outline" size="sm" disabled={pending}>
          {pending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <LockOpen className="size-3.5" />
          )}
          Reopen
        </Button>
      }
      onConfirm={() =>
        startTransition(async () => {
          const result = await reopenSettlementAction(id);
          if (result.ok) {
            toast.success("Settlement reopened");
            router.refresh();
          } else {
            toast.error(result.error);
          }
        })
      }
    />
  );
}
