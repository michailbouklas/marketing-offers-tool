import { redirect } from "@sveltejs/kit";
import { requirePermission } from "$lib/server/auth-guards";
import {
  buildConsolidatedReport,
  parseConsolidatedExtras,
} from "$lib/services/sales-consolidated";
import {
  getConsolidatedOptions,
  getConsolidatedRows,
} from "$lib/services/sales-consolidated.server";
import { resolveSalesDashboardScope } from "$lib/services/sales-dashboard.server";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
  const { user } = await requirePermission(event, { sales: ["view"] });
  if (!user) redirect(302, "/login");
  const scope = await resolveSalesDashboardScope(event, user.id);

  if (!scope) {
    return { scope: null };
  }

  const extras = parseConsolidatedExtras(event.url.searchParams);
  const [rows, options] = await Promise.all([
    getConsolidatedRows(scope.filters, extras),
    getConsolidatedOptions(scope.filters),
  ]);

  return {
    scope,
    extras,
    report: buildConsolidatedReport(rows),
    ...options,
  };
};
