import type { SHELL_COPY } from "@/lib/i18n";

type ShellCopy = (typeof SHELL_COPY)[keyof typeof SHELL_COPY];

const ITEM_KEYS: Record<string, keyof ShellCopy> = {
  "/dashboard": "dashboard",
  "/loads": "loads",
  "/calculator": "loadCalculator",
  "/expenses": "expenses",
  "/fuel": "fuel",
  "/drivers": "drivers",
  "/invoices": "invoices",
  "/settlements": "ownerSettlements",
  "/driver-settlements": "driverPay",
  "/reserves": "reserves",
  "/ifta": "ifta",
  "/analytics/cost-per-mile": "analytics",
  "/reports": "reports",
  "/fleet": "fleet",
  "/truck": "truck",
  "/admin": "admin",
};

const GROUP_KEYS: Record<string, keyof ShellCopy> = {
  Operate: "operate",
  Money: "money",
  Intelligence: "intelligence",
  System: "system",
};

export function localizedNavItem(href: string, fallback: string, copy: ShellCopy): string {
  const key = ITEM_KEYS[href];
  return key ? copy[key] : fallback;
}

export function localizedNavGroup(label: string, copy: ShellCopy): string {
  const key = GROUP_KEYS[label];
  return key ? copy[key] : label;
}
