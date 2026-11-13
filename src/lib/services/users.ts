import type { UserRole } from "$lib/auth/roles";
import type { BrandOption } from "$lib/services/brands";

export type UserRecord = {
  id: string;
  name: string;
  email: string;
  roles: UserRole[];
  brands: BrandOption[];
  createdAt: Date;
  banned: boolean;
  /** Latest page-view heartbeat; null if never recorded. */
  lastActiveAt: Date | null;
};

const DAY_MS = 86_400_000;

/** Days without activity before an account counts as inactive. */
export const INACTIVE_AFTER_DAYS = 30;

export type UserStatus = "active" | "inactive" | "never" | "deactivated";

export const userStatusLabels: Record<UserStatus, string> = {
  active: "Active",
  inactive: `Inactive ${INACTIVE_AFTER_DAYS}+ days`,
  never: "Never signed in",
  deactivated: "Deactivated",
};

/** Deactivation wins over activity; "never" means no recorded page view. */
export function getUserStatus(user: UserRecord, now: Date): UserStatus {
  if (user.banned) {
    return "deactivated";
  }
  if (!user.lastActiveAt) {
    return "never";
  }
  return now.getTime() - user.lastActiveAt.getTime() >
    INACTIVE_AFTER_DAYS * DAY_MS
    ? "inactive"
    : "active";
}

/** Headline counts for the users list; deactivated accounts are excluded from activity. */
export function summarizeUsers(users: UserRecord[], now: Date) {
  const activeWithin = (days: number) =>
    users.filter(
      (user) =>
        !user.banned &&
        user.lastActiveAt !== null &&
        now.getTime() - user.lastActiveAt.getTime() <= days * DAY_MS,
    ).length;

  return {
    total: users.length,
    active7d: activeWithin(7),
    active30d: activeWithin(30),
    deactivated: users.filter((user) => user.banned).length,
    never: users.filter((user) => !user.banned && !user.lastActiveAt).length,
  };
}
