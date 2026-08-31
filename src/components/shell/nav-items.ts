import {
  BarChart3,
  Calculator,
  CreditCard,
  Fuel,
  Landmark,
  LayoutDashboard,
  Package,
  Receipt,
  Settings,
  ShieldCheck,
  Truck,
  Users,
  Wallet,
  UserRound,
  ClipboardList,
  FileText,
  MapPinned,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Also treat these prefixes as "on this section". */
  matches?: string[];
  /** Hidden until the paid Fleet service is active. */
  fleetOnly?: boolean;
  /** Visible only to the server-authorized operator account. */
  adminOnly?: boolean;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

/**
 * Navigation is grouped by the question being asked, not by data table:
 * what the truck is doing, what the money is doing, and what the numbers say.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Operate",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/loads", label: "Loads", icon: Package },
      { href: "/calculator", label: "Load Calculator", icon: Calculator },
      { href: "/expenses", label: "Expenses", icon: Receipt },
      { href: "/fuel", label: "Fuel", icon: Fuel },
      { href: "/drivers", label: "Drivers", icon: UserRound, fleetOnly: true },
    ],
  },
  {
    label: "Money",
    items: [
      { href: "/invoices", label: "Invoices", icon: FileText },
      { href: "/settlements", label: "Owner Settlements", icon: Wallet },
      { href: "/driver-settlements", label: "Driver Pay", icon: ClipboardList, fleetOnly: true },
      { href: "/reserves", label: "Reserves", icon: Landmark },
    ],
  },
  {
    label: "Intelligence",
    items: [
      { href: "/ifta", label: "IFTA", icon: MapPinned },
      { href: "/analytics/cost-per-mile", label: "Analytics", icon: BarChart3, matches: ["/analytics"] },
      { href: "/reports", label: "Reports", icon: BarChart3 },
      { href: "/fleet", label: "Fleet", icon: Truck, fleetOnly: true },
      { href: "/team", label: "Team", icon: Users, fleetOnly: true },
      { href: "/truck", label: "Truck", icon: Truck },
    ],
  },
  {
    label: "System",
    items: [{ href: "/admin", label: "Admin", icon: ShieldCheck, adminOnly: true }],
  },
];

/** Flat list, kept for the mobile header title and anything else that needs it. */
export const PRIMARY_NAV: NavItem[] = [
  ...NAV_GROUPS.flatMap((group) => group.items),
  { href: "/plans", label: "Plans & Billing", icon: CreditCard },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function isNavActive(item: NavItem, pathname: string): boolean {
  const prefixes = item.matches ?? [item.href];
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}
