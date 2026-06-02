import { defaultUserRole, type UserRole } from "$lib/auth/roles";
import { auth } from "$lib/server/auth";
import { prisma } from "$lib/server/prisma";
import type {
  CreateUserFormData,
  EditUserFormData,
} from "$lib/services/user-editor-form";
import type { UserRecord } from "$lib/services/users";

export async function listUsers(): Promise<UserRecord[]> {
  const users = await prisma.user.findMany({
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

  const brandAssignments =
    users.length === 0
      ? []
      : await prisma.user_brand.findMany({
          where: {
            userId: {
              in: users.map((user) => user.id),
            },
          },
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
        });

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
    role: normalizeRole(user.role),
    brands: brandsByUserId.get(user.id) ?? [],
    createdAt: user.createdAt,
    banned: user.banned ?? false,
  }));
}

export async function createUser(data: CreateUserFormData, headers: Headers) {
  const brandIds = await validateBrandIds(data.brandIds);

  const result = await auth.api.createUser({
    body: {
      email: data.email,
      name: data.name,
      password: data.password,
      role: data.role,
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
        role: data.role,
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

function normalizeRole(role: string | null): UserRole {
  return role === "admin" ? "admin" : defaultUserRole;
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
