import type { UserRole } from "$lib/auth/roles";

export type UserLoginMetric = {
  id: string;
  name: string;
  email: string;
  roles: UserRole[];
  banned: boolean;
  createdAt: Date;
  /** Most recent session creation time, or null when no sessions remain. */
  lastLoginAt: Date | null;
  /** Number of sessions that have not yet expired. */
  activeSessionCount: number;
};
