import { prisma } from "$lib/server/prisma";
import { normalizeRoles } from "$lib/services/users.server";
import type { UserLoginMetric } from "$lib/services/user-metrics";

/**
 * Per-user login metrics for the admin metrics page. "Last login" is derived
 * from the most recent Better Auth session, so users whose sessions have been
 * pruned report `null` rather than a historical timestamp.
 */
export async function getUserLoginMetrics(): Promise<UserLoginMetric[]> {
  const now = new Date();

  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      banned: true,
      createdAt: true,
      sessions: {
        select: { createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
      _count: {
        select: {
          sessions: {
            where: { expiresAt: { gt: now } },
          },
        },
      },
    },
  });

  return users
    .map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      roles: normalizeRoles(user.role),
      banned: user.banned ?? false,
      createdAt: user.createdAt,
      lastLoginAt: user.sessions[0]?.createdAt ?? null,
      activeSessionCount: user._count.sessions,
    }))
    .sort(
      // Most recent login first; users who never logged in sort last.
      (left, right) =>
        (right.lastLoginAt?.getTime() ?? 0) -
        (left.lastLoginAt?.getTime() ?? 0),
    );
}
