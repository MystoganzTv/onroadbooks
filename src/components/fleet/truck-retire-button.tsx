"use client";

import { useRouter } from "next/navigation";
import { Archive, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { ConfirmAction } from "@/components/shared/confirm-action";
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

  if (!truck.active) {
    return (
      <ConfirmAction
        title={`Return ${truck.name} to active service?`}
        description="The unit will become available for new loads and expenses again and will count toward your plan's active-truck limit."
        confirmLabel="Return to service"
        trigger={
          <Button variant="outline" size="sm" disabled={!canRestore}>
            <RotateCcw className="size-4" />
            Return to service
          </Button>
        }
        onConfirm={async () => {
          const result = await restoreTruckAction(truck.id);
          if (result.ok) {
            toast.success(`${truck.name} is back in the fleet`);
            router.refresh();
          } else {
            toast.error(result.error);
          }
        }}
      />
    );
  }

  return (
    <ConfirmAction
      title={`Take ${truck.name} out of active service?`}
      description="This does not delete the truck or any of its history. Past loads, expenses, fuel and service remain in reports; the unit simply becomes unavailable for new work."
      confirmLabel="Take out of service"
      variant="destructive"
      trigger={
        <Button
          variant="outline"
          size="sm"
          className="border-neg/30 text-neg hover:bg-neg-soft hover:text-neg"
        >
          <Archive className="size-4" />
          Take out of service
        </Button>
      }
      onConfirm={async () => {
        const result = await archiveTruckAction({ id: truck.id, soldOn: todayISO() });
        if (result.ok) {
          toast.success(`${truck.name} retired`, {
            description: "Its records are untouched.",
          });
          router.refresh();
        } else {
          toast.error(result.error);
        }
      }}
    />
  );
}
