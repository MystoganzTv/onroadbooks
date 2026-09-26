"use client";

import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useLanguage } from "@/components/shell/language-provider";
import { Button } from "@/components/ui/button";
import { ConfirmDelete } from "@/components/shared/confirm-delete";
import { deleteBrokerAction } from "@/lib/actions/brokers";
import { interpolate } from "@/lib/i18n/dictionaries";
import { localizedClientError } from "@/lib/i18n/errors";

/**
 * Deletes the profile, never the loads. A load keeps the broker name it was
 * booked under -- that is history -- so the confirmation says so up front.
 */
export function DeleteBrokerButton({
  brokerId,
  brokerName,
  loadCount,
  contactNames,
}: {
  brokerId: string;
  brokerName: string;
  loadCount: number;
  contactNames: string[];
}) {
  const { dictionary } = useLanguage();
  const copy = dictionary.brokers;
  const router = useRouter();
  const consequences = contactNames.length
    ? [interpolate(copy.deleteRemovesContacts, { names: contactNames.join(", ") })]
    : [];
  const label = loadCount > 0
    ? `${brokerName}. ${interpolate(copy.deleteKeepsLoads, { count: loadCount, name: brokerName })}`
    : brokerName;

  return <ConfirmDelete
    label={label}
    entity={copy.entity}
    consequences={consequences}
    trigger={<Button variant="outline" size="sm" className="text-neg hover:text-neg"><Trash2 />{dictionary.common.deleteAction.replace("{entity}", copy.entity)}</Button>}
    onConfirm={async () => {
      const result = await deleteBrokerAction(brokerId);
      if (!result.ok) {
        toast.error(localizedClientError(result.error));
        return;
      }
      toast.success(copy.deleted);
      router.push("/brokers");
      router.refresh();
    }}
  />;
}
