import type { MemberRole } from "./types";

export const PERMISSION_IDS = [
  "manage_team",
  "manage_billing",
  "manage_account",
  "manage_business",
  "manage_fleet",
  "manage_drivers",
  "manage_driver_settlements",
  "manage_loads",
  "manage_expenses",
  "manage_fuel",
  "manage_maintenance",
  "manage_finances",
] as const;

export type Permission = (typeof PERMISSION_IDS)[number];

export interface RoleDefinition {
  label: string;
  description: string;
}

export const ASSIGNABLE_ROLES = ["ADMIN", "BOOKKEEPER", "DISPATCHER", "VIEWER"] as const;
export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

export const ROLE_DEFINITIONS: Record<MemberRole, RoleDefinition> = {
  OWNER: {
    label: "Owner",
    description: "Everything, including billing, members and account ownership.",
  },
  ADMIN: {
    label: "Admin",
    description: "All operations and settings, without billing or member management.",
  },
  BOOKKEEPER: {
    label: "Bookkeeper",
    description: "Expenses, fuel, driver pay, settlements, reserves and financial reporting.",
  },
  DISPATCHER: {
    label: "Dispatcher",
    description: "Loads, drivers, fuel and truck service records.",
  },
  VIEWER: {
    label: "Viewer",
    description: "Read-only access to the workspace.",
  },
};

const PERMISSIONS: Record<MemberRole, ReadonlySet<Permission>> = {
  OWNER: new Set<Permission>([
    "manage_team",
    "manage_billing",
    "manage_account",
    "manage_business",
    "manage_fleet",
    "manage_drivers",
    "manage_driver_settlements",
    "manage_loads",
    "manage_expenses",
    "manage_fuel",
    "manage_maintenance",
    "manage_finances",
  ]),
  ADMIN: new Set<Permission>([
    "manage_business",
    "manage_fleet",
    "manage_drivers",
    "manage_driver_settlements",
    "manage_loads",
    "manage_expenses",
    "manage_fuel",
    "manage_maintenance",
    "manage_finances",
  ]),
  BOOKKEEPER: new Set<Permission>([
    "manage_expenses",
    "manage_fuel",
    "manage_finances",
    "manage_driver_settlements",
  ]),
  DISPATCHER: new Set<Permission>([
    "manage_loads",
    "manage_fuel",
    "manage_maintenance",
    "manage_drivers",
  ]),
  VIEWER: new Set<Permission>(),
};

export function roleCan(role: MemberRole, permission: Permission): boolean {
  return PERMISSIONS[role].has(permission);
}

export function permissionRefusal(role: MemberRole, permission: Permission): string {
  const label = ROLE_DEFINITIONS[role].label;
  if (permission === "manage_billing") return "Only the workspace owner can manage billing.";
  if (permission === "manage_team") return "Only the workspace owner can manage team members.";
  if (permission === "manage_account") return "Only the workspace owner can reset or delete the account.";
  return `${label} access does not allow that change.`;
}
