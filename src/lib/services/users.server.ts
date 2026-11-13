import { defaultUserRole, parseRoles, type UserRole } from "$lib/auth/roles";
import { auth } from "$lib/server/auth";
import { prisma } from "$lib/server/prisma";
import type { Prisma } from "../../generated/prisma/client";
import type {
  CreateUserFormData,
  EditUserFormData,
} from "$lib/services/user-editor-form";
import type { UserRecord } from "$lib/services/users";

/** Total number of internal user accounts. Cheap count for dashboard widgets. */
export async function countUsers(): Promise<number> {
  return prisma.user.count();
}

/**
 * Minimal identity record for a single user, e.g. for page headers that show
 * whose data is being viewed. Returns `null` when the user does not exist.
 */
export async function getUserSummaryById(
  id: string,
): Promise<{ id: string; name: string; email: string } | null> {
  return prisma.user.findUnique({
    where: { id },
    select: { id: true, name: true, email: true },
  });
}

export async function getUserById(id: string): Promise<UserRecord | null> {
  const [user] = await listUsers({ id });
  return user ?? null;
}

/** Deactivate (permanent ban + session revoke) or reactivate an account. */
export async function setUserBanned(
  userId: string,
  banned: boolean,
  headers: Headers,
) {
  if (banned) {
    await auth.api.banUser({
      body: { userId, banReason: "Deactivated: left the organisation" },
      headers,
    });
  } else {
    await auth.api.unbanUser({ body: { userId }, headers });
  }
}

export async function listUsers(
  where?: Prisma.userWhereInput,
): Promise<UserRecord[]> {
  const users = await prisma.user.findMany({
    where,
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      createdAt: true,
      banned: true,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  const userIds = users.map((user) => user.id);
  const [brandAssignments, lastActiveByUserId] =
    users.length === 0
      ? [[], new Map<string, Date>()]
      : await Promise.all([
          prisma.user_brand.findMany({
            where: { userId: { in: userIds } },
            select: {
              userId: true,
              brand: {
                select: {
                  id: true,
                  name: true,
                  alias: true,
                  slug: true,
                  active: true,
                },
              },
            },
          }),
          getLastActiveByUserId(userIds),
        ]);

  const brandsByUserId = new Map<string, UserRecord["brands"]>();

  for (const assignment of brandAssignments) {
    const brands = brandsByUserId.get(assignment.userId) ?? [];
    brands.push(assignment.brand);
    brandsByUserId.set(assignment.userId, brands);
  }

  for (const brands of brandsByUserId.values()) {
    brands.sort((left, right) => left.name.localeCompare(right.name));
  }

  return users.map((user) => ({
    id: user.id,
    name: user.name,
    email: user.email,
    roles: normalizeRoles(user.role),
    brands: brandsByUserId.get(user.id) ?? [],
    createdAt: user.createdAt,
    banned: user.banned ?? false,
    lastActiveAt: lastActiveByUserId.get(user.id) ?? null,
  }));
}

/**
 * Latest page-view heartbeat per user. Raw `page_view` rows are purged after
 * rollup, so the permanent `user_visit_daily` rollup is read too.
 */
async function getLastActiveByUserId(userIds: string[]) {
  const where = { userId: { in: userIds } };
  const [raw, rolledUp] = await Promise.all([
    prisma.page_view.groupBy({
      by: ["userId"],
      where,
      _max: { lastSeenAt: true },
    }),
    prisma.user_visit_daily.groupBy({
      by: ["userId"],
      where,
      _max: { lastSeenAt: true },
    }),
  ]);

  const lastActive = new Map<string, Date>();
  for (const row of [...raw, ...rolledUp]) {
    const seen = row._max.lastSeenAt;
    const current = lastActive.get(row.userId);
    if (seen && (!current || seen > current)) {
      lastActive.set(row.userId, seen);
    }
  }
  return lastActive;
}

export async function createUser(data: CreateUserFormData, headers: Headers) {
  const brandIds = await validateBrandIds(data.brandIds);

  const result = await auth.api.createUser({
    body: {
      email: data.email,
      name: data.name,
      password: data.password,
      role: data.roles,
    },
    headers,
  });

  await replaceUserBrandAssignments(result.user.id, brandIds);

  return result;
}

export async function updateUser(
  id: string,
  data: EditUserFormData,
  headers: Headers,
) {
  const brandIds = await validateBrandIds(data.brandIds);

  const user = await auth.api.adminUpdateUser({
    body: {
      userId: id,
      data: {
        name: data.name,
        email: data.email,
        role: data.roles,
      },
    },
    headers,
  });

  if (data.password) {
    await auth.api.setUserPassword({
      body: {
        userId: id,
        newPassword: data.password,
      },
      headers,
    });
  }

  await replaceUserBrandAssignments(id, brandIds);

  return user;
}

export function normalizeRoles(role: string | null): UserRole[] {
  const roles = parseRoles(role);
  return roles.length > 0 ? roles : [defaultUserRole];
}

async function validateBrandIds(rawBrandIds: string[]) {
  const brandIds = Array.from(
    new Set(
      rawBrandIds
        .filter((brandId) => /^\d+$/.test(brandId))
        .map((brandId) => Number.parseInt(brandId, 10)),
    ),
  );

  if (brandIds.length === 0) {
    return [];
  }

  const brands = await prisma.brand.findMany({
    where: {
      id: {
        in: brandIds,
      },
    },
    select: {
      id: true,
    },
  });

  if (brands.length !== brandIds.length) {
    throw new Error("One or more selected brands no longer exist.");
  }

  return brandIds;
}

async function replaceUserBrandAssignments(userId: string, brandIds: number[]) {
  await prisma.$transaction(async (tx) => {
    await tx.user_brand.deleteMany({
      where: {
        userId,
      },
    });

    if (brandIds.length === 0) {
      return;
    }

    await tx.user_brand.createMany({
      data: brandIds.map((brandId) => ({
        userId,
        brandId,
      })),
      skipDuplicates: true,
    });
  });
}

/** Unexpired sessions, newest activity first. Never selects the token. */
export async function listUserSessions(userId: string) {
  return prisma.session.findMany({
    where: { userId, expiresAt: { gt: new Date() } },
    select: {
      id: true,
      createdAt: true,
      updatedAt: true,
      expiresAt: true,
      ipAddress: true,
      userAgent: true,
      impersonatedBy: true,
    },
    orderBy: { updatedAt: "desc" },
  });
}

export async function revokeUserSessions(userId: string, headers: Headers) {
  await auth.api.revokeUserSessions({ body: { userId }, headers });
}

/** What the user produced since `since`; each count uses a `userId` index. */
export async function getUserWorkCounts(userId: string, since: Date) {
  const [images, copies, chats, offerChanges, submissions, approvals] =
    await Promise.all([
      prisma.generatedImage.count({
        where: { userId, createdAt: { gte: since } },
      }),
      prisma.generatedCopy.count({
        where: { userId, createdAt: { gte: since } },
      }),
      prisma.ai_chat_threads.count({
        where: { resourceId: userId, createdAt: { gte: since } },
      }),
      prisma.dim_offers_audit.count({
        where: { changed_by: userId, changed_at: { gte: since } },
      }),
      prisma.dim_offers_staging.count({
        where: { submitted_by: userId, submitted_at: { gte: since } },
      }),
      prisma.dim_offers_staging.count({
        where: { approved_by: userId, approved_at: { gte: since } },
      }),
    ]);

  return { images, copies, chats, offerChanges, submissions, approvals };
}
