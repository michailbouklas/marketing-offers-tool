import { listScopedBrands } from "$lib/server/brand-scope.server";
import { listBrandsForUser } from "$lib/services/brands.server";
import { getOpenGapList } from "$lib/services/offers-data-quality.server";
import {
  buildSalesDashboard,
  resolveSalesDashboardFilters,
  salesDashboardSearch,
  type SalesDashboardFilters,
} from "$lib/services/sales-dashboard";
import {
  getLatestSalesDay,
  getSalesDailyTotals,
} from "$lib/services/sales-dashboard.server";
import { buildDeliveryDashboard } from "$lib/services/sales-delivery";
import { getDeliveryDayRows } from "$lib/services/sales-delivery.server";
import type { OfferVerdict } from "$lib/services/sales-offers";
import { getOfferValuesForRange } from "$lib/services/sales-offers.server";
import {
  getLatestReleaseId,
  getReleaseDetail,
} from "$lib/services/releases/releases.server";
import {
  resolvePeriod,
  type DashboardWidget,
  type DeliveryWidgetData,
  type GapsWidgetData,
  type OffersWidgetData,
  type SalesScoped,
  type SalesWidgetData,
  type SalesWidgetSettings,
  type WidgetDataMap,
  type WidgetResult,
  type WidgetType,
} from "$lib/dashboard/widgets";

export type DashboardContext = { userId: string; role: string | null };

const LIST_SIZE = 10;

async function gapWidget(
  ctx: DashboardContext,
  status: "open" | "submitted",
): Promise<GapsWidgetData | null> {
  const brands = await listBrandsForUser(ctx.userId);
  if (brands.length === 0) return null;

  const page = await getOpenGapList(1, LIST_SIZE, {
    brandAliases: brands.map((brand) => brand.alias),
    statuses: [status],
    sortBy: "detected_at",
    sortDir: "desc",
  });
  return {
    href:
      status === "submitted"
        ? "/offers-data-quality?status=submitted"
        : "/offers-data-quality",
    total: page.totalItems,
    items: page.items.map(({ dq_id, trde_item, item_name, brand, status }) => ({
      dq_id,
      trde_item,
      item_name,
      brand,
      status,
    })),
  };
}

/** Brands the sales widgets may show (admins: every active brand), by name. */
export async function listSalesBrands(
  ctx: DashboardContext,
): Promise<{ alias: string; name: string }[]> {
  return (await listScopedBrands({ id: ctx.userId, role: ctx.role }))
    .map((brand) => ({
      alias: brand.alias.toLowerCase(),
      name: brand.name || brand.alias,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Brand + period -> validated sales filters. The brand setting is only honoured
 * when it is in the user's scope, else the first scoped brand by name, like
 * /sales/dashboard.
 */
async function salesScope(
  ctx: DashboardContext,
  settings: SalesWidgetSettings,
): Promise<{ filters: SalesDashboardFilters; brandName: string } | null> {
  const scoped = await listSalesBrands(ctx);
  if (scoped.length === 0) return null;

  const brand =
    scoped.find((option) => option.alias === settings.brand) ?? scoped[0];
  const { from, to } = resolvePeriod(
    settings.period,
    await getLatestSalesDay([brand.alias]),
  );
  const filters = resolveSalesDashboardFilters(
    new URLSearchParams({ brands: brand.alias, from, to }),
    scoped.map((option) => option.alias),
    to,
  );
  return { filters, brandName: brand.name };
}

function scoped(
  path: string,
  scope: { filters: SalesDashboardFilters; brandName: string },
): SalesScoped {
  return {
    href: `${path}?${salesDashboardSearch(scope.filters, { allBrands: false })}`,
    brandName: scope.brandName,
    from: scope.filters.from,
    to: scope.filters.to,
  };
}

async function salesWidget(
  ctx: DashboardContext,
  settings: SalesWidgetSettings,
): Promise<SalesWidgetData | null> {
  const scope = await salesScope(ctx, settings);
  if (!scope) return null;
  // shortcut: reuses the /sales/dashboard query, which reads 10 years of daily totals; add a range-only query if this widget gets slow.
  const days = await getSalesDailyTotals(scope.filters);
  return {
    ...scoped("/sales/dashboard", scope),
    range: buildSalesDashboard(days, scope.filters.from, scope.filters.to)
      .range,
  };
}

async function deliveryWidget(
  ctx: DashboardContext,
  settings: SalesWidgetSettings,
): Promise<DeliveryWidgetData | null> {
  const scope = await salesScope(ctx, settings);
  if (!scope) return null;
  const { brands, from, to } = scope.filters;
  const dashboard = buildDeliveryDashboard({
    days: await getDeliveryDayRows(brands, from, to),
    locations: [],
    from,
    to,
    channel: null,
  });
  return {
    ...scoped("/sales/delivery", scope),
    range: dashboard.range,
    channels: dashboard.channels,
  };
}

async function offersWidget(
  ctx: DashboardContext,
  settings: SalesWidgetSettings,
): Promise<OffersWidgetData | null> {
  const scope = await salesScope(ctx, settings);
  if (!scope) return null;
  const { brands, from, to } = scope.filters;
  // Live, not the cache: the cache only holds all-time values.
  const { offers } = await getOfferValuesForRange(brands[0], { from, to });
  const verdicts: Partial<Record<OfferVerdict, number>> = {};
  for (const offer of offers) {
    verdicts[offer.verdict] = (verdicts[offer.verdict] ?? 0) + 1;
  }
  return {
    ...scoped("/sales/offers", scope),
    verdicts,
    top: [...offers]
      .sort((a, b) => b.offerNet - a.offerNet)
      .slice(0, 5)
      .map(({ code, name, orders, offerNet, verdict }) => ({
        code,
        name,
        orders,
        offerNet,
        verdict,
      })),
  };
}

const loaders: {
  [K in WidgetType]: (
    ctx: DashboardContext,
    settings: Record<string, unknown>,
  ) => Promise<WidgetDataMap[K]>;
} = {
  "open-gaps": (ctx) => gapWidget(ctx, "open"),
  "awaiting-approval": (ctx) => gapWidget(ctx, "submitted"),
  // Settings were parsed by normalizeLayout against the widget's schema.
  "sales-summary": (ctx, s) => salesWidget(ctx, s as SalesWidgetSettings),
  "delivery-summary": (ctx, s) => deliveryWidget(ctx, s as SalesWidgetSettings),
  "offers-summary": (ctx, s) => offersWidget(ctx, s as SalesWidgetSettings),
  "latest-release": async () => {
    const id = await getLatestReleaseId();
    return id === null ? null : getReleaseDetail(id);
  },
};

/**
 * Never rejects: a rejected streamed promise surfaces as an unhandled client
 * error instead of the widget's inline error.
 */
export async function loadWidget<K extends WidgetType>(
  ctx: DashboardContext,
  widget: DashboardWidget & { type: K },
): Promise<WidgetResult<WidgetDataMap[K]>> {
  try {
    return {
      data: await loaders[widget.type](ctx, widget.settings),
      error: null,
    };
  } catch (err) {
    console.error(
      `[dashboard] widget ${widget.type} (${widget.id}) failed:`,
      err instanceof Error ? err.message : err,
    );
    return { data: null, error: "Could not load this widget." };
  }
}
