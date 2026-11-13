import { z } from "zod";
import { hasAnyRole, salesRoles, type UserRole } from "$lib/auth/roles";
import type { GapListItem } from "$lib/services/offers-data-quality";
import {
  shiftDays,
  startOfWeek,
  type SalesMetricCompare,
} from "$lib/services/sales-dashboard";
import type { DeliveryTotals } from "$lib/services/sales-delivery";
import type { OfferVerdict } from "$lib/services/sales-offers";

/**
 * Home dashboard widget registry (browser-safe). Each widget declares who may
 * see it and its own settings; admin and superUser see every widget. A user's
 * layout lives in `user.meta.preferences["home.dashboard"]`.
 */

export const DASHBOARD_LAYOUT_PREFERENCE = "home.dashboard";

export const salesPeriods = ["wtd", "mtd", "ytd", "last7", "last30"] as const;
export type SalesPeriod = (typeof salesPeriods)[number];

export const SALES_PERIOD_LABELS: Record<SalesPeriod, string> = {
  wtd: "Week to date",
  mtd: "Month to date",
  ytd: "Year to date",
  last7: "Last 7 days",
  last30: "Last 30 days",
};

const noSettings = z.object({});
export const salesSettings = z.object({
  /** Lowercase brand alias; null = the user's first brand in scope. */
  brand: z.string().max(100).nullable().default(null),
  period: z.enum(salesPeriods).default("wtd"),
});
export type SalesWidgetSettings = z.infer<typeof salesSettings>;

/* Data each widget's server loader streams to the page. */

export type GapsWidgetData = {
  href: string;
  total: number;
  items: Pick<
    GapListItem,
    "dq_id" | "trde_item" | "item_name" | "brand" | "status"
  >[];
};

export type SalesScoped = {
  href: string;
  brandName: string;
  from: string;
  to: string;
};

export type SalesWidgetData = SalesScoped & { range: SalesMetricCompare };

export type DeliveryWidgetData = SalesScoped & {
  range: DeliveryTotals;
  channels: { channel: string; net: number; share: number }[];
};

export type OffersWidgetData = SalesScoped & {
  verdicts: Partial<Record<OfferVerdict, number>>;
  top: {
    code: string;
    name: string;
    orders: number;
    offerNet: number;
    verdict: OfferVerdict;
  }[];
};

/** Null data = the user has no brands to show. */
export type WidgetDataMap = {
  "open-gaps": GapsWidgetData | null;
  "awaiting-approval": GapsWidgetData | null;
  "sales-summary": SalesWidgetData | null;
  "delivery-summary": DeliveryWidgetData | null;
  "offers-summary": OffersWidgetData | null;
};

export type WidgetResult<T> =
  | { data: T; error: null }
  | { data: null; error: string };

const definitions = {
  "open-gaps": {
    title: "My open gaps",
    description: "Offers missing pricing data for your brands.",
    roles: ["offerEditor"],
    settings: noSettings,
  },
  "awaiting-approval": {
    title: "Awaiting approval",
    description: "Submitted gap fixes waiting for review.",
    roles: ["approver"],
    settings: noSettings,
  },
  "sales-summary": {
    title: "Sales",
    description: "Net sales, transactions and ticket vs last year.",
    roles: salesRoles,
    settings: salesSettings,
  },
  "delivery-summary": {
    title: "Delivery performance",
    description: "Aggregator and delivery channel sales.",
    roles: salesRoles,
    settings: salesSettings,
  },
  "offers-summary": {
    title: "Offers performance",
    description: "Offer value verdicts and top offers.",
    roles: salesRoles,
    settings: salesSettings,
  },
} satisfies Record<
  string,
  {
    title: string;
    description: string;
    roles: UserRole[];
    settings: z.ZodType;
  }
>;

export type WidgetType = keyof typeof definitions;
export const widgetTypes = Object.keys(definitions) as WidgetType[];
export const widgetDefinitions = definitions;

export function hasSalesSettings(type: WidgetType): boolean {
  return definitions[type].settings === salesSettings;
}

export function canSeeWidget(
  role: string | null | undefined,
  type: WidgetType,
): boolean {
  return hasAnyRole(role, [...definitions[type].roles, "admin", "superUser"]);
}

export type DashboardWidget = {
  /** One instance per type, so the type doubles as the dnd item id. */
  id: WidgetType;
  settings: Record<string, unknown>;
};

/** The shape accepted from the client / storage before normalising. */
export const dashboardLayoutSchema = z.object({
  widgets: z
    .array(z.object({ id: z.string().max(50), settings: z.unknown() }))
    .max(20),
});

function defaultSettings(type: WidgetType): Record<string, unknown> {
  return definitions[type].settings.parse({});
}

/**
 * Saved (or posted) layout -> the layout this role may have: unknown, hidden
 * and repeated widgets are dropped, bad settings fall back to defaults.
 * Nothing saved -> every visible widget in registry order.
 */
export function normalizeLayout(
  saved: unknown,
  role: string | null | undefined,
): DashboardWidget[] {
  const parsed = dashboardLayoutSchema.safeParse(saved);
  if (!parsed.success) {
    return widgetTypes
      .filter((type) => canSeeWidget(role, type))
      .map((type) => ({ id: type, settings: defaultSettings(type) }));
  }

  const seen = new Set<string>();
  const widgets: DashboardWidget[] = [];
  for (const widget of parsed.data.widgets) {
    if (!(widget.id in definitions) || seen.has(widget.id)) continue;
    const type = widget.id as WidgetType;
    if (!canSeeWidget(role, type)) continue;
    seen.add(type);
    const settings = definitions[type].settings.safeParse(widget.settings);
    widgets.push({
      id: type,
      settings: settings.success ? settings.data : defaultSettings(type),
    });
  }
  return widgets;
}

/** Widgets the role may add that are not on the dashboard yet. */
export function availableWidgets(
  layout: DashboardWidget[],
  role: string | null | undefined,
): WidgetType[] {
  const used = new Set(layout.map((widget) => widget.id));
  return widgetTypes.filter(
    (type) => !used.has(type) && canSeeWidget(role, type),
  );
}

/** Period ending on the latest loaded sales day (the warehouse lags ~1 day). */
export function resolvePeriod(
  period: SalesPeriod,
  latestDay: string,
): { from: string; to: string } {
  const from = {
    wtd: startOfWeek(latestDay),
    mtd: `${latestDay.slice(0, 8)}01`,
    ytd: `${latestDay.slice(0, 4)}-01-01`,
    last7: shiftDays(latestDay, -6),
    last30: shiftDays(latestDay, -29),
  }[period];
  return { from, to: latestDay };
}
