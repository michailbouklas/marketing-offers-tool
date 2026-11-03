import { error, json } from "@sveltejs/kit";
import { exportCsvAsXlsx } from "$lib/server/csv-to-xlsx.server";
import { exploreOrdersExportRequestSchema } from "$lib/services/sales-explore";
import {
  requireExploreRequest,
  writeOrderLinesCsv,
} from "$lib/services/sales-explore.server";
import type { RequestHandler } from "./$types";

/**
 * Excel of the orders selected in the grid: every line, with the order
 * columns repeated so the sheet filters and pivots on its own. Uses all
 * scoped brands (like the order dialog); other brands' pks drop out.
 */
export const POST: RequestHandler = async (event) => {
  const { scope, body } = await requireExploreRequest(
    event,
    exploreOrdersExportRequestSchema,
  );
  const pks = [...new Set(body.pks)];
  try {
    const result = await exportCsvAsXlsx(
      `orders-${pks.length}-selected`,
      (csvPath) => writeOrderLinesCsv(scope.brands, pks, csvPath),
    );
    return json({ downloadUrl: result.downloadUrl });
  } catch (cause) {
    console.error(`[sales-explore] selected-orders export failed:`, cause);
    error(500, "The Excel export could not be generated");
  }
};
