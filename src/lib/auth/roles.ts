export const userRoles = [
  "user",
  "admin",
  "approver",
  "usageViewer",
  "userManager",
  "brandManager",
  "offerEditor",
  "imageEditor",
  "superUser",
] as const;

export type UserRole = (typeof userRoles)[number];

export const defaultUserRole: UserRole = "user";
export const adminUserRole: UserRole = "admin";
export const superUserRole: UserRole = "superUser";

/**
 * Roles that satisfy the coarse `/admin` gate. `superUser` is an
 * admin-equivalent that additionally holds every resource permission.
 */
export const adminRoles: UserRole[] = [adminUserRole, superUserRole];

export const roleLabels: Record<UserRole, string> = {
  user: "User",
  admin: "Admin",
  approver: "Approver",
  usageViewer: "Usage Viewer",
  userManager: "User Manager",
  brandManager: "Brand Manager",
  offerEditor: "Offer Editor",
  imageEditor: "Image Editor",
  superUser: "Super User",
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
  return parseRoles(role).some((parsed) => adminRoles.includes(parsed));
}

/**
 * Returns whether any of the user's role(s) appear in `allowed`. Used for
 * coarse, role-based UI gating (e.g. which sidebar items to render) where a
 * full permission check is unnecessary or not browser-safe.
 */
export function hasAnyRole(
  role: string | null | undefined,
  allowed: readonly UserRole[],
): boolean {
  return parseRoles(role).some((parsed) => allowed.includes(parsed));
}
