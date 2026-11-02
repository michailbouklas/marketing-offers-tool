import { error, json } from "@sveltejs/kit";
import { exportCsvAsXlsx } from "$lib/server/csv-to-xlsx.server";
import {
  EXPLORE_EXPORT_MAX_ROWS,
  exploreExportRequestSchema,
} from "$lib/services/sales-explore";
import {
  countExploreRows,
  requireExploreRequest,
  writeExploreCsv,
} from "$lib/services/sales-explore.server";
import type { RequestHandler } from "./$types";

/**
 * Excel of exactly what the grid shows: same URL window, same column filters
 * and sort, re-queried server-side. ClickHouse streams CSV, officecli imports
 * it into an .xlsx; the browser then follows the returned download URL.
 */
export const POST: RequestHandler = async (event) => {
  const { scope, body } = await requireExploreRequest(
    event,
    exploreExportRequestSchema,
  );
  const total = await countExploreRows(scope.filters, body.filter, body.offers);
  if (total === 0) {
    error(400, "No orders match the current filters");
  }
  if (total > EXPLORE_EXPORT_MAX_ROWS) {
    error(
      413,
      `${total.toLocaleString("en-GB")} orders match; the export limit is ${EXPLORE_EXPORT_MAX_ROWS.toLocaleString("en-GB")}. Narrow the filters or date range.`,
    );
  }

  const { from, to } = scope.filters;
  const startedAt = Date.now();
  try {
    const result = await exportCsvAsXlsx(`orders-${from}-to-${to}`, (csvPath) =>
      writeExploreCsv(scope.filters, scope.brands, body, csvPath),
    );
    console.log(
      `[sales-explore] export ${total} row(s), ${result.bytes} bytes in ${Date.now() - startedAt}ms`,
    );
    return json({ downloadUrl: result.downloadUrl, rows: total });
  } catch (cause) {
    console.error(`[sales-explore] export failed:`, cause);
    error(500, "The Excel export could not be generated");
  }
};
