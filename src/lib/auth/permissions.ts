import { createAccessControl, type Role } from "better-auth/plugins/access";
import { adminAc, defaultStatements } from "better-auth/plugins/admin/access";
import type { UserRole } from "$lib/auth/roles";

/**
 * Access-control statement shared by the server auth instance and the auth
 * client. Spreads Better Auth's built-in `user`/`session` statements and adds
 * the app-specific resources we want to gate independently.
 *
 * This module must stay browser-safe (no server-only imports) because the
 * client plugin imports the same `ac` + `roles`.
 */
export const statement = {
  ...defaultStatements,
  imageGenerator: ["generate", "view-usage"],
  submission: ["approve", "reject"],
} as const;

export const ac = createAccessControl(statement);

/**
 * Granted permissions per role. `admin` keeps full control over the Better
 * Auth defaults plus image generation, but deliberately does NOT include
 * `submission` — approval is a separately-grantable capability (the `approver`
 * role), so an admin can exist without approval rights once approval routes
 * are switched to a permission check.
 */
export const roles = {
  // Explicit empty action arrays (rather than `{}`) keep the role's resource
  // keys concrete instead of `never`, which is required for the role to be
  // assignable to Better Auth's `Role` type.
  user: ac.newRole({
    user: [],
    session: [],
    imageGenerator: [],
    submission: [],
  }),
  admin: ac.newRole({
    ...adminAc.statements,
    imageGenerator: ["generate", "view-usage"],
  }),
  approver: ac.newRole({
    submission: ["approve", "reject"],
  }),
} satisfies Record<UserRole, Role>;

/** Permission map accepted by `userHasPermission` / `checkRolePermission`. */
export type AppPermissions = {
  [Resource in keyof typeof statement]?: (typeof statement)[Resource][number][];
};
