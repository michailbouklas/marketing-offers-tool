import {
  aggregatorInvoicesRoles,
  aggregatorKpisRoles,
  canAccessAdminSection,
  competitionRoles,
  forecastsRoles,
  googleAnalyticsRoles,
  googleReviewsRoles,
  hasAnyRole,
  parseRoles,
  salesRoles,
  type UserRole,
} from "$lib/auth/roles";
import { roles, type AppPermissions } from "$lib/auth/permissions";
import HouseIcon from "@lucide/svelte/icons/house";
import StoreIcon from "@lucide/svelte/icons/store";
import ShieldCheckIcon from "@lucide/svelte/icons/shield-check";
import ImageIcon from "@lucide/svelte/icons/image";
import PenLineIcon from "@lucide/svelte/icons/pen-line";
import LightbulbIcon from "@lucide/svelte/icons/lightbulb";
import ShieldIcon from "@lucide/svelte/icons/shield";
import TrendingUpIcon from "@lucide/svelte/icons/trending-up";
import StarIcon from "@lucide/svelte/icons/star";
import GaugeIcon from "@lucide/svelte/icons/gauge";
import ChartColumnIcon from "@lucide/svelte/icons/chart-column";
import ChartSplineIcon from "@lucide/svelte/icons/chart-spline";
import ChartLineIcon from "@lucide/svelte/icons/chart-line";
import type { Role } from "better-auth/plugins/access";
import type { Component } from "svelte";

// `roles` lists the role(s) that may see the item. Omit it for items visible
// to everyone. `superUser` is included on capability-gated items since it is
// the admin-equivalent that holds every resource permission. `permission`
// mirrors the server-side `hasPermission` check of the target page.
export type NavLeaf = {
  href: string;
  label: string;
  icon: Component;
  roles?: UserRole[];
  badge?: number;
};

export type NavChild = {
  href: string;
  label: string;
  roles?: UserRole[];
  permission?: AppPermissions;
};

// A group renders as a parent entry with foldable indented sub-items. The
// parent link points at the group's landing page; the chevron toggles.
export type NavGroup = {
  href: string;
  label: string;
  icon: Component;
  roles?: UserRole[];
  badge?: number;
  children: NavChild[];
};

export type NavItem = NavLeaf | NavGroup;

export function isGroup(item: NavItem): item is NavGroup {
  return "children" in item;
}

const allNavItems: NavItem[] = [
  { href: "/", label: "Home", icon: HouseIcon },
  {
    href: "/aggregator-offers",
    label: "Aggregator Offers",
    icon: StoreIcon,
    roles: ["offerEditor", ...aggregatorInvoicesRoles],
    children: [
      {
        href: "/aggregator-offers",
        label: "Offers",
        roles: ["offerEditor", "superUser"],
      },
      {
        href: "/aggregator-offers/invoices",
        label: "Invoices",
        roles: aggregatorInvoicesRoles,
      },
    ],
  },
  {
    href: "/offers-data-quality",
    label: "Data Quality",
    icon: ShieldCheckIcon,
    roles: ["offerEditor", "superUser"],
  },
  {
    href: "/image-generator",
    label: "Image Generator",
    icon: ImageIcon,
    roles: ["admin", "superUser", "brandManager", "imageEditor"],
  },
  {
    href: "/image-generator/inspiration",
    label: "Inspiration",
    icon: LightbulbIcon,
    roles: ["admin", "superUser", "brandManager", "imageEditor"],
  },
  {
    href: "/copywriter",
    label: "Copywriter",
    icon: PenLineIcon,
    roles: ["superUser", "copywriter"],
  },
  {
    href: "/competition",
    label: "Competition",
    icon: TrendingUpIcon,
    roles: competitionRoles,
    children: [
      { href: "/competition", label: "Dashboard" },
      { href: "/competition/offers", label: "Active Offers" },
      {
        href: "/competition/offers/scrape-sessions",
        label: "Scrape Sessions",
        roles: ["superUser"],
      },
      { href: "/competition/restaurants", label: "Restaurants" },
    ],
  },
  {
    href: "/google-reviews",
    label: "Google Reviews",
    icon: StarIcon,
    roles: googleReviewsRoles,
    children: [
      { href: "/google-reviews", label: "Dashboard" },
      { href: "/google-reviews/reviews", label: "Reviews" },
      { href: "/google-reviews/businesses", label: "Businesses" },
      {
        href: "/google-reviews/negative-reviews-categories",
        label: "Negative review categories",
      },
    ],
  },
  {
    href: "/google-analytics",
    label: "Google Analytics",
    icon: ChartLineIcon,
    roles: googleAnalyticsRoles,
  },
  {
    href: "/aggregator-kpis",
    label: "Aggregator KPIs",
    icon: GaugeIcon,
    roles: aggregatorKpisRoles,
    children: [
      { href: "/aggregator-kpis", label: "Overview" },
      { href: "/aggregator-kpis/metrics", label: "Metrics" },
      { href: "/aggregator-kpis/closures", label: "Closures" },
      {
        href: "/aggregator-kpis/order-rejections",
        label: "Order Rejections",
      },
      { href: "/aggregator-kpis/punctuality", label: "Punctuality" },
      { href: "/aggregator-kpis/pro-growth", label: "Pro Growth" },
      { href: "/aggregator-kpis/ratings", label: "Ratings" },
      { href: "/aggregator-kpis/reviews", label: "Reviews" },
      {
        href: "/aggregator-kpis/sessions",
        label: "Sessions",
        roles: ["admin", "superUser"],
      },
    ],
  },
  {
    href: "/sales/dashboard",
    label: "Sales",
    icon: ChartColumnIcon,
    roles: salesRoles,
    children: [
      { href: "/sales/dashboard", label: "Dashboard" },
      { href: "/sales/explore", label: "Explore" },
      { href: "/sales/hours", label: "Busy & dead hours" },
      { href: "/sales/offers", label: "Offers" },
      { href: "/sales/chat", label: "Chat" },
    ],
  },
  {
    href: "/forecasts",
    label: "Sales Forecasts",
    icon: ChartSplineIcon,
    roles: forecastsRoles,
    children: [
      { href: "/forecasts", label: "Overview" },
      { href: "/forecasts/compare", label: "Compare models" },
      { href: "/forecasts/validation", label: "Validation" },
    ],
  },
];

// Same checks as the cards on /admin (src/routes/admin/+page.server.ts);
// keep the two in sync when adding an admin tool.
const adminChildren: NavChild[] = [
  { href: "/admin", label: "Overview" },
  {
    href: "/admin/pending-submissions",
    label: "Pending submissions",
    permission: { submission: ["approve"] },
  },
  {
    href: "/admin/dim-offers",
    label: "Dim offers explorer",
    permission: { submission: ["approve"] },
  },
  { href: "/admin/users", label: "Users", permission: { user: ["list"] } },
  {
    href: "/admin/features",
    label: "Release notes",
    permission: { release: ["manage"] },
  },
  { href: "/admin/brands", label: "Brands", permission: { brand: ["manage"] } },
  {
    href: "/admin/brand-assignments",
    label: "Store → brand assignments",
    permission: { brand: ["manage"] },
  },
  {
    href: "/admin/image-generator-usage",
    label: "Image generator usage",
    permission: { imageGenerator: ["view-usage"] },
  },
  {
    href: "/admin/prompt-gallery",
    label: "Prompt gallery",
    permission: { promptGallery: ["manage"] },
  },
  {
    href: "/admin/metrics",
    label: "User metrics",
    permission: { metrics: ["view"] },
  },
  { href: "/admin/chat-usage", label: "AI chat usage", roles: ["superUser"] },
  {
    href: "/admin/live-monitoring",
    label: "Live monitoring",
    roles: ["superUser"],
  },
  {
    href: "/admin/urls-to-scrape",
    label: "URLs to scrape",
    permission: { urlsToScrape: ["manage"] },
  },
  {
    href: "/admin/google-reviews",
    label: "Google Reviews",
    permission: { googleReviews: ["manage"] },
  },
  {
    href: "/admin/skills",
    label: "Agent skills",
    permission: { skill: ["manage"] },
  },
  {
    href: "/admin/recipes",
    label: "Recipes",
    permission: { recipe: ["manage"] },
  },
];

// Browser-side twin of `userHasPermissionById`: Better Auth grants the union
// of the user's roles, so any role authorizing the request is enough.
function hasRolePermission(
  role: string | null | undefined,
  permission: AppPermissions,
) {
  return parseRoles(role).some(
    // Widened: each role narrows `authorize` to its own resources.
    (parsed) => (roles[parsed] as Role).authorize(permission).success,
  );
}

function canSee(
  role: string | null | undefined,
  item: { roles?: UserRole[]; permission?: AppPermissions },
) {
  return (
    (!item.roles || hasAnyRole(role, item.roles)) &&
    (!item.permission || hasRolePermission(role, item.permission))
  );
}

/**
 * Navigation filtered for `role`. The sidebar shows Admin as a single link
 * (`adminChildren: false`); the command palette lists every admin tool.
 */
export function visibleNavItems(
  role: string | null | undefined,
  { adminChildren: withAdminChildren = false } = {},
): NavItem[] {
  const items = allNavItems
    .filter((item) => canSee(role, item))
    .map((item) =>
      isGroup(item)
        ? {
            ...item,
            children: item.children.filter((child) => canSee(role, child)),
          }
        : item,
    );

  if (!canAccessAdminSection(role)) {
    return items;
  }

  return [
    ...items,
    withAdminChildren
      ? {
          href: "/admin",
          label: "Admin",
          icon: ShieldIcon,
          children: adminChildren.filter((child) => canSee(role, child)),
        }
      : { href: "/admin", label: "Admin", icon: ShieldIcon },
  ];
}
