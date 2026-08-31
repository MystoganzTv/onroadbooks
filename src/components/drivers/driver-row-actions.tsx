"use client";

import { useRouter } from "next/navigation";
import { Archive, Pencil, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { setDriverActiveAction } from "@/lib/actions/drivers";
import type { Driver, Truck } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { DriverFormDialog } from "./driver-form-dialog";

export function DriverRowActions({ driver, trucks }: { driver: Driver; trucks: Truck[] }) {
  const router = useRouter();
  async function toggle() {
    const result = await setDriverActiveAction(driver.id, !driver.active);
    if (!result.ok) return toast.error(result.error);
    toast.success(driver.active ? "Driver made inactive" : "Driver restored");
    router.refresh();
  }
  return (
    <div className="flex justify-end gap-1">
      <DriverFormDialog
        driver={driver}
        trucks={trucks}
        trigger={<Button variant="ghost" size="sm" aria-label={`Edit ${driver.name}`}><Pencil /></Button>}
      />
      <Button
        variant="ghost"
        size="sm"
        onClick={toggle}
        aria-label={driver.active ? `Make ${driver.name} inactive` : `Restore ${driver.name}`}
      >
        {driver.active ? <Archive /> : <RotateCcw />}
      </Button>
    </div>
  );
}
