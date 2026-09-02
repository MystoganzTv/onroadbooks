"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Lock, LockOpen } from "lucide-react";
import { toast } from "sonner";

import { localizedClientError } from "@/lib/i18n/errors";

import { ConfirmAction } from "@/components/shared/confirm-action";
import { useLanguage } from "@/components/shell/language-provider";
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
  const { dictionary } = useLanguage();
  const copy = dictionary.settlements;
  const [pending, startTransition] = React.useTransition();

  if (!complete) {
    return (
      <Button type="button" size="sm" disabled title={copy.periodNotFinished}>
        <Lock className="size-3.5" />
        {copy.closeSettlement}
      </Button>
    );
  }

  return (
    <ConfirmAction
      title={copy.closeTitle}
      description={copy.closeDescription.replace("{amount}", reserveTotal)}
      confirmLabel={copy.closeSettlement}
      variant="default"
      trigger={
        <Button type="button" size="sm" disabled={pending}>
          {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Lock className="size-3.5" />}
          {copy.closeSettlement}
        </Button>
      }
      onConfirm={() =>
        startTransition(async () => {
          const result = await closeSettlementAction({ month, half });
          if (result.ok) {
            toast.success(copy.closedSuccess, {
              description: copy.closedSuccessDescription,
            });
            router.refresh();
          } else {
            toast.error(localizedClientError(result.error));
          }
        })
      }
    />
  );
}

export function ReopenSettlementButton({ id }: { id: string }) {
  const router = useRouter();
  const { dictionary } = useLanguage();
  const copy = dictionary.settlements;
  const [pending, startTransition] = React.useTransition();

  return (
    <ConfirmAction
      title={copy.reopenTitle}
      description={copy.reopenDescription}
      confirmLabel={copy.reopen}
      trigger={
        <Button type="button" variant="outline" size="sm" disabled={pending}>
          {pending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <LockOpen className="size-3.5" />
          )}
          {copy.reopen}
        </Button>
      }
      onConfirm={() =>
        startTransition(async () => {
          const result = await reopenSettlementAction(id);
          if (result.ok) {
            toast.success(copy.reopenedSuccess);
            router.refresh();
          } else {
            toast.error(localizedClientError(result.error));
          }
        })
      }
    />
  );
}
