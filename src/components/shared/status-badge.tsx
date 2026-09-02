import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/components/shell/language-provider";
import { statusLabel } from "@/lib/categories";
import type { PaymentStatus } from "@/lib/types";

const VARIANT: Record<PaymentStatus, "warning" | "info" | "positive"> = {
  PENDING: "warning",
  INVOICED: "info",
  PAID: "positive",
};

export function StatusBadge({ status }: { status: PaymentStatus }) {
  const { locale } = useLanguage();
  return <Badge variant={VARIANT[status]}>{statusLabel(status, locale)}</Badge>;
}
