import {
  BarChart3,
  Building2,
  BadgeDollarSign,
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
  UserRound,
  MapPinned,
  type LucideIcon,
} from "lucide-react";
import type { IftaApplicability } from "@/lib/ifta-eligibility";
import type { MemberRole } from "@/lib/types";

export type NavigationRequirement = "LOAD" | "ACTIVITY" | "DRIVER_PAY" | "IFTA";

export interface NavigationReadiness {
  hasLoads: boolean;
  hasFinancialActivity: boolean;
  hasDriverPayActivity: boolean;
  hasIftaActivity: boolean;
  hasIftaDecisionPending: boolean;
  iftaApplicability: IftaApplicability;
}

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
  /** Product guidance only; authorization remains enforced by each route/action. */
  requires?: NavigationRequirement;
  /** Navigation scope only. Sensitive routes still enforce this on the server. */
  roles?: readonly MemberRole[];
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
      { href: "/brokers", label: "Brokers", icon: Building2 },
      { href: "/calculator", label: "Load Calculator", icon: Calculator },
      { href: "/expenses", label: "Expenses", icon: Receipt },
      { href: "/fuel", label: "Fuel", icon: Fuel },
      // Owner-operator product (ADR 0031): drivers are listed with what they
      // earned, on every plan. Fleet and Driver Pay stay built but hidden.
      { href: "/drivers", label: "Drivers", icon: UserRound },
    ],
  },
  {
    label: "Money",
    items: [
      {
        href: "/financing",
        label: "Financing",
        icon: BadgeDollarSign,
        roles: ["OWNER", "ADMIN", "BOOKKEEPER"],
      },
      { href: "/reserves", label: "Reserves", icon: Landmark, roles: ["OWNER"] },
    ],
  },
  {
    label: "Intelligence",
    items: [
      { href: "/ifta", label: "IFTA", icon: MapPinned, requires: "IFTA" },
      {
        href: "/analytics/cost-per-mile",
        label: "Analytics",
        icon: BarChart3,
        matches: ["/analytics"],
        requires: "ACTIVITY",
      },
      { href: "/reports", label: "Reports", icon: BarChart3, requires: "ACTIVITY" },
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

export function isNavVisibleToRole(item: NavItem, role: MemberRole): boolean {
  return !item.roles || item.roles.includes(role);
}

export interface NavAvailability {
  enabled: boolean;
  badge?: string;
  reason?: string;
}

export function navAvailability(
  item: NavItem,
  readiness?: NavigationReadiness,
): NavAvailability {
  if (!readiness || !item.requires) return { enabled: true };

  if (item.requires === "LOAD" && !readiness.hasLoads) {
    return {
      enabled: false,
      badge: "Add load",
      reason: "Add your first load before creating an invoice.",
    };
  }
  if (item.requires === "ACTIVITY" && !readiness.hasFinancialActivity) {
    return {
      enabled: false,
      badge: "No activity",
      reason: "This section becomes useful after your first load or expense.",
    };
  }
  if (item.requires === "DRIVER_PAY" && !readiness.hasDriverPayActivity) {
    return {
      enabled: false,
      badge: "Not ready",
      reason: "Add a driver and assign at least one load before preparing driver pay.",
    };
  }
  if (item.requires === "IFTA" && !readiness.hasIftaActivity) {
    return { enabled: false, reason: "Enable IFTA reporting for a truck to show this section." };
  }
  return { enabled: true };
}
