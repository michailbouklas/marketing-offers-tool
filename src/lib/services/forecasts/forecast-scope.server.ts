import { error, type RequestEvent } from "@sveltejs/kit";
import type { AppPermissions } from "$lib/auth/permissions";
import {
  getAuthenticatedUserRole,
  requireApiPermission,
  requirePermission,
} from "$lib/server/auth-guards";
import {
  listScopedBrands,
  type ScopedBrand,
} from "$lib/server/brand-scope.server";
import {
  parseForecastFilters,
  type ForecastFilters,
  type ForecastModel,
} from "./forecast-types";

/** Permission every `/forecasts` page and `/api/forecasts/*` route requires. */
export const FORECASTS_PERMISSION = {
  forecasts: ["view"],
} as const satisfies AppPermissions;

/**
 * `page` guards redirect to `/` (302) like every other page load; `api`
 * guards throw 401/403 so route handlers return JSON errors instead.
 */
export type ForecastGuard = "page" | "api";

export type ForecastBrandScope = {
  userId: string;
  /** Every brand the user may forecast (parity with Sales Chat scope). */
  brands: ScopedBrand[];
  /** The requested brand, or null when no alias was requested. */
  brand: ScopedBrand | null;
};

function normaliseAlias(alias: string | null | undefined): string {
  return alias?.trim().toLowerCase() ?? "";
}

/**
 * Enforces the `forecasts: ["view"]` permission and resolves the requested
 * brand alias against the caller's brand scope (`listScopedBrands`: admins and
 * super users see every active brand, everyone else only their assignments).
 *
 * - `requestedAlias` null/empty → `brand: null` (caller decides the default).
 * - alias not in scope → 403 "This brand is not assigned to you." — a 403
 *   rather than a 404 so we never reveal whether the brand exists.
 *
 * Aliases are compared trimmed and lowercased; the returned `brand` always
 * carries the stored alias. This helper never widens the scope: unlike
 * `getSelectedBrandAliases` elsewhere, an out-of-scope request fails closed.
 */
export async function resolveForecastBrand(
  event: RequestEvent,
  requestedAlias: string | null | undefined,
  options: { guard: ForecastGuard },
): Promise<ForecastBrandScope> {
  const { user } =
    options.guard === "page"
      ? await requirePermission(event, FORECASTS_PERMISSION)
      : await requireApiPermission(event, FORECASTS_PERMISSION);

  if (!user) {
    // `requirePermission` only reaches here with a session; keep the type narrow.
    error(401, "Unauthorized");
  }

  const role = await getAuthenticatedUserRole(event);
  const brands = await listScopedBrands({ id: user.id, role });

  const wanted = normaliseAlias(requestedAlias);
  if (wanted.length === 0) {
    return { userId: user.id, brands, brand: null };
  }

  const brand =
    brands.find((candidate) => normaliseAlias(candidate.alias) === wanted) ??
    null;

  if (!brand) {
    error(403, "This brand is not assigned to you.");
  }

  return { userId: user.id, brands, brand };
}

export type ForecastPageContext = ForecastBrandScope & {
  /**
   * URL filters with `brand` normalised to the resolved brand's stored alias
   * (or the first scoped brand when the URL named none; null when the user
   * has no brands at all).
   */
  filters: ForecastFilters;
};

/**
 * Shared page-load helper for `/forecasts`, `/forecasts/compare` and
 * `/forecasts/[modelId]`.
 *
 * 1. Parses `?brand=&models=&horizon=` with `parseForecastFilters` against the
 *    engine catalog (`models`, from the layout's `listForecastModels()` — pass
 *    `[]` when the engine is unavailable; model ids then resolve to none).
 * 2. Resolves the brand with the `page` guard: no permission → 302 `/`;
 *    a bookmarked alias outside the user's scope → 403 page.
 * 3. When the URL names no brand, defaults to the first scoped brand so the
 *    page can render immediately; `filters.brand` is rewritten to the stored
 *    alias of the resolved brand (or null when the user has no brands).
 *
 * @example
 * export const load: PageServerLoad = async (event) => {
 *   const { models } = await event.parent();
 *   const { brands, brand, filters } = await loadForecastPageContext(event, models);
 *   return { brands, brand, filters };
 * };
 */
export async function loadForecastPageContext(
  event: RequestEvent,
  models: ForecastModel[],
): Promise<ForecastPageContext> {
  const parsed = parseForecastFilters(event.url.searchParams, models);
  const scope = await resolveForecastBrand(event, parsed.brand, {
    guard: "page",
  });

  const brand = scope.brand ?? scope.brands[0] ?? null;

  return {
    ...scope,
    brand,
    filters: { ...parsed, brand: brand?.alias ?? null },
  };
}
