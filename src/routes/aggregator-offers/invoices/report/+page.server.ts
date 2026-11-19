import { requirePermission } from "$lib/server/auth-guards";
import { buildMktReport } from "$lib/services/aggregator-invoices/mkt-report";
import {
  getMktReportRows,
  getMktReportStores,
} from "$lib/services/aggregator-invoices/mkt-report.server";
import type { PageServerLoad } from "./$types";
import { resolveMktReportFilters } from "./filters.server";

export const load: PageServerLoad = async (event) => {
  await requirePermission(event, { aggregatorInvoices: ["view"] });

  const { params, brands, filters } = await resolveMktReportFilters(event.url);
  const [rows, stores] = await Promise.all([
    getMktReportRows(filters),
    getMktReportStores(filters.aggregators, filters.projectCodes),
  ]);

  return { params, brands, stores, report: buildMktReport(rows) };
};
