import { error, redirect } from "@sveltejs/kit";
import {
  canAccessAdminSection,
  hasAnyRole,
  isAdminRole,
  superUserRole,
} from "$lib/auth/roles";
import type { AppPermissions } from "$lib/auth/permissions";
import { auth } from "$lib/server/auth";
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

export function requireAuthenticatedApiUser(event: RequestEvent) {
  if (!event.locals.session || !event.locals.user) {
    error(401, "Unauthorized");
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

/**
 * Page guard for the `/admin` section landing page: redirects to home unless
 * the user holds a role whose tools live under `/admin`. Each admin sub-page
 * still enforces its own `requirePermission`, so this only governs reaching the
 * index — a capability role (e.g. `brandManager`) sees only the cards it can
 * open.
 */
export async function requireAdminSection(event: RequestEvent) {
  const { user, session } = requireAuthenticatedUser(event);

  const role = await getAuthenticatedUserRole(event);

  if (!user || !canAccessAdminSection(role)) {
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

/**
 * Returns whether the current user holds the `superUser` role. Coarse,
 * role-based check (not a permission check) for features reserved for
 * super users, e.g. drilling into another user's generation history.
 */
export async function hasSuperUserRole(event: RequestEvent) {
  return hasAnyRole(await getAuthenticatedUserRole(event), [superUserRole]);
}

/**
 * Page guard: redirects to home unless the user holds the `superUser` role.
 */
export async function requireSuperUser(event: RequestEvent) {
  const { user, session } = requireAuthenticatedUser(event);

  const role = await getAuthenticatedUserRole(event);

  if (!user || !hasAnyRole(role, [superUserRole])) {
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

/**
 * Returns whether the current user's role(s) grant every requested
 * permission. The user's `role` may be a comma-separated list of roles
 * (Better Auth's native multi-role form); `userHasPermission` evaluates the
 * union across all of them.
 */
export async function hasPermission(
  event: RequestEvent,
  permissions: AppPermissions,
) {
  const user = event.locals.user;

  if (!user) {
    return false;
  }

  // Pass the user id so Better Auth evaluates the union across all of the
  // user's stored roles (the `role` column may be a comma-separated list).
  const result = await auth.api.userHasPermission({
    body: { userId: user.id, permissions },
  });

  return result.success;
}

/**
 * Page guard: redirects to home unless the user holds the requested
 * permissions. Additive to `requireAdminUser` — use it on routes that should
 * be gated by capability rather than the coarse admin role.
 */
export async function requirePermission(
  event: RequestEvent,
  permissions: AppPermissions,
) {
  const { user, session } = requireAuthenticatedUser(event);

  if (!(await hasPermission(event, permissions))) {
    redirect(302, "/");
  }

  return { session, user };
}

/**
 * API guard: throws 403 unless the user holds the requested permissions.
 */
export async function requireApiPermission(
  event: RequestEvent,
  permissions: AppPermissions,
) {
  const { user, session } = requireAuthenticatedApiUser(event);

  if (!(await hasPermission(event, permissions))) {
    error(403, "Forbidden");
  }

  return { session, user };
}

/**
 * API guard: throws 403 unless the user is an admin AND holds the requested
 * permissions. Use on API routes that are not behind the `/admin` hooks gate
 * but should still require admin plus a specific capability (e.g. approvals).
 */
export async function requireApiAdminPermission(
  event: RequestEvent,
  permissions: AppPermissions,
) {
  const { user, session } = requireAuthenticatedApiUser(event);

  const role = await getAuthenticatedUserRole(event);

  if (!isAdminRole(role) || !(await hasPermission(event, permissions))) {
    error(403, "Forbidden");
  }

  return { session, user };
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

export function isApiPath(pathname: string) {
  return pathname === "/api" || pathname.startsWith("/api/");
}

export function isAdminPath(pathname: string) {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}
