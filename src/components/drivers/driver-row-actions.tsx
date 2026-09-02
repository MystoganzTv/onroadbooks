"use client";

import { useRouter } from "next/navigation";
import { Archive, Pencil, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { localizedClientError } from "@/lib/i18n/errors";
import { useLanguage } from "@/components/shell/language-provider";
import { interpolate } from "@/lib/i18n/dictionaries";

import { setDriverActiveAction } from "@/lib/actions/drivers";
import type { Driver, Truck } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { DriverFormDialog } from "./driver-form-dialog";

export function DriverRowActions({ driver, trucks }: { driver: Driver; trucks: Truck[] }) {
  const router = useRouter();
  const { dictionary } = useLanguage();
  const copy = dictionary.drivers;
  async function toggle() {
    const result = await setDriverActiveAction(driver.id, !driver.active);
    if (!result.ok) return toast.error(localizedClientError(result.error));
    toast.success(driver.active ? copy.driverInactive : copy.driverRestored);
    router.refresh();
  }
  return (
    <div className="flex justify-end gap-1">
      <DriverFormDialog
        driver={driver}
        trucks={trucks}
        trigger={<Button variant="ghost" size="sm" aria-label={interpolate(copy.editDriverAria, { driver: driver.name })}><Pencil /></Button>}
      />
      <Button
        variant="ghost"
        size="sm"
        onClick={toggle}
        aria-label={driver.active
          ? interpolate(copy.makeInactiveAria, { driver: driver.name })
          : interpolate(copy.restoreAria, { driver: driver.name })}
      >
        {driver.active ? <Archive /> : <RotateCcw />}
      </Button>
    </div>
  );
}
