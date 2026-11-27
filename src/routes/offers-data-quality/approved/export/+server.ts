import { error, json } from "@sveltejs/kit";
import { appendFile, writeFile } from "node:fs/promises";
import { requireAuthenticatedApiUser } from "$lib/server/auth-guards";
import { exportCsvAsXlsx } from "$lib/server/csv-to-xlsx.server";
import {
  approvedOfferCsvLine,
  approvedOffersCsvHeader,
  offerSalesKey,
} from "$lib/services/offers-data-quality";
import { forEachApprovedOfferChunk } from "$lib/services/offers-data-quality.server";
import { listCachedOfferSales } from "$lib/services/offers-data-quality-postgres.server";
import { normalizeBrandAlias } from "$lib/services/offers-data-quality-snapshot";
import type { RequestHandler } from "./$types";
import { readApprovedOffersQuery } from "../filters.server";

/**
 * Excel of every approved offer matching the page's filters (not just the
 * visible page). Rows are read in chunks and appended to one CSV that
 * officecli imports in a single pass, so there is no cell or row cap here.
 */
export const POST: RequestHandler = async (event) => {
  const { user } = requireAuthenticatedApiUser(event);
  const { selectedBrandAliases, filters } = await readApprovedOffersQuery(
    event.url,
    user.id,
  );

  try {
    let rows = 0;
    // Lifetime POS sales per offer from the nightly /sales/offers cache.
    const sales = await listCachedOfferSales(
      selectedBrandAliases.map(normalizeBrandAlias),
    );
    const result = await exportCsvAsXlsx(
      `approved-offers-${new Date().toISOString().slice(0, 10)}`,
      async (csvPath) => {
        await writeFile(csvPath, `${approvedOffersCsvHeader}\n`, "utf8");
        rows = await forEachApprovedOfferChunk(
          selectedBrandAliases,
          filters,
          (offers) =>
            appendFile(
              csvPath,
              `${offers
                .map((offer) =>
                  approvedOfferCsvLine(
                    offer,
                    sales.get(offerSalesKey(offer.brand, offer.trde_item)),
                  ),
                )
                .join("\n")}\n`,
              "utf8",
            ),
        );
      },
    );
    return json({ downloadUrl: result.downloadUrl, rows });
  } catch (cause) {
    console.error("[offers-data-quality] approved export failed:", cause);
    error(500, "The Excel export could not be generated");
  }
};
