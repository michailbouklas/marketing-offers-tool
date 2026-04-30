import { redirect } from "@sveltejs/kit";
import { isAdminRole } from "$lib/auth/roles";
import { prisma } from "$lib/server/prisma";
import type { RequestEvent } from "@sveltejs/kit";

export function requireAuthenticatedUser(event: RequestEvent) {
  if (!event.locals.session) {
    redirect(302, "/login");
  }

  return {
    session: event.locals.session,
    user: event.locals.user,
  };
}

export async function requireAdminUser(event: RequestEvent) {
  const { user, session } = requireAuthenticatedUser(event);

  const role = await getAuthenticatedUserRole(event);

  if (!user || !isAdminRole(role)) {
    redirect(302, "/");
  }

  return {
    session,
    user: {
      ...user,
      role,
    },
  };
}

export async function getAuthenticatedUserRole(event: RequestEvent) {
  const user = event.locals.user;

  if (!user) {
    return null;
  }

  if (user.role) {
    return user.role;
  }

  const rows = await prisma.$queryRaw<{ role: string | null }[]>`
    SELECT "role"
    FROM "user"
    WHERE "id" = ${user.id}
    LIMIT 1
  `;

  const role = rows[0]?.role ?? null;
  event.locals.user = {
    ...user,
    role,
  };

  return role;
}

export function isPublicPath(pathname: string) {
  return pathname === "/login" || pathname.startsWith("/api/auth");
}

export function isAdminPath(pathname: string) {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}
