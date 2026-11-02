import { redirect } from "@sveltejs/kit";
import { requirePermission } from "$lib/server/auth-guards";
import {
  getSalesDashboardOptions,
  getSalesDayBrandRows,
  resolveSalesDashboardScope,
} from "$lib/services/sales-dashboard.server";
import type { SalesDashboardView } from "$lib/services/sales-dashboard";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
  const { user } = await requirePermission(event, { sales: ["view"] });
  if (!user) redirect(302, "/login");
  const view: SalesDashboardView =
    event.url.searchParams.get("view") === "table" ? "table" : "chart";
  const scope = await resolveSalesDashboardScope(event, user.id);

  if (!scope) {
    return { view, scope: null };
  }

  const [rows, options] = await Promise.all([
    getSalesDayBrandRows(scope.filters),
    getSalesDashboardOptions(scope.filters),
  ]);

  return { view, scope, rows, ...options };
};
