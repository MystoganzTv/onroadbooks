import {
  Fuel,
  LayoutDashboard,
  Package,
  Receipt,
  Settings,
  BarChart3,
  Truck,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const PRIMARY_NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/loads", label: "Loads", icon: Package },
  { href: "/expenses", label: "Expenses", icon: Receipt },
  { href: "/fuel", label: "Fuel", icon: Fuel },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/truck", label: "Truck", icon: Truck },
  { href: "/settings", label: "Settings", icon: Settings },
];
