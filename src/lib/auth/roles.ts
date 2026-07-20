export const userRoles = [
  "user",
  "admin",
  "approver",
  "usageViewer",
  "userManager",
  "brandManager",
  "offerEditor",
  "imageEditor",
  "copywriter",
  "analyticsViewer",
  "superUser",
] as const;

export type UserRole = (typeof userRoles)[number];

export const defaultUserRole: UserRole = "user";
export const adminUserRole: UserRole = "admin";
export const superUserRole: UserRole = "superUser";

/**
 * Roles that satisfy the coarse `/admin` gate. `superUser` is an
 * admin-equivalent that additionally holds every resource permission.
 */
export const adminRoles: UserRole[] = [adminUserRole, superUserRole];

/**
 * Roles whose tools live under the `/admin` section. Holding any of these lets
 * a user enter `/admin` (the hooks gate + the index page); each sub-page still
 * enforces its own fine-grained `requirePermission`, so a capability role only
 * reaches the specific tool(s) it grants. `brandManager` is included so brand
 * managers can manage guidelines and reference assets without being full
 * admins.
 */
export const adminSectionRoles: UserRole[] = [
  adminUserRole,
  superUserRole,
  "approver",
  "usageViewer",
  "userManager",
  "brandManager",
];

/**
 * Roles that may access the `/competition` section (competitive analytics
 * sourced from the competition-scraper ClickHouse replica). `superUser` is
 * included as the admin-equivalent that holds every resource permission.
 */
export const competitionRoles: UserRole[] = ["analyticsViewer", superUserRole];

/**
 * Roles that may access the `/google-reviews` section (Google reviews
 * analytics sourced from the google-maps-scraper ClickHouse replica).
 * `superUser` is included as the admin-equivalent that holds every resource
 * permission.
 */
export const googleReviewsRoles: UserRole[] = [
  "analyticsViewer",
  superUserRole,
];

/**
 * Roles that may access the `/aggregator-kpis` section (aggregator merchant
 * performance KPIs sourced from the merchant-scrapes Postgres database).
 * Unlike the other analytics sections, `admin` is included explicitly — the
 * marker admin role is granted the matching `aggregatorKpis: ["view"]`
 * permission in `permissions.ts`. `superUser` is the admin-equivalent that
 * holds every resource permission.
 */
export const aggregatorKpisRoles: UserRole[] = [
  "analyticsViewer",
  adminUserRole,
  superUserRole,
];

/**
 * Roles that may access the `/aggregator-offers/invoices` section (processed
 * aggregator invoices ingested into the main Postgres database). Like the
 * KPI section, `admin` is included explicitly — the marker admin role is
 * granted the matching `aggregatorInvoices: ["view"]` permission in
 * `permissions.ts`. `superUser` is the admin-equivalent that holds every
 * resource permission.
 */
export const aggregatorInvoicesRoles: UserRole[] = [
  "analyticsViewer",
  adminUserRole,
  superUserRole,
];

export const roleLabels: Record<UserRole, string> = {
  user: "User",
  admin: "Admin",
  approver: "Approver",
  usageViewer: "Usage Viewer",
  userManager: "User Manager",
  brandManager: "Brand Manager",
  offerEditor: "Offer Editor",
  imageEditor: "Image Editor",
  copywriter: "Copywriter",
  analyticsViewer: "Analytics Viewer",
  superUser: "Super User",
};

/**
 * A user's `role` column may hold several roles as a comma-separated string
 * (Better Auth's native multi-role representation, e.g. "admin,approver").
 * Parse it into the known roles, dropping anything unrecognised.
 */
export function parseRoles(role: string | null | undefined): UserRole[] {
  if (!role) {
    return [];
  }

  const known = userRoles as readonly string[];

  return role
    .split(",")
    .map((value) => value.trim())
    .filter((value): value is UserRole => known.includes(value));
}

export function isAdminRole(role: string | null | undefined): boolean {
  return parseRoles(role).some((parsed) => adminRoles.includes(parsed));
}

/**
 * Returns whether any of the user's role(s) appear in `allowed`. Used for
 * coarse, role-based UI gating (e.g. which sidebar items to render) where a
 * full permission check is unnecessary or not browser-safe.
 */
export function hasAnyRole(
  role: string | null | undefined,
  allowed: readonly UserRole[],
): boolean {
  return parseRoles(role).some((parsed) => allowed.includes(parsed));
}

/**
 * Whether the user may enter the `/admin` section at all. True for the marker
 * admin roles and for any capability role whose tool lives under `/admin`.
 * Used by the hooks gate, the admin index page, and the sidebar so a brand
 * manager (or other capability holder) is not bounced to `/`.
 */
export function canAccessAdminSection(
  role: string | null | undefined,
): boolean {
  return hasAnyRole(role, adminSectionRoles);
}
