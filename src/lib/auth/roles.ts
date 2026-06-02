export const userRoles = [
  "user",
  "admin",
  "approver",
  "usageViewer",
  "userManager",
] as const;

export type UserRole = (typeof userRoles)[number];

export const defaultUserRole: UserRole = "user";
export const adminUserRole: UserRole = "admin";

export const roleLabels: Record<UserRole, string> = {
  user: "User",
  admin: "Admin",
  approver: "Approver",
  usageViewer: "Usage Viewer",
  userManager: "User Manager",
};

/**
 * A user's `role` column may hold several roles as a comma-separated string
 * (Better Auth's native multi-role representation, e.g. "admin,approver").
 * Parse it into the known roles, dropping anything unrecognised.
 */
export function parseRoles(role: string | null | undefined): UserRole[] {
  if (!role) {
    return [];
  }

  const known = userRoles as readonly string[];

  return role
    .split(",")
    .map((value) => value.trim())
    .filter((value): value is UserRole => known.includes(value));
}

export function isAdminRole(role: string | null | undefined): boolean {
  return parseRoles(role).includes(adminUserRole);
}
