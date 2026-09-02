import { Badge } from "@/components/ui/badge";
import { statusLabel } from "@/lib/categories";
import type { AppLocale } from "@/lib/i18n";
import type { PaymentStatus } from "@/lib/types";

const VARIANT: Record<PaymentStatus, "warning" | "info" | "positive"> = {
  PENDING: "warning",
  INVOICED: "info",
  PAID: "positive",
};

export function StatusBadge({ status, locale }: { status: PaymentStatus; locale: AppLocale }) {
  return <Badge variant={VARIANT[status]}>{statusLabel(status, locale)}</Badge>;
}
