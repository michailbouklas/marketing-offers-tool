export const userRoles = ["user", "admin"] as const;

export type UserRole = (typeof userRoles)[number];

export const defaultUserRole: UserRole = "user";
export const adminUserRole: UserRole = "admin";

export function isAdminRole(role: string | null | undefined): role is "admin" {
  return role === adminUserRole;
}
