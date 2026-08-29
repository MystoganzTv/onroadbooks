import { Badge } from "@/components/ui/badge";
import { statusLabel } from "@/lib/categories";
import type { PaymentStatus } from "@/lib/types";

const VARIANT: Record<PaymentStatus, "warning" | "info" | "positive"> = {
  PENDING: "warning",
  INVOICED: "info",
  PAID: "positive",
};

export function StatusBadge({ status }: { status: PaymentStatus }) {
  return <Badge variant={VARIANT[status]}>{statusLabel(status)}</Badge>;
}
