import { formatMoney, formatMoneyCompact } from "@/lib/formatters";
import { cn } from "@/lib/utils";

interface MoneyProps {
  value: number;
  /** Colour the number by sign. Off by default -- most figures are neutral. */
  signed?: boolean;
  /** Always render as a negative (expense rows). */
  negative?: boolean;
  compact?: boolean;
  className?: string;
}

export function Money({ value, signed, negative, compact, className }: MoneyProps) {
  const display = compact ? formatMoneyCompact(value) : formatMoney(value);
  const tone = signed ? (value > 0 ? "text-pos" : value < 0 ? "text-neg" : undefined) : undefined;

  return (
    <span className={cn("tnum", tone, negative && "text-neg", className)}>
      {negative && value !== 0 ? `-${display}` : display}
    </span>
  );
}
