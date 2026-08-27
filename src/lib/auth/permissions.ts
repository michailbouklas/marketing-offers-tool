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
  copywriter: ["generate"],
  submission: ["approve", "reject"],
  brand: ["manage"],
  offer: ["edit"],
  metrics: ["view"],
  promptGallery: ["manage"],
  competition: ["view"],
  googleReviews: ["view"],
  aggregatorKpis: ["view"],
  aggregatorInvoices: ["view"],
  sales: ["view"],
  forecasts: ["view"],
  notifications: ["run"],
  urlsToScrape: ["manage"],
} as const;

export const ac = createAccessControl(statement);

/**
 * Granted permissions per role. Privileged capabilities are split into small
 * additive roles so an admin can be granted exactly the powers they need:
 *
 * - `admin` is a marker role (recognised by `isAdminRole` / `adminRoles` for
 *   the coarse `/admin` gate). It grants no resource permissions EXCEPT
 *   `brand: ["manage"]`, so that admins can reach the brand-assignment tool
 *   (and the rest of the brand-management section, which shares this
 *   permission). For every other gated capability an admin must still hold the
 *   matching capability role.
 * - `approver` — act on gap submissions.
 * - `usageViewer` — view cross-user image-generation usage analytics.
 * - `userManager` — manage users (Better Auth's full user/session statements,
 *   which its admin endpoints check internally).
 * - `brandManager` — manage brand guidelines, reference assets, and the
 *   inspiration prompt gallery.
 * - `offerEditor` — create and edit aggregator offers in the registry.
 * - `imageEditor` — generate images in the image generator.
 * - `copywriter` — generate marketing copy in the copywriter studio.
 * - `analyticsViewer` — view the `/competition`, `/google-reviews`,
 *   `/aggregator-kpis`, `/aggregator-offers/invoices`, `/sales/chat`, and
 *   `/forecasts` analytics sections.
 * - `superUser` — admin-equivalent that holds every resource permission.
 *
 * Explicit empty action arrays (rather than `{}`) keep a role's resource keys
 * concrete instead of `never`, which is required for assignability to Better
 * Auth's `Role` type.
 */
export const roles = {
  user: ac.newRole({
    user: [],
    session: [],
    imageGenerator: [],
    submission: [],
  }),
  admin: ac.newRole({
    user: [],
    session: [],
    imageGenerator: [],
    submission: [],
    brand: ["manage"],
    urlsToScrape: ["manage"],
    aggregatorKpis: ["view"],
    aggregatorInvoices: ["view"],
    sales: ["view"],
    forecasts: ["view"],
  }),
  approver: ac.newRole({
    submission: ["approve", "reject"],
  }),
  usageViewer: ac.newRole({
    imageGenerator: ["view-usage"],
  }),
  userManager: ac.newRole({
    ...adminAc.statements,
  }),
  brandManager: ac.newRole({
    brand: ["manage"],
    promptGallery: ["manage"],
    urlsToScrape: ["manage"],
  }),
  offerEditor: ac.newRole({
    offer: ["edit"],
  }),
  imageEditor: ac.newRole({
    imageGenerator: ["generate"],
  }),
  copywriter: ac.newRole({
    copywriter: ["generate"],
  }),
  analyticsViewer: ac.newRole({
    competition: ["view"],
    googleReviews: ["view"],
    aggregatorKpis: ["view"],
    aggregatorInvoices: ["view"],
    sales: ["view"],
    forecasts: ["view"],
  }),
  superUser: ac.newRole({
    ...adminAc.statements,
    imageGenerator: ["generate", "view-usage"],
    copywriter: ["generate"],
    submission: ["approve", "reject"],
    brand: ["manage"],
    offer: ["edit"],
    metrics: ["view"],
    promptGallery: ["manage"],
    competition: ["view"],
    googleReviews: ["view"],
    aggregatorKpis: ["view"],
    aggregatorInvoices: ["view"],
    sales: ["view"],
    forecasts: ["view"],
    notifications: ["run"],
    urlsToScrape: ["manage"],
  }),
} satisfies Record<UserRole, Role>;

/** Permission map accepted by `userHasPermission` / `checkRolePermission`. */
export type AppPermissions = {
  [Resource in keyof typeof statement]?: (typeof statement)[Resource][number][];
};
