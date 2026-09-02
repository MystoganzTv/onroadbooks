"use client";

import { useRouter } from "next/navigation";
import { Archive, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { localizedClientError } from "@/lib/i18n/errors";

import { ConfirmAction } from "@/components/shared/confirm-action";
import { useLanguage } from "@/components/shell/language-provider";
import { Button } from "@/components/ui/button";
import { archiveTruckAction, restoreTruckAction } from "@/lib/actions/trucks";
import { todayISO } from "@/lib/periods";
import type { Truck } from "@/lib/types";

/**
 * Retiring and un-retiring a unit.
 *
 * Nothing is ever deleted. A retired truck keeps every load, expense, fill-up
 * and service record it ever carried, and those keep showing up in past
 * reports -- what changes is that new work can no longer be booked against it
 * and it stops counting against the plan's limit. That is why this is not a
 * delete button, and why the copy says "retire" rather than "remove".
 */
export function TruckRetireButton({ truck, canRestore }: { truck: Truck; canRestore: boolean }) {
  const router = useRouter();
  const { dictionary } = useLanguage();
  const copy = dictionary.fleet;

  if (!truck.active) {
    return (
      <ConfirmAction
        title={copy.returnTitle.replace("{truck}", truck.name)}
        description={copy.returnDescription}
        confirmLabel={copy.returnAction}
        trigger={
          <Button variant="outline" size="sm" disabled={!canRestore}>
            <RotateCcw className="size-4" />
            {copy.returnAction}
          </Button>
        }
        onConfirm={async () => {
          const result = await restoreTruckAction(truck.id);
          if (result.ok) {
            toast.success(copy.returnedSuccess.replace("{truck}", truck.name));
            router.refresh();
          } else {
            toast.error(localizedClientError(result.error));
          }
        }}
      />
    );
  }

  return (
    <ConfirmAction
      title={copy.retireTitle.replace("{truck}", truck.name)}
      description={copy.retireDescription}
      confirmLabel={copy.retireAction}
      variant="destructive"
      trigger={
        <Button
          variant="outline"
          size="sm"
          className="border-neg/30 text-neg hover:bg-neg-soft hover:text-neg"
        >
          <Archive className="size-4" />
          {copy.retireAction}
        </Button>
      }
      onConfirm={async () => {
        const result = await archiveTruckAction({ id: truck.id, soldOn: todayISO() });
        if (result.ok) {
          toast.success(copy.retiredSuccess.replace("{truck}", truck.name), {
            description: copy.recordsUntouched,
          });
          router.refresh();
        } else {
          toast.error(localizedClientError(result.error));
        }
      }}
    />
  );
}
